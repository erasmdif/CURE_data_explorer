import { createPopupContent } from './elaborazione_stat_data/popup.js';
import { DataProcessor } from './elaborazione_stat_data/elaborazione_stat_data.js';
import { DemograficaProcessor } from './elaborazione_demografica/elaborazione_demografica_2021.js';
import { createPopupContentDemografica } from './elaborazione_demografica/popup_demografica.js';
import { DemograficaGeneraleProcessor } from './demografica_generale/elaborazione_demografica_generale.js';
import { createPopupContentDemograficaGenerale } from './demografica_generale/popup_demografica_generale.js';
import { getRepoBasePath } from './utils.js';
import { TurismoProcessor } from './elaborazione_turismo/elaborazione_turismo.js';
import { createPopupContentTurismo } from './elaborazione_turismo/popup_turismo.js';

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
    this.geojsonByCity = {}; // { napoli, genova } (solo STAT_DATA)
    this.hazardLayer = L.layerGroup().addTo(this.map);
    this.hazardData = { idro: null, vulcani: null };

    // ultimi parametri per re-render
    this.lastFields = [];
    this.lastFileType = 'stat_data';

    // filtro anno (pilotato dalla Timeline)
    this.yearFilter = 2024;

    this.initBaseMap();
  }

  async initBaseMap() {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    const [
      asc, comuni, ascGenova, idro, vulcani
    ] = await Promise.all([
      fetch(base + "data/asc.geojson").then(res => res.json()),
      fetch(base + "data/comuni.geojson").then(res => res.json()),
      fetch(base + "data/asc_genova.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] })),
      fetch(base + "data/idro.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] })),
      fetch(base + "data/vulcani.geojson").then(res => res.json()).catch(() => ({ type:'FeatureCollection', features: [] }))
    ]);

    this.geojson = asc; // Napoli (STAT_DATA)
    this.geojsonByCity = {
      napoli: asc,
      genova: ascGenova
      // FVG (trieste, monfalcone, grado, lignano) si pescano da "comuni" SOLO per DEMOGRAFICA_GENERALE
    };
    this.municipalitiesGeoJSON = comuni;

    // Dati rischi (usa sempre FC validi)
    this.hazardData = {
      idro: (idro && idro.type === 'FeatureCollection') ? idro : { type:'FeatureCollection', features: [] },
      vulcani: (vulcani && vulcani.type === 'FeatureCollection') ? vulcani : { type:'FeatureCollection', features: [] }
    };

    // Inizializza processor default
    this.dataProcessor = new DataProcessor();
    await this.dataProcessor.load();

    // prova ad applicare un eventuale filtro anno iniziale
    this.dataProcessor.setYearFilter?.(this.yearFilter);
  }

  /**
   * Impostato dalla Timeline. Aggiorna il filtro per anno e ridisegna.
   */
  setYear(year) {
    const y = parseInt(year, 10);
    this.yearFilter = Number.isFinite(y) ? y : null;
    // applica al processor corrente, se supportato
    this.dataProcessor?.setYearFilter?.(this.yearFilter);

    // usa l'ultima selezione nota (oppure quella dal dashboard)
    const fields =
      (this.lastFields && this.lastFields.length)
        ? this.lastFields
        : Array.from(window.dashboard?.selectedFields ?? []);
    const fType = this.lastFileType || this.currentFileType || 'stat_data';

    this.updateMap(fields, fType);
  }

  /**
   * Usato dalla Timeline per conoscere l'intervallo di anni disponibile
   * con il processor corrente (e filtri sesso/file già attivi).
   */
  getAvailableYears() {
    if (typeof this.dataProcessor?.getAvailableYears === 'function') {
      const ys = this.dataProcessor.getAvailableYears() || [];
      if (ys.length) return ys;
    }
    // fallback: dataset non temporali → 2021 fisso
    if (this.currentFileType === 'stat_data' || this.currentFileType === 'demografica') {
      return [2021];
    }
    return [];
  }

  async updateMap(fields = [], fileType = 'stat_data') {
    // Memorizza ultima selezione
    this.lastFields = Array.isArray(fields) ? fields.slice() : [];
    this.lastFileType = fileType || this.lastFileType;

    // Carica il processor corretto se cambia fileType
    if (this.currentFileType !== fileType) {
      this.currentFileType = fileType;

      if (fileType === 'demografica') {
        this.dataProcessor = new DemograficaProcessor();
      } else if (fileType === 'demografica_generale') {
        this.dataProcessor = new DemograficaGeneraleProcessor();
      } else if (fileType === 'turismo') {
        this.dataProcessor = new TurismoProcessor(); // << nuovo
      } else {
        this.dataProcessor = new DataProcessor();
      }
      await this.dataProcessor.load();
    }

    // Applica sempre il filtro anno corrente se supportato
    this.dataProcessor.setYearFilter?.(this.yearFilter);

    // Forza/disabilita grouping switch se DEMOGRAFICA_GENERALE **o TURISMO**
    const grp = document.getElementById('group-by-municipality');
    if (grp) {
      if (this.currentFileType === 'demografica_generale' || this.currentFileType === 'turismo') {
        grp.checked = true;
        grp.disabled = true;
      } else {
        grp.disabled = false;
      }
    }

    if (this.geojsonLayer) this.map.removeLayer(this.geojsonLayer);
    this.geojsonLayer = L.layerGroup();

    // === STATO ===
    const isDemografica = (this.currentFileType === 'demografica');
    const isDemogen = (this.currentFileType === 'demografica_generale');
    const isTurismo = (this.currentFileType === 'turismo');

    // === TOGGLES città (STAT_DATA); per DEMOGEN e TURISMO fungono da filtro su COMUNI ===
    const toggles = {
      napoli: document.getElementById('toggle-napoli')?.checked ?? true,
      genova: document.getElementById('toggle-genova')?.checked ?? false,
      trieste: document.getElementById('toggle-trieste')?.checked ?? false,
      monfalcone: document.getElementById('toggle-monfalcone')?.checked ?? false,
      grado: document.getElementById('toggle-grado')?.checked ?? false,
      lignano: document.getElementById('toggle-lignano')?.checked ?? false
    };

    // normalizzatore
    const normalize = (s) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    // set comuni selezionati (per DEMOGEN/TURISMO)
    const selectedComuneSet = new Set(
      Object.entries(toggles)
        .filter(([_, v]) => v)
        .map(([k]) => normalize(k))
    );

    // funzione match su comuni.geojson per DEMOGEN/TURISMO
    const matchComuneByToggles = (feature) => {
      if (!(isDemogen || isTurismo)) return true;   // filtraggio solo in DEMOGEN o TURISMO
      if (!selectedComuneSet.size) return true;     // nessun toggle → mostra tutti
      const nm = normalize(feature?.properties?.Name || feature?.properties?.name || '');
      if (selectedComuneSet.has(nm)) return true;
      // compatibilità con nomi lunghi (es. "lignano sabbiadoro" iniziando per "lignano")
      for (const sel of selectedComuneSet) {
        if (nm.startsWith(sel)) return true;
      }
      return false;
    };

    // Per demografica(2021) ignoriamo toggle città (solo Napoli);
    // per demografica_generale e turismo disegniamo SEMPRE su "comuni" (filter con toggle)
    const activeCities = isDemografica
      ? ['napoli']
      : Object.entries(toggles).filter(([_, v]) => v).map(([k]) => k);

    // Sorgente geometrie:
    // - DEMOGEN/TURISMO → sempre comuni
    // - grouping true → comuni
    // - STAT_DATA → asc_* per città
    const dataLayer = (isDemogen || isTurismo)
      ? this.municipalitiesGeoJSON
      : (this.dataProcessor.groupByMunicipality ? this.municipalitiesGeoJSON : null);

    // Aggiorna filtro Sesso per DEMOGRAFICA_GENERALE
    if (isDemogen && typeof this.dataProcessor.setSexFilter === 'function') {
      const sex = document.querySelector('input[name="sex-demogen"]:checked')?.value || 'Totale';
      this.dataProcessor.setSexFilter(sex);
    }

    // DEM_GEN: attiva/disattiva modalità percentuale
    if (isDemogen && typeof this.dataProcessor.setPercentMode === 'function') {
      const percent = document.getElementById('demogen-percent-toggle')?.checked || false;
      this.dataProcessor.setPercentMode(percent);
    }

    fields.forEach(field => {
      // In DEMOGEN/TURISMO e/o grouping attivo disegniamo un solo layer basato su "comuni"
      const cityTargets = (isDemogen || isTurismo || this.dataProcessor.groupByMunicipality) ? ['_grouped_'] : activeCities;

      cityTargets.forEach(cityKey => {
        const { min, max } = this.dataProcessor.getRange(field);

        const layerSource = (isDemogen || isTurismo || this.dataProcessor.groupByMunicipality)
          ? dataLayer
          : this.geojsonByCity[cityKey];

        if (!layerSource || !layerSource.features?.length) return;

        const layer = L.geoJSON(layerSource, {
          pane: 'pane-asc',
          filter: feature => {
            if (!matchComuneByToggles(feature)) return false;
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
            if (!popupData) return;

            if (isDemogen) {
              const popupContent = createPopupContentDemograficaGenerale({
                rawName: feature.properties.Name || feature.properties.name || "",
                fieldsArray: fields,
                rowData: popupData
              });
              layer.bindPopup(popupContent, { maxWidth: 600, minWidth: 420 });

              layer.on('popupopen', () => {
                try {
                  const container = document.querySelector("#demograficaGeneraleChart");
                  if (!container) return;
                  window.chartManagerDemograficaGenerale?.createGradientBarChart(popupData.values, container);
                } catch (err) {
                  console.error("❌ Errore grafico demografica generale:", err);
                }
              });
            } else if (isTurismo) {
              const popupContent = createPopupContentTurismo({
                rawName: feature.properties.Name || feature.properties.name || "",
                fieldsArray: fields,
                rowData: popupData
              });
              layer.bindPopup(popupContent, { maxWidth: 600, minWidth: 420 });

              layer.on('popupopen', () => {
                try {
                  const container = document.querySelector("#turismoChart");
                  if (!container) return;
                  window.chartManagerTurismo?.createGradientBarChart(popupData.values, container);
                } catch (err) {
                  console.error("❌ Errore grafico turismo:", err);
                }
              });
            } else if (!isDemografica) {
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
                  if (isDemografica) {
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
        });

        const layerId = (isDemogen || isTurismo || this.dataProcessor.groupByMunicipality) ? `${field}__grouped` : `${field}__${cityKey}`;
        this.layers[layerId] = layer;
        layer.addTo(this.geojsonLayer);
      });
    });

    this.geojsonLayer.addTo(this.map);
    this.updateHazards();

    // centro sui layer visibili
    this.fitToVisibleLayers();

    // notifica la Timeline (e altri listener) che la mappa è stata aggiornata
    window.dispatchEvent(new Event('map:updated'));
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
    const el = document.getElementById('group-by-municipality');
    if (!el) return; // toggle rimosso dalla UI
    el.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dataProcessor.setGrouping?.(checked);

      const fields =
        (this.lastFields && this.lastFields.length)
          ? this.lastFields
          : Array.from(window.dashboard?.selectedFields ?? []);
      const fType = this.lastFileType || this.currentFileType || 'stat_data';

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
        const isDemogen = (this.currentFileType === 'demografica_generale');

        const normalize = (s) => String(s || '')
          .toLowerCase()
          .normalize('NFD').replace(/\p{Diacritic}/gu, '')
          .replace(/\s+/g, ' ')
          .trim();

        const toggles = {
          napoli: document.getElementById('toggle-napoli')?.checked ?? true,
          genova: document.getElementById('toggle-genova')?.checked ?? false,
          trieste: document.getElementById('toggle-trieste')?.checked ?? false,
          monfalcone: document.getElementById('toggle-monfalcone')?.checked ?? false,
          grado: document.getElementById('toggle-grado')?.checked ?? false,
          lignano: document.getElementById('toggle-lignano')?.checked ?? false
        };

        const selectedComuneSet = new Set(
          Object.entries(toggles)
            .filter(([_, v]) => v)
            .map(([k]) => normalize(k))
        );

        const matchComune = (feature) => {
          if (!isDemogen) return true;
          if (!selectedComuneSet.size) return true;
          const nm = normalize(feature?.properties?.Name || feature?.properties?.name || '');
          if (selectedComuneSet.has(nm)) return true;
          for (const sel of selectedComuneSet) {
            if (nm.startsWith(sel)) return true;
          }
          return false;
        };

        const sources = (() => {
          if (isDemografica) {
            return [this.geojsonByCity['napoli']].filter(Boolean);
          }
          if (isDemogen || this.dataProcessor?.groupByMunicipality) {
            // filtra comuni.geojson in base ai toggle (se presenti)
            const fc = this.municipalitiesGeoJSON;
            if (!fc || !fc.features?.length) return [];
            const feats = fc.features.filter(f => matchComune(f));
            const filtered = { type: 'FeatureCollection', features: feats };
            return [filtered];
          }
          // STAT_DATA senza grouping → asc_* per città attive
          const activeCities = Object.entries(toggles).filter(([_, v]) => v).map(([k]) => k);
          return activeCities.map(k => this.geojsonByCity[k]).filter(Boolean);
        })();

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
