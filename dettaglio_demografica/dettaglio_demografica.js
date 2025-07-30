import { DemograficaProcessor } from "../elaborazione_demografica/elaborazione_demografica_2021.js";

class DettaglioDemografica {
  constructor() {
    this.map = null;
    this.processor = new DemograficaProcessor();
    this.currentChartType = "bar";
    this.isChartExpanded = false;
  }

  async init() {
    const params = new URLSearchParams(window.location.search);
    this.featureName = params.get("feature");
    this.featureCode = params.get("code");
    this.groupByMunicipality = params.get("group") === "municipality";

    if (!this.featureName || !this.featureCode) {
      console.error("Parametri URL mancanti");
      return;
    }

    document.getElementById("detail-title").textContent = this.featureName;
    await this.processor.load();
    await this.loadMap();

    this.chartContainer = document.getElementById("detail-chart");
    await this.renderChart();

    this.initControls();
  }

  async loadMap() {
    const geojson = await fetch("../data/asc.geojson").then((res) => res.json());
    const feature = geojson.features.find(f =>
      f.properties.COM_ASC1?.toString().trim() === this.featureCode.trim()
    );

    if (!feature) {
      console.warn("Feature non trovata:", this.featureCode);
      return;
    }

    const bounds = L.geoJSON(feature).getBounds();
    this.map = L.map("detail-map").fitBounds(bounds);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: "abcd",
      maxZoom: 18
    }).addTo(this.map);

    L.geoJSON(geojson, {
      style: {
        fillColor: "#666",
        weight: 1,
        color: "#333",
        fillOpacity: 0.5
      },
      onEachFeature: (f, layer) => {
        if (f.properties.COM_ASC1?.toString().trim() === this.featureCode) {
          layer.setStyle({
            fillColor: "#b00",
            weight: 2,
            fillOpacity: 0.7
          });
        }
      }
    }).addTo(this.map);

    L.geoJSON(feature, {
      style: {
        fillColor: "#b00",
        weight: 2,
        color: "#333",
        fillOpacity: 0.7
      }
    }).addTo(this.map);

    this.map.fitBounds(bounds.pad(0.3));
  }

  async renderChart() {
    this.chartContainer.innerHTML = "";
    const fields = Object.keys(this.processor.dataMap?.[this.featureCode] || {})
      .filter(k => k !== "ASC_1LIV_COD" && k !== "comune");

    const values = fields.map(field => {
      const val = this.processor.getValue({ properties: { COM_ASC1: this.featureCode } }, field);
      const avg = this.getAverage(field);
      return val !== null && avg > 0
        ? { field, currentValue: val, averageValue: avg }
        : null;
    }).filter(Boolean);

    values.sort((a, b) => (b.currentValue / b.averageValue) - (a.currentValue / a.averageValue));

    if (this.currentChartType === "bar") {
      await window.chartManagerDemografica.createGradientBarChart(values, this.chartContainer);
    } else {
      await window.detailChartDemografica.createTrendChart(
        fields,
        this.featureCode,
        this.chartContainer
      );
    }

    this.chartContainer.style.height = this.isChartExpanded ? "80vh" : "400px";

    this.createValueGrid(values);
    this.initSearch();
  }

  getAverage(field) {
    const values = Object.values(this.processor.dataMap)
      .map(row => parseFloat(row[field]))
      .filter(val => !isNaN(val));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1;
  }

  initControls() {
    document.querySelectorAll(".chart-toggle-buttons button").forEach(btn => {
      if (btn.classList.contains("expand-chart")) return;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-toggle-buttons button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentChartType = btn.dataset.chart;
        this.renderChart();
      });
    });

    const expandBtn = document.querySelector(".expand-chart");
    expandBtn.addEventListener('click', () => {
      this.isChartExpanded = !this.isChartExpanded;
      document.querySelector('.chart-section').classList.toggle('expanded');
      document.body.classList.toggle('chart-expanded'); 
      expandBtn.textContent = this.isChartExpanded ? 'Comprimi ▲' : 'Espandi ▼';
      this.renderChart();
    });
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

  initSearch() {
    const input = document.getElementById('value-search');
    input.addEventListener('input', e => {
      const term = e.target.value.toLowerCase();
      const cards = document.querySelectorAll('.value-card');
      cards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        card.style.display = title.includes(term) ? 'block' : 'none';
      });
    });
  }  
}


document.addEventListener("DOMContentLoaded", () => {
  const dettaglio = new DettaglioDemografica();
  dettaglio.init();
});


