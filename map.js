import { createPopupContent } from './elaborazione_stat_data/popup.js';
import { DataProcessor } from './elaborazione_stat_data/elaborazione_stat_data.js';
import { DemograficaProcessor ,} from './elaborazione_demografica/elaborazione_demografica_2021.js';
import { createPopupContentDemografica } from './elaborazione_demografica/popup_demografica.js';
import { getRepoBasePath } from './utils.js';

const base = getRepoBasePath(); 


class MapManager {
  constructor() {
    this.map = L.map("map").setView([40.8522, 14.2681], 12);
    this.geojsonLayer = null;
    this.dataProcessor = null;
    this.currentFileType = null;
    this.layers = {};
    this.initBaseMap();
  }

  async initBaseMap() {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    const [asc, comuni] = await Promise.all([
      fetch(base + "data/asc.geojson").then(res => res.json()),
      fetch(base + "data/comuni.geojson").then(res => res.json())
    ]);

    this.geojson = asc;
    this.municipalitiesGeoJSON = comuni;

    // Inizializza comunque con DataProcessor, in attesa di dati reali
    this.dataProcessor = new DataProcessor();
    await this.dataProcessor.load();
  }

  async updateMap(fields = [], fileType = 'stat_data') {

    // Carica il processore corretto se cambia fileType
    if (this.currentFileType !== fileType) {
      this.currentFileType = fileType;

      if (fileType === 'demografica') {
        this.dataProcessor = new DemograficaProcessor();
      } else {
        this.dataProcessor = new DataProcessor();
      }

      await this.dataProcessor.load();
    }

    if (this.geojsonLayer) this.map.removeLayer(this.geojsonLayer);
    this.geojsonLayer = L.layerGroup();

    const dataLayer = this.dataProcessor.groupByMunicipality ? this.municipalitiesGeoJSON : this.geojson;

    fields.forEach(field => {
      const { min, max } = this.dataProcessor.getRange(field);

      const layer = L.geoJSON(dataLayer, {
        filter: feature => {
          const val = this.dataProcessor.getValue(feature, field);
          return !isNaN(val) && val > 0;
        },
        style: feature => {
          const val = this.dataProcessor.getValue(feature, field);
          const color = this.getColor(val, min, max);
          return {
            fillColor: color,
            weight: 1,
            color: "#666",
            fillOpacity: val > 0 ? 0.8 : 0.1,
          };
        },
        onEachFeature: (feature, layer) => {
          const popupData = this.dataProcessor.getPopupData(feature, fields);
          console.log("🧩 MAP: onEachFeature", {
            feature: feature.properties.COM_ASC1 || feature.properties.Name,
            fieldList: fields,
            popupData
          });
        
          if (popupData) {
            if (this.currentFileType === 'stat_data') {
            
              const popupContent = createPopupContent({
                rawName: feature.properties.Name || feature.properties.name || "",
                fieldsArray: fields,
                rowData: popupData.values.reduce((acc, { field, value }) => {
                  acc[field] = value;
                  return acc;
                }, {}),
                dataSource: this.dataProcessor.data,
                group: this.dataProcessor.groupByMunicipality ? 'municipality' : 'standard'
              });
            
              layer.bindPopup(popupContent, { maxWidth: 600, minWidth: 400 });
            
            } else if (this.currentFileType === 'demografica') {
            
              const popupContent = createPopupContentDemografica({
                rawName: feature.properties.Name || feature.properties.name || "",
                fieldsArray: fields,
                rowData: {
                  ...popupData.values.reduce((acc, { field, value }) => {
                    acc[field] = value;
                    return acc;
                  }, {}),
                  ASC_1LIV_COD: popupData.ASC_1LIV_COD 
                },
                dataSource: this.dataProcessor.data,
                group: this.dataProcessor.groupByMunicipality ? 'municipality' : 'standard'
              });              
            
              layer.bindPopup(popupContent, { maxWidth: 600, minWidth: 400 });

              layer.on('popupopen', () => {
              
                try {
                  if (this.currentFileType === 'demografica') {
                    const container = document.querySelector("#demograficaChart");
                    if (!container) {
                      console.warn("⚠️ Nessun contenitore #demograficaChart trovato nel popup.");
                      return;
                    }
              
                    // Log dei dati per debugging
              
                    window.chartManagerDemografica?.createGradientBarChart(popupData.values, container);
                  }
                } catch (err) {
                  console.error("❌ Errore durante la generazione del grafico demografico:", err);
                }
              });              
            
            } else {
              console.log("🛑 MAP: Salto popup per fileType", this.currentFileType);
            }            
          } else {
            console.warn("⚠️ MAP: popupData nullo per", feature.properties);
          }
        }        
      });

      this.layers[field] = layer;
      layer.addTo(this.geojsonLayer);
    });

    this.geojsonLayer.addTo(this.map);
  }

  setupGroupingToggle() {
    document.getElementById('group-by-municipality').addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dataProcessor.setGrouping(checked);
      this.updateMap(window.selectedFields || [], this.currentFileType);
    });
  }

  getColor(value, min, max) {
    if (!value || value <= 0 || isNaN(value)) return "transparent";
    const t = (value - min) / (max - min);
    const r = Math.round(180 + 75 * t);
    const opacity = 0.2 + 0.6 * t;
    return `rgba(${r}, 0, 0, ${opacity})`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.mapManager = new MapManager();
  window.mapManager.setupGroupingToggle();
});
