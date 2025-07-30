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
        
        if (this.featureData.properties?.comune) {
            document.getElementById('detail-location').textContent = `Comune: ${this.featureData.properties.comune}`;
        }
    }

    async loadData() {
        const [csvText, geojson, municipalitiesGeoJSON] = await Promise.all([
            fetch(`${getRepoBasePath()}data/stat_data.csv`).then(res => res.text()),
            fetch(`${getRepoBasePath()}data/asc.geojson`).then(res => res.json()),
            fetch(`${getRepoBasePath()}data/comuni.geojson`).then(res => res.json())
        ]);

        this.csvData = Papa.parse(csvText, { header: true }).data;
        this.geojson = geojson;
        this.municipalitiesGeoJSON = municipalitiesGeoJSON;

        this.allFields = this.csvData.length > 0 
            ? Object.keys(this.csvData[0]).filter(k => k !== 'nome' && k !== 'comune')
            : [];
    }

    findFeatureData(featureName) {
        const normalizedKey = this.normalizeName(featureName);
        
        if (this.groupByMunicipality) {
            return this.municipalitiesGeoJSON.features.find(f => 
                this.normalizeName(f.properties.name) === normalizedKey
            );
        } else {
            return this.geojson.features.find(f => 
                this.normalizeName(f.properties.name) === normalizedKey
            );
        }
    }

    initMap() {
        const featureBounds = L.geoJSON(this.featureData).getBounds();
        this.map = L.map('detail-map').fitBounds(featureBounds);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        L.geoJSON(this.geojson, {
            style: {
                fillColor: '#666',
                weight: 1,
                color: '#333',
                fillOpacity: 0.5
            },
            onEachFeature: (feature, layer) => {
                if (this.normalizeName(feature.properties.name) === this.normalizeName(this.currentFeatureName)) {
                    layer.setStyle({
                        fillColor: '#b00',
                        weight: 2,
                        fillOpacity: 0.7
                    });
                }
            }
        }).addTo(this.map);

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
                this.normalizeName(d.comune) === normalizedKey
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
            row = this.csvData.find(d => 
                this.normalizeName(d.nome) === normalizedKey
            );
            
            if (!row) {
                document.getElementById('detail-chart').innerHTML = '<p>Nessun dato disponibile per questa feature</p>';
                return;
            }
        }

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
        return name
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