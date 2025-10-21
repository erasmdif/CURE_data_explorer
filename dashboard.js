import { getRepoBasePath } from './utils.js';

class Dashboard {
  constructor() {
    // Dati/struttura
    this.fieldData = {};      // { ID -> { name, ambito, file, ... } }
    this.files = {};          // { fileKey -> { ambiti: { [ambito]: { fields[], definitions:Set } } } }

    // Stato UI
    this.selectedByDataset = {
      stat_data: new Set(),
      demografica: new Set(),
      dem_gen: new Set(),
      turismo: new Set()
    };
    this.activeDataset = null;      // nessun dataset attivo all'avvio
    this.debounceTimer = null;

    // Disponibilità dataset per area
    this.AVAILABILITY = {
      napoli: { stat_data:true, demografica:true,  dem_gen:true, turismo:true },
      genova: { stat_data:true, demografica:false, dem_gen:true, turismo:true },
      fvg:    { stat_data:false, demografica:false, dem_gen:true, turismo:true }
    };

    // mapping dataset -> fileType per la mappa
    this.DATASET_TO_FILE = {
      stat_data: 'stat_data',
      demografica: 'demografica',
      dem_gen: 'demografica_generale',
      turismo: 'turismo'
    };

    this.init();
  }

  /* ======================
     Init & Data Loading
     ====================== */
  async init() {
    await this.loadFieldData();

    // UI iniziale
    this.renderDatasetButtons();
    this.renderDatasetPanel();
    this.setupEventListeners();

    // Rischi → solo refresh grafica
    document.getElementById('hazard-toggles')?.addEventListener('change', () => {
      window.mapManager?.updateHazards();
    });

    // Toggle città: aggiorna disponibilità visiva + (se ho scelte nel dataset attivo) ridisegno
    document.getElementById('city-toggles')?.addEventListener('change', () => {
      this.updateDatasetAvailabilityUI();
      if (!this.activeDataset) {
        window.mapManager?.fitToVisibleLayers?.();
        return;
      }
      const sel = [...this.selectedByDataset[this.activeDataset]];
      if (sel.length) this.sendToMap(this.activeDataset);
      else window.mapManager?.fitToVisibleLayers?.();
    });

    // prima valutazione availability
    this.updateDatasetAvailabilityUI();
  }

  /* ======================
     Data loading
     ====================== */
  async loadFieldData() {
    const base = getRepoBasePath();

    // === STAT_DATA + DEMOGRAFICA da spiegazione_dati.csv ===
    try {
      const response = await fetch(base + "data/spiegazione_dati.csv");
      const csvText = await response.text();
      const data = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;

      const col = (row, ...keys) => {
        for (const k of keys) {
          if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
        }
        return '';
      };

      data.forEach(row => {
        const file = col(row, 'file', 'File', 'FILE', 'dataset', 'Dataset').toLowerCase();
        if (!file || (file !== 'stat_data' && file !== 'demografica')) return;

        const ambito = col(row, 'ambito', 'Ambito', 'AMBITO') || '—';
        const definizione = col(row, 'DEFINIZIONE', 'Definizione', 'definizione');
        const field = col(row, 'ID', 'Id', 'id');
        const denominazione = col(row, 'DENOMINAZIONE', 'Denominazione', 'denominazione') || field;
        const fonti = col(row, 'FONTI', 'Fonti', 'fonti');
        const dataRilascio = col(row, 'DATA RILASCIO', 'Data Rilascio', 'data rilascio', 'data_rilascio');

        if (!field) return;

        this.fieldData[field] = {
          name: denominazione,
          ambito,
          definition: definizione,
          source: fonti,
          date: dataRilascio,
          file
        };

        if (!this.files[file]) this.files[file] = { ambiti: {} };
        if (!this.files[file].ambiti[ambito]) {
          this.files[file].ambiti[ambito] = { fields: [], definitions: new Set() };
        }
        this.files[file].ambiti[ambito].fields.push(field);
        if (definizione) this.files[file].ambiti[ambito].definitions.add(definizione);
      });
    } catch (err) {
      console.warn('spiegazione_dati.csv non caricata:', err);
    }

    // === DEMOGRAFICA_GENERALE (dataset "dem_gen") — sezioni/ambiti
    try {
      const resp2 = await fetch(base + "data/demografica_generale.csv");
      const text2 = await resp2.text();
      const parsed2 = Papa.parse(text2, { header: true, skipEmptyLines: true });
      const rows2 = parsed2.data || [];

      if (rows2.length) {
        const clean = (s) => String(s ?? '').replace(/^\uFEFF/, '').trim();
        const excludeKeys = new Set(['comune','Comune','COMUNE','Anno','ANNO','Sesso','SESSO','']);

        const csvCols = Object.keys(rows2[0]).map(clean);
        const csvColsSet = new Set(csvCols);

        const G = {
          'Popolazione e tassi di natalità/mortalità': [
            'Popolazione inizio periodo',
            'Popolazione fine periodo',
            'Nati',
            'Morti',
            'Saldo residuo',
            // derivati:
            'Tasso di natalità',
            'Tasso di mortalità'
          ],
          'Movimenti (interni)': [
            "Iscritti dall'interno",
            "Cancellati per l'interno",
            "Saldo migratorio interno"
          ],
          'Movimenti (esterni)': [
            "Iscritti dall'estero",
            "Cancellati per l'estero",
            "Saldo migratorio anagrafico estero",
            "Acquisizioni di cittadinanza italiana"
          ],
          'Movimenti (altri motivi)': [
            "Iscritti in anagrafe per altri motivi",
            "Cancellati dall'anagrafe per altri motivi",
            "Saldo anagrafico per altri motivi"
          ],
          'Famiglie': [
            "Numero di famiglie al 31 dicembre",
            "Numero medio di componenti per famiglia al 31 dicembre",
            "Numero di convivenze al 31 dicembre da trattamento statistico dell'informazione di fonte anagrafica",
            "Popolazione residente in convivenza al 31 dicembre"
          ],
          'Dati di vulnerabilità': [
            "Tasso di occupazione (20-64)",
            "Tassi motorizzazione alta emissione",
            "Tasso di incremento popolazione",
            "Superfice a rischio frane",
            "Raccolta indifferenziata dei rifiuti urbani per abitante"
          ]
        };

        if (!this.files['dem_gen']) this.files['dem_gen'] = { ambiti: {} };
        for (const ambito of Object.keys(G)) {
          if (!this.files['dem_gen'].ambiti[ambito]) {
            this.files['dem_gen'].ambiti[ambito] = { fields: [], definitions: new Set([ambito]) };
          }
        }

        const addField = (ambito, colName) => {
          const fieldId = `DEMOGEN:${colName}`;
          this.fieldData[fieldId] = {
            name: colName,
            ambito,
            definition: '',
            source: 'ISTAT',
            date: '',
            file: 'demografica_generale'
          };
          this.files['dem_gen'].ambiti[ambito].fields.push(fieldId);
        };

        // reali (presenti nel CSV)
        for (const [ambito, cols] of Object.entries(G)) {
          cols.forEach(c => {
            if (c === 'Tasso di natalità' || c === 'Tasso di mortalità') return; // derivati dopo
            if (excludeKeys.has(c)) return;
            if (csvColsSet.has(c)) addField(ambito, c);
          });
        }
        // derivati: sempre visibili
        addField('Popolazione e tassi di natalità/mortalità', 'Tasso di natalità');
        addField('Popolazione e tassi di natalità/mortalità', 'Tasso di mortalità');
      }
    } catch (e) {
      console.warn('DEMOGRAFICA_GENERALE non caricata:', e);
    }

    // === TURISMO (dataset "turismo") ===
    try {
      const respT = await fetch(base + "data/turismo_anno.csv");
      const textT = await respT.text();
      const parsedT = Papa.parse(textT, { header: true, skipEmptyLines: true });
      const rowsT = parsedT.data || [];

      if (rowsT.length) {
        const allCols = Object.keys(rowsT[0]);

        const hasNotResUnderscore = allCols.some(c => /_not_res$/.test(c));
        this.TURISMO_SUFFIX = {
          res: 'res',
          notres: hasNotResUnderscore ? 'not_res' : 'notres',
          tot: 'tot'
        };

        const macros = ['arrivi', 'pernottamenti'];
        const subcats = ['eserc', 'alberghi', 'extra'];

        if (!this.files['turismo']) this.files['turismo'] = { ambiti: {} };

        macros.forEach(macro => {
          const ambKey = (macro === 'arrivi') ? 'Arrivi' : 'Pernottamenti';
          if (!this.files['turismo'].ambiti[ambKey]) {
            this.files['turismo'].ambiti[ambKey] = {
              fields: [],
              definitions: new Set([`${ambKey} per comune e anno.`])
            };
          }

          subcats.forEach(sub => {
            const present = ['res', 'notres', 'tot'].some(k => {
              const suf = this.TURISMO_SUFFIX[k];
              return allCols.includes(`${macro}_${sub}_${suf}`);
            });
            if (!present) return;

            const fieldId = `TURISMO_META:${macro}:${sub}`;
            this.fieldData[fieldId] = {
              name: (sub === 'eserc' ? 'Esercizi' : (sub[0].toUpperCase() + sub.slice(1))),
              ambito: ambKey,
              definition: '',
              source: 'ISTAT',
              date: '',
              file: 'turismo'
            };
            this.files['turismo'].ambiti[ambKey].fields.push(fieldId);
          });
        });
      }
    } catch (e) {
      console.warn('TURISMO non caricato:', e);
    }
  }

  /* ======================
     Rendering
     ====================== */
  renderDatasetButtons() {
    const grid = document.getElementById('dataset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const items = ['stat_data','demografica','dem_gen','turismo'];
    items.forEach(ds => {
      const btn = document.createElement('button');
      btn.className = 'dataset-btn';
      btn.type = 'button';
      btn.dataset.dataset = ds;
      btn.innerHTML = `
        <span class="label">${ds.toUpperCase()}</span>
        <span class="dataset-right">
          <span class="dataset-badge" id="badge-${ds}">${this.selectedByDataset[ds].size}</span>
          <span class="dataset-caret">▶</span>
        </span>
      `;
      if (ds === this.activeDataset) btn.classList.add('is-active');
      grid.appendChild(btn);
    });

    // applica lo stato di disponibilità (verde/rosso)
    this.updateDatasetAvailabilityUI();
  }

  renderDatasetPanel() {
    const panel = document.getElementById('dataset-panel');
    if (!panel) return;
    panel.innerHTML = '';

    // se nulla selezionato → messaggio iniziale
    if (!this.activeDataset) {
      panel.innerHTML = `<div class="ambito-container">
        <div class="ambito-description" style="display:block;padding:12px 16px;">
          Seleziona un dataset qui sopra per vedere i campi disponibili.
        </div></div>`;
      return;
    }

    const fileKey = this.activeDataset;
    const fileData = this.files[fileKey];

    if (!fileData) {
      panel.innerHTML = `<div class="ambito-container">
        <div class="ambito-description" style="display:block;padding:12px 16px;">
          Nessun campo disponibile per <strong>${fileKey.toUpperCase()}</strong>.
        </div></div>`;
      return;
    }

    // --- Filtro Sesso + Percentuale (solo DEM_GEN) ---
    if (fileKey === 'dem_gen') {
      const box = document.createElement('div');
      box.className = 'ambito-container';
      box.innerHTML = `
        <div class="ambito-description" id="sex-filter-demogen" style="display:block;padding:12px 16px;">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:14px;">
            <div style="font-weight:600;color:#2c3e50;">Sesso</div>
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="radio" name="sex-demogen" value="Maschi">
              <span>Maschi</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="radio" name="sex-demogen" value="Femmine">
              <span>Femmine</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="radio" name="sex-demogen" value="Totale" checked>
              <span>Totale</span>
            </label>

            <div style="height:18px;width:1px;background:#e5e7eb;margin:0 6px;"></div>

            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="demogen-percent-toggle">
              <span>Valori in % (per popolazione media)</span>
            </label>
          </div>
        </div>`;
      panel.appendChild(box);
    }

    // --- Selettore Residenti/Non residenti/Totale (solo TURISMO) ---
    if (fileKey === 'turismo') {
      const top = document.createElement('div');
      top.className = 'ambito-container';
      top.innerHTML = `
        <div class="ambito-description" style="display:block;padding:12px 16px;">
          <div style="font-weight:600;margin-bottom:6px;color:#2c3e50;">Popolazione di riferimento (applica a tutte le scelte)</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <label style="display:flex; align-items:center; gap:6px;">
              <input type="radio" name="turismo-res-filter" value="res">
              <span>Residenti</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px;">
              <input type="radio" name="turismo-res-filter" value="notres">
              <span>Non residenti</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px;">
              <input type="radio" name="turismo-res-filter" value="tot" checked>
              <span>Totale</span>
            </label>
          </div>
        </div>`;
      panel.appendChild(top);
    }

    // --- Card per ogni ambito ---
    Object.entries(fileData.ambiti).forEach(([ambito, aData]) => {
      const card = document.createElement('div'); card.className = 'ambito-container';

      const btn = document.createElement('button');
      btn.className = 'ambito-button';
      btn.type = 'button';
      btn.innerHTML = `
        <span class="ambito-name">${ambito}</span>
        <span class="count-badge">0</span>
      `;

      const desc = document.createElement('div');
      desc.className = 'ambito-description';
      desc.textContent = [...aData.definitions][0] || '';
      desc.style.display = 'none';

      const list = document.createElement('div');
      list.className = 'fields-container';
      list.style.display = 'none';

      aData.fields.forEach(fid => {
        const id = `pill-${fileKey}-${fid}`;
        const wrap = document.createElement('div'); wrap.className = 'field-wrapper';

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = id; cb.dataset.field = fid; cb.dataset.ds = fileKey;
        cb.checked = this.selectedByDataset[fileKey].has(fid);

        const lab = document.createElement('label');
        lab.htmlFor = id; lab.textContent = this.fieldData[fid]?.name || fid;

        wrap.appendChild(cb); wrap.appendChild(lab); list.appendChild(wrap);
      });

      card.appendChild(btn); card.appendChild(desc); card.appendChild(list);
      panel.appendChild(card);
    });

    this.updateAmbitoBadgesInPanel();
  }

  /* ======================
     Event Listeners
     ====================== */
  setupEventListeners() {
    // Click sui bottoni dataset
    document.getElementById('dataset-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.dataset-btn'); if (!btn) return;
      const ds = btn.dataset.dataset;
      this.activeDataset = ds;

      document.querySelectorAll('.dataset-btn').forEach(b =>
        b.classList.toggle('is-active', b.dataset.dataset === ds)
      );

      this.renderDatasetPanel();
    });

    // Accordion ambiti nel pannello
    document.getElementById('dataset-panel')?.addEventListener('click', (e) => {
      const b = e.target.closest('.ambito-button'); if (!b) return;
      const card = b.closest('.ambito-container');
      const desc = card.querySelector('.ambito-description');
      const list = card.querySelector('.fields-container');

      const willOpen = (list.style.display === 'none');
      desc.style.display = willOpen ? 'block' : 'none';
      list.style.display = willOpen ? 'grid' : 'none';
      card.classList.toggle('open', willOpen);
      b.classList.toggle('active', willOpen);
    });

    // Selezione/deselezione pill
    document.getElementById('dataset-panel')?.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;

      const fid = e.target.dataset.field;
      const ds  = e.target.dataset.ds;

      if (e.target.checked) this.selectedByDataset[ds].add(fid);
      else this.selectedByDataset[ds].delete(fid);

      // aggiorna badge dataset
      this.updateDatasetBadge(ds);

      // badge ambiti nel pannello
      this.updateAmbitoBadgesInPanel();

      // invia alla mappa SOLO per il dataset coinvolto
      this.sendToMap(ds);

      // notifica la timeline che la selezione è cambiata
      window.dispatchEvent(new Event('dashboard:selectionChanged'));
    });

    // TURISMO: cambio res/notres/tot
    document.addEventListener('change', (e) => {
      if (e.target && e.target.name === 'turismo-res-filter') {
        const sel = [...this.selectedByDataset['turismo']];
        if (sel.length) this.sendToMap('turismo');
      }
    });

    // DEM_GEN: cambio sesso
    document.addEventListener('change', (e) => {
      if (e.target && e.target.name === 'sex-demogen') {
        const sel = [...this.selectedByDataset['dem_gen']];
        if (sel.length) {
          this.sendToMap('dem_gen');
          window.dispatchEvent(new Event('dashboard:selectionChanged'));
        }
      }
    });

    // DEM_GEN: toggle percentuale
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'demogen-percent-toggle') {
        const sel = [...this.selectedByDataset['dem_gen']];
        if (sel.length) {
          this.sendToMap('dem_gen');
          window.dispatchEvent(new Event('dashboard:selectionChanged'));
        }
      }
    });
  }

  /* ======================
     Badge & Availability
     ====================== */
  updateAmbitoBadgesInPanel() {
    document.querySelectorAll('#dataset-panel .ambito-container').forEach(card => {
      const n = card.querySelectorAll('.fields-container input[type="checkbox"]:checked').length;
      const badge = card.querySelector('.count-badge');
      if (badge) badge.textContent = n;           // mostra anche 0
      card.classList.toggle('has-selection', n > 0);
    });
  }

  updateDatasetBadge(ds) {
    const badge = document.getElementById(`badge-${ds}`);
    if (badge) badge.textContent = this.selectedByDataset[ds].size;
  }

  updateDatasetAvailabilityUI() {
    const activeRegions = this.getActiveRegions();
    const datasets = ['stat_data','demografica','dem_gen','turismo'];

    datasets.forEach(ds => {
      const isOk = activeRegions.every(r => (this.AVAILABILITY[r]?.[ds] ?? true));
      const el = document.querySelector(`.dataset-btn[data-dataset="${ds}"]`);
      if (!el) return;
      el.classList.toggle('is-available', isOk);
      el.classList.toggle('is-unavailable', !isOk);
      el.title = isOk
        ? 'Disponibile per i comuni selezionati'
        : 'Non disponibile per almeno uno dei comuni selezionati';
    });
  }

  getActiveRegions() {
    const act = [];
    const nap = document.getElementById('toggle-napoli')?.checked;
    const gen = document.getElementById('toggle-genova')?.checked;
    const fvgAny = ['toggle-trieste','toggle-monfalcone','toggle-grado','toggle-lignano']
      .some(id => document.getElementById(id)?.checked);

    if (nap) act.push('napoli');
    if (gen) act.push('genova');
    if (fvgAny) act.push('fvg');

    return act.length ? act : ['napoli']; // default
  }

  /* ======================
     Map wiring
     ====================== */
  sendToMap(datasetKey) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const selected = [...this.selectedByDataset[datasetKey]];
    if (!selected.length) return;

    const fileType = this.DATASET_TO_FILE[datasetKey] || datasetKey;

    let values = [];

    if (fileType === 'demografica') {
      values = selected;
    } else if (fileType === 'demografica_generale') {
      values = selected.map(id => id.replace(/^DEMOGEN:/, ''));
    } else if (fileType === 'turismo') {
      // leggo scelta "residenti / non residenti / totale"
      const choice = document.querySelector('input[name="turismo-res-filter"]:checked')?.value || 'tot';
      const suf = (this.TURISMO_SUFFIX && this.TURISMO_SUFFIX[choice]) ? this.TURISMO_SUFFIX[choice] : choice;

      values = selected.map(fid => {
        const m = /^TURISMO_META:(arrivi|pernottamenti):(eserc|alberghi|extra)$/.exec(fid);
        if (m) return `${m[1]}_${m[2]}_${suf}`;
        return this.fieldData[fid]?.name ?? fid;
      });
    } else {
      values = selected.map(id => this.fieldData[id]?.name ?? id);
    }

    // Compatibilità con map.js (setupGroupingToggle usa window.selectedFields)
    window.selectedFields = values;

    this.debounceTimer = setTimeout(() => {
      window.mapManager?.updateMap(values, fileType);
    }, 250);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
