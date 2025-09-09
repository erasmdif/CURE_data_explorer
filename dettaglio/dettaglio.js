import { getRepoBasePath } from "../utils.js";

class DetailPage {
  constructor() {
    this.map = null;
    this.chart = null;
    this.featureData = null;
    this.allFields = [];
    this.currentFeatureName = '';
    this.csvData = [];
    this.currentChartData = null;
    this.isChartExpanded = false;
    this.currentChartType = 'bar';

    // nuovi holder
    this.geoNapoli = null;
    this.geoTrento = null;
    this.geoGenova = null;
    this.geojson = null;          // FeatureCollection combinato usato come “basemap” di dettaglio
    this.municipalitiesGeoJSON = null;
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const featureName = urlParams.get('feature');
    const groupByMunicipality = urlParams.get('group') === 'municipality';

    if (!featureName) {
      console.error('Nessuna feature specificata');
      return;
    }

    this.currentFeatureName = featureName;
    this.groupByMunicipality = groupByMunicipality;

    await this.loadData();
    this.featureData = this.findFeatureData(featureName);
    
    if (!this.featureData) {
      console.error('Feature non trovata');
      document.getElementById('detail-title').textContent = featureName || '(sconosciuto)';
      document.getElementById('detail-type').textContent = this.groupByMunicipality ? 'Comune' : 'Area';
      document.getElementById('detail-chart').innerHTML = '<p>Nessun dato disponibile per questa feature</p>';
      return;
    }

    this.initUI();
    this.initMap();
    await this.initChart();
    this.initChartControls();
    this.initSearch();
  }

  initUI() {
    document.getElementById('detail-title').textContent = this.currentFeatureName;
    document.getElementById('detail-type').textContent = this.groupByMunicipality ? 'Comune' : 'Area';

    // prova a mostrare il comune: prima dalle props della feature, poi dal CSV
    const comuneProp = this.featureData.properties?.comune;
    if (comuneProp) {
      document.getElementById('detail-location').textContent = `Comune: ${comuneProp}`;
    } else {
      const normalizedKey = this.normalizeName(this.currentFeatureName);
      const row = this.csvData.find(d => this.normalizeName(d?.nome) === normalizedKey);
      if (row?.comune) {
        document.getElementById('detail-location').textContent = `Comune: ${row.comune}`;
      }
    }
  }

  async loadData() {
    const base = getRepoBasePath();
    const safeFC = (fc) => (fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features))
      ? fc
      : { type: 'FeatureCollection', features: [] };

    const [
      csvText,
      ascNapoli,
      ascTrento,
      ascGenova,
      municipalitiesGeoJSON
    ] = await Promise.all([
      fetch(`${base}data/stat_data.csv`).then(res => res.text()),
      fetch(`${base}data/asc.geojson`).then(res => res.json()),
      fetch(`${base}data/asc_trento.geojson`).then(res => res.json()).catch(() => null),
      fetch(`${base}data/asc_genova.geojson`).then(res => res.json()).catch(() => null),
      fetch(`${base}data/comuni.geojson`).then(res => res.json())
    ]);

    this.csvData = Papa.parse(csvText, { header: true }).data;

    this.geoNapoli = safeFC(ascNapoli);
    this.geoTrento = safeFC(ascTrento);
    this.geoGenova = safeFC(ascGenova);
    this.municipalitiesGeoJSON = safeFC(municipalitiesGeoJSON);

    // FeatureCollection combinato per il rendering di contesto
    this.geojson = {
      type: 'FeatureCollection',
      features: [
        ...(this.geoNapoli?.features || []),
        ...(this.geoTrento?.features || []),
        ...(this.geoGenova?.features || [])
      ]
    };

    // campi numerici disponibili
    this.allFields = this.csvData.length > 0 
      ? Object.keys(this.csvData[0]).filter(k => k !== 'nome' && k !== 'comune')
      : [];
  }

  findFeatureData(featureName) {
    const normalizedKey = this.normalizeName(featureName);

    // Se raggruppo per Comune → cerco nel layer comuni
    if (this.groupByMunicipality) {
      return this.municipalitiesGeoJSON.features.find(f =>
        this.normalizeName(f.properties?.Name || f.properties?.name) === normalizedKey
      );
    }

    // Altrimenti cerco nelle tre città (Napoli/Trento/Genova)
    const sources = [this.geoNapoli, this.geoTrento, this.geoGenova].filter(Boolean);
    for (const fc of sources) {
      const hit = fc.features.find(f =>
        this.normalizeName(f.properties?.Name || f.properties?.name) === normalizedKey
      );
      if (hit) return hit;
    }
    return null;
  }

  initMap() {
    const featureBounds = L.geoJSON(this.featureData).getBounds();
    this.map = L.map('detail-map').fitBounds(featureBounds);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    // contesto: tutte le aree note (somma dei 3 geojson)
    L.geoJSON(this.geojson, {
      style: {
        fillColor: '#666',
        weight: 1,
        color: '#333',
        fillOpacity: 0.5
      },
      onEachFeature: (feature, layer) => {
        if (this.normalizeName(feature.properties?.Name || feature.properties?.name) === this.normalizeName(this.currentFeatureName)) {
          layer.setStyle({
            fillColor: '#b00',
            weight: 2,
            fillOpacity: 0.7
          });
        }
      }
    }).addTo(this.map);

    // highlight della feature selezionata
    L.geoJSON(this.featureData, {
      style: {
        fillColor: '#b00',
        weight: 2,
        color: '#333',
        fillOpacity: 0.7
      }
    }).addTo(this.map);

    this.map.fitBounds(featureBounds.pad(0.3));
  }

  async initChart() {
    const normalizedKey = this.normalizeName(this.currentFeatureName);
    let row;

    if (this.groupByMunicipality) {
      const comuneData = this.csvData.filter(d =>
        this.normalizeName(d?.comune) === normalizedKey
      );
      if (comuneData.length === 0) {
        document.getElementById('detail-chart').innerHTML = '<p>Nessun dato disponibile per questo comune</p>';
        return;
      }
      row = {};
      this.allFields.forEach(field => {
        const values = comuneData
          .map(d => parseFloat(d[field]))
          .filter(v => !isNaN(v));
        row[field] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      });
    } else {
      // match diretto sulla riga CSV per nome area
      row = this.csvData.find(d =>
        this.normalizeName(d?.nome) === normalizedKey
      );
      if (!row) {
        document.getElementById('detail-chart').innerHTML = '<p>Nessun dato disponibile per questa feature</p>';
        return;
      }
    }

    // medie globali (su tutto il CSV)
    const avgValues = {};
    this.allFields.forEach(field => {
      const values = this.csvData
        .map(d => parseFloat(d[field]))
        .filter(v => !isNaN(v));
      avgValues[field] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    });

    const chartData = this.allFields
      .filter(field => row[field] && !isNaN(parseFloat(row[field])))
      .map(field => ({
        field: field,
        currentValue: parseFloat(row[field]),
        averageValue: avgValues[field]
      }))
      .sort((a, b) => (b.currentValue / b.averageValue) - (a.currentValue / a.averageValue));

    if (chartData.length === 0) {
      document.getElementById('detail-chart').innerHTML = '<p>Nessun dato valido disponibile</p>';
      return;
    }

    this.currentChartData = chartData;
    this.createValueGrid(chartData);

    if (!window.chartManager) {
      window.chartManager = new ChartManager();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.renderChart();
  }

  async renderChart() {
    const container = document.getElementById('detail-chart');
    container.innerHTML = '';
    container.style.height = this.isChartExpanded ? '80vh' : '400px';
    
    if (this.currentChartType === 'bar') {
      await window.chartManager.createGradientBarChart(this.currentChartData, container);
    } else {
      await window.chartManager2.createLineChart(this.currentChartData, container);
    }
  }

  createValueGrid(chartData) {
    const gridContainer = document.getElementById('detail-values');
    gridContainer.innerHTML = '';
    
    chartData.forEach(item => {
      const card = document.createElement('div');
      card.className = 'value-card';
      
      const ratio = (item.currentValue / item.averageValue).toFixed(2);
      const percentage = Math.round((item.currentValue / item.averageValue) * 100);
      
      card.innerHTML = `
        <h3>${window.labelMap?.[item.field] || item.field}</h3>
        <div class="value">${item.currentValue.toFixed(2)}</div>
        <div class="meta">
          <span>${percentage}% della media</span>
          <span>${ratio}x</span>
        </div>
      `;
      
      gridContainer.appendChild(card);
    });
  }

  initChartControls() {
    // Pulsanti di switch
    const chartButtons = document.querySelectorAll('.chart-toggle-buttons button:not(.expand-chart)');
    chartButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentChartType = btn.dataset.chart;
        chartButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderChart();
      });
    });
  
    // Pulsante di espansione
    const expandBtn = document.querySelector('.expand-chart');
    expandBtn.addEventListener('click', () => {
      this.isChartExpanded = !this.isChartExpanded;
      document.querySelector('.chart-section').classList.toggle('expanded');
      document.body.classList.toggle('chart-expanded'); 
      expandBtn.textContent = this.isChartExpanded ? 'Comprimi ▲' : 'Espandi ▼';
      this.renderChart();
    });
  }

  initSearch() {
    const searchInput = document.getElementById('value-search');
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const cards = document.querySelectorAll('.value-card');
      
      cards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        card.style.display = title.includes(searchTerm) ? 'block' : 'none';
      });
    });
  }

  normalizeName(name) {
    if (!name) return '';
    return String(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.detailPage = new DetailPage();
  window.detailPage.init();
});
