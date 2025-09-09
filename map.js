import { createPopupContent } from './elaborazione_stat_data/popup.js';
import { DataProcessor } from './elaborazione_stat_data/elaborazione_stat_data.js';
import { DemograficaProcessor ,} from './elaborazione_demografica/elaborazione_demografica_2021.js';
import { createPopupContentDemografica } from './elaborazione_demografica/popup_demografica.js';
import { getRepoBasePath } from './utils.js';

const base = getRepoBasePath();

class MapManager {
  constructor() {
    this.map = L.map("map").setView([40.8522, 14.2681], 12);
    this.map.createPane('pane-asc');
    this.map.getPane('pane-asc').style.zIndex = 400;
    this.map.createPane('pane-hazards');
    this.map.getPane('pane-hazards').style.zIndex = 650;
    this.map.getPane('pane-hazards').style.mixBlendMode = 'multiply';

    this.geojsonLayer = null;
    this.dataProcessor = null;
    this.currentFileType = null;

    this.layers = {};
    this.geojsonByCity = {}; // { napoli, trento, genova }
    this.hazardLayer = L.layerGroup().addTo(this.map);
    this.hazardData = { idro: null, vulcani: null };

    // memorizzo l'ultima selezione per ri-render al cambio grouping
    this.lastFields = [];
    this.lastFileType = 'stat_data';

    this.initBaseMap();
  }

  async initBaseMap() {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    const [asc, comuni, ascTrento, ascGenova, idro, vulcani] = await Promise.all([
      fetch(base + "data/asc.geojson").then(res => res.json()),
      fetch(base + "data/comuni.geojson").then(res => res.json()),
      fetch(base + "data/asc_trento.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] })),
      fetch(base + "data/asc_genova.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] })),
      fetch(base + "data/idro.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] })),
      fetch(base + "data/vulcani.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] }))
    ]);

    this.geojson = asc;
    this.geojsonByCity = { napoli: asc, trento: ascTrento, genova: ascGenova };
    this.municipalitiesGeoJSON = comuni;

    // Dati rischi (usa sempre FC validi)
    this.hazardData = {
      idro: (idro && idro.type === 'FeatureCollection') ? idro : { type:'FeatureCollection', features: [] },
      vulcani: (vulcani && vulcani.type === 'FeatureCollection') ? vulcani : { type:'FeatureCollection', features: [] }
    };

    // Inizializza processor
    this.dataProcessor = new DataProcessor();
    await this.dataProcessor.load();
  }

  async updateMap(fields = [], fileType = 'stat_data') {
    // Memorizzo ultima selezione
    this.lastFields = Array.isArray(fields) ? fields.slice() : [];
    this.lastFileType = fileType || this.lastFileType;

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

    // === CITY TOGGLES ===
    const isDemografica = (this.currentFileType === 'demografica');
    const toggles = {
      napoli: document.getElementById('toggle-napoli')?.checked ?? true,
      trento: document.getElementById('toggle-trento')?.checked ?? false,
      genova: document.getElementById('toggle-genova')?.checked ?? false
    };
    // Per la demografica ignoriamo i toggle città (solo Napoli disponibile)
    const activeCities = isDemografica
      ? ['napoli']
      : Object.entries(toggles).filter(([_, v]) => v).map(([k]) => k);

    // Layer dati: se raggruppo per Comune uso il layer "comuni"
    const dataLayer = this.dataProcessor.groupByMunicipality ? this.municipalitiesGeoJSON : null;

    fields.forEach(field => {
      const cityTargets = this.dataProcessor.groupByMunicipality ? ['_grouped_'] : activeCities;

      cityTargets.forEach(cityKey => {
        const { min, max } = this.dataProcessor.getRange(field);

        const layerSource = this.dataProcessor.groupByMunicipality ? dataLayer : this.geojsonByCity[cityKey];
        if (!layerSource || !layerSource.features?.length) return;

        const layer = L.geoJSON(layerSource, {
          pane: 'pane-asc',
          filter: feature => {
            const val = this.dataProcessor.getValue(feature, field);
            return !isNaN(val) && val > 0;
          },
          style: feature => {
            const val = this.dataProcessor.getValue(feature, field);
            const color = this.getColor(val, min, max);
            return { fillColor: color, weight: 1, color: "#666", fillOpacity: val > 0 ? 0.45 : 0.12 };
          },
          onEachFeature: (feature, layer) => {
            const popupData = this.dataProcessor.getPopupData(feature, fields);
            if (popupData) {
              if (this.currentFileType !== 'demografica') {
                const popupContent = createPopupContent({
                  rawName: feature.properties.Name || feature.properties.name || "",
                  fieldsArray: fields,
                  rowData: popupData.values.reduce((acc, { field, value }) => { acc[field] = value; return acc; }, {}),
                  dataSource: this.dataProcessor.data,
                  group: this.dataProcessor.groupByMunicipality ? 'municipality' : 'standard'
                });
                layer.bindPopup(popupContent, { maxWidth: 600, minWidth: 400 });
              } else {
                const popupContent = createPopupContentDemografica({
                  rawName: feature.properties.Name || feature.properties.name || "",
                  fieldsArray: fields,
                  rowData: {
                    ...popupData.values.reduce((acc, { field, value }) => { acc[field] = value; return acc; }, {}),
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
                      if (!container) return;
                      window.chartManagerDemografica?.createGradientBarChart(popupData.values, container);
                    }
                  } catch (err) {
                    console.error("❌ Errore grafico demografico:", err);
                  }
                });
              }
            }
          }
        });

        const layerId = this.dataProcessor.groupByMunicipality ? `${field}__grouped` : `${field}__${cityKey}`;
        this.layers[layerId] = layer;
        layer.addTo(this.geojsonLayer);
      });
    });

    this.geojsonLayer.addTo(this.map);
    this.updateHazards();

    // centro sui layer visibili
    this.fitToVisibleLayers();
  }

  // ======= HAZARDS =======
  updateHazards() {
    try {
      this.hazardLayer.clearLayers();

      const fillStyleIdro = (feat) => {
        const livello = String(feat.properties?.rischio || '').toLowerCase();
        if (livello.includes('elevata') || livello === 'alta' || livello === 'alto') {
          return { pane: 'pane-hazards', color: '#8e0000', weight: 2, fillColor: '#ff5252', fillOpacity: 0.35 };
        }
        if (livello.includes('media')) {
          return { pane: 'pane-hazards', color: '#a14b00', weight: 2, fillColor: '#ffb74d', fillOpacity: 0.35 };
        }
        return { pane: 'pane-hazards', color: '#1b5e20', weight: 2, fillColor: '#81c784', fillOpacity: 0.30 };
      };

      const fillStyleVulcani = (feat) => {
        const zona = String(feat.properties?.Zona || '').toUpperCase();
        if (zona.includes('ROSSA')) {
          return { pane: 'pane-hazards', color: '#b71c1c', weight: 2, fillColor: '#ef5350', fillOpacity: 0.60 };
        }
        return { pane: 'pane-hazards', color: '#9a7b00', weight: 2, fillColor: '#ffd54f', fillOpacity: 0.30 };
      };

      const haloStyle = { pane: 'pane-hazards', color: '#ffffff', weight: 4, fillOpacity: 0, opacity: 0.9 };

      const showIdro = document.getElementById('toggle-idro')?.checked;
      const showVulcani = document.getElementById('toggle-vulcani')?.checked;

      if (showIdro && this.hazardData.idro?.features?.length) {
        L.geoJSON(this.hazardData.idro, { pane: 'pane-hazards', style: haloStyle }).addTo(this.hazardLayer);
        L.geoJSON(this.hazardData.idro, { pane: 'pane-hazards', style: fillStyleIdro }).addTo(this.hazardLayer);
      }
      if (showVulcani && this.hazardData.vulcani?.features?.length) {
        L.geoJSON(this.hazardData.vulcani, { pane: 'pane-hazards', style: haloStyle }).addTo(this.hazardLayer);
        L.geoJSON(this.hazardData.vulcani, { pane: 'pane-hazards', style: fillStyleVulcani }).addTo(this.hazardLayer);
      }

      this.hazardLayer.eachLayer(l => l.bringToFront());
    } catch (err) {
      console.error("Errore in updateHazards:", err);
    }
  }

  // ======= GROUPING TOGGLE =======
  setupGroupingToggle() {
    document.getElementById('group-by-municipality').addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dataProcessor.setGrouping(checked);

      // usa l'ultima selezione nota (oppure quella dal dashboard)
      const fields =
        (this.lastFields && this.lastFields.length)
          ? this.lastFields
          : Array.from(window.dashboard?.selectedFields ?? []);

      const fType = this.lastFileType || this.currentFileType || 'stat_data';

      // ridisegna e centra senza toccare gli switch città
      this.updateMap(fields, fType);
      this.fitToVisibleLayers();
      this.updateHazards();
    });
  }

  // ======= FIT BOUNDS =======
  fitToVisibleLayers() {
    try {
      let bounds = null;

      // 1) se ho un layer disegnato, prendo i bounds da quello
      if (this.geojsonLayer && this.geojsonLayer.getLayers().length) {
        const fg = L.featureGroup();
        this.geojsonLayer.eachLayer(l => {
          if (typeof l.getBounds === 'function') {
            try { fg.addLayer(l); } catch {}
          }
        });
        if (fg.getLayers().length) bounds = fg.getBounds();
      }

      // 2) fallback: calcolo dai sorgenti attivi (ASC o Comuni)
      if (!bounds || !bounds.isValid || !bounds.isValid()) {
        const isDemografica = (this.currentFileType === 'demografica');
        const toggles = {
          napoli: document.getElementById('toggle-napoli')?.checked ?? true,
          trento: document.getElementById('toggle-trento')?.checked ?? false,
          genova: document.getElementById('toggle-genova')?.checked ?? false
        };
        const activeCities = this.dataProcessor?.groupByMunicipality
          ? ['_grouped_']
          : (isDemografica ? ['napoli'] : Object.entries(toggles).filter(([_, v]) => v).map(([k]) => k));

        const sources = this.dataProcessor?.groupByMunicipality
          ? [this.municipalitiesGeoJSON]
          : activeCities.map(k => this.geojsonByCity[k]).filter(Boolean);

        const fg2 = L.featureGroup();
        sources.forEach(src => {
          if (src && src.features?.length) {
            try { fg2.addLayer(L.geoJSON(src)); } catch {}
          }
        });
        if (fg2.getLayers().length) bounds = fg2.getBounds();
      }

      if (bounds && bounds.isValid && bounds.isValid()) {
        this.map.fitBounds(bounds, { padding: [20, 20] });
      }
    } catch (err) {
      console.warn('fitToVisibleLayers fallback:', err);
    }
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
