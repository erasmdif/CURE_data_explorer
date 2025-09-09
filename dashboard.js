import { getRepoBasePath } from './utils.js';

class Dashboard {
  constructor() {
    this.selectedFields = new Set();
    this.fieldData = {};
    this.files = {};                // stat_data, demografica -> { ambiti... }
    this.debounceTimer = null;
    this.init();
  }

  async init() {
    await this.loadFieldData();
    this.createFileSections();
    this.createAmbitoButtons();
    this.setupEventListeners();

    // Toggle rischi → ridisegna i layer hazard
    const hazardToggles = document.getElementById('hazard-toggles');
    hazardToggles?.addEventListener('change', () => {
      window.mapManager?.updateHazards();
    });

    // Toggle città → aggiorna mappa e fit
    const cityToggles = document.getElementById('city-toggles');
    cityToggles?.addEventListener('change', () => {
      const selected = [...this.selectedFields];
      if (selected.length === 0) {
        window.mapManager?.fitToVisibleLayers?.();
        return;
      }
      const fileType = this.fieldData[selected[0]]?.file;
      const valuesToSend = (fileType === 'demografica')
        ? selected
        : selected.map(id => this.fieldData[id].name);

      window.mapManager?.updateMap(valuesToSend, fileType);
      window.mapManager?.fitToVisibleLayers?.();
    });
  }

  async loadFieldData() {
    const response = await fetch(getRepoBasePath() + "data/spiegazione_dati.csv");
    const csvText = await response.text();
    const data = Papa.parse(csvText, { header: true }).data;

    data.forEach(row => {
      const file = row.file?.trim();
      const ambito = row.ambito?.trim();
      const definizione = row.DEFINIZIONE?.trim();
      if (!file || !ambito) return;

      const field = row.ID;
      this.fieldData[field] = {
        name: row.DENOMINAZIONE,
        ambito,
        definition: definizione,
        source: row.FONTI,
        date: row["DATA RILASCIO"],
        file
      };

      if (!this.files[file]) this.files[file] = { ambiti: {} };
      if (!this.files[file].ambiti[ambito]) {
        this.files[file].ambiti[ambito] = { fields: [], definitions: new Set() };
      }

      this.files[file].ambiti[ambito].fields.push(field);
      this.files[file].ambiti[ambito].definitions.add(definizione);
    });
  }

  createFileSections() {
    const container = document.getElementById('ambito-buttons');
    container.innerHTML = '';

    Object.keys(this.files).forEach(fileName => {
      // wrapper sezione
      const section = document.createElement('div');
      section.className = 'file-section';
      section.id = `file-section-${fileName}`;

      // header collassabile (badge totale + caret)
      const header = document.createElement('button');
      header.className = 'file-section-header';
      header.type = 'button';
      header.dataset.file = fileName;
      header.setAttribute('aria-expanded', 'true');
      header.innerHTML = `
        <span class="file-title">${fileName.toUpperCase()}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="section-count-badge">0</span>
          <span class="file-caret">▼</span>
        </span>
      `;
      section.appendChild(header);

      // contenitore delle sotto-sezioni (ambiti)
      const sectionContainer = document.createElement('div');
      sectionContainer.className = 'ambiti-container';
      sectionContainer.id = `ambito-${fileName}`;
      section.appendChild(sectionContainer);

      container.appendChild(section);
    });
  }

  createAmbitoButtons() {
    Object.entries(this.files).forEach(([file, fileData]) => {
      const container = document.getElementById(`ambito-${file}`);
      if (!container) {
        console.warn(`⚠️ Container non trovato per: ambito-${file}`);
        return;
      }

      Object.entries(fileData.ambiti).forEach(([ambito, ambitoData]) => {
        const ambitoContainer = document.createElement('div');
        ambitoContainer.className = 'ambito-container';

        // header ambito (accordion interno)
        const button = document.createElement('button');
        button.className = 'ambito-button';
        button.dataset.ambito = ambito;
        button.dataset.file = file;
        button.innerHTML = `
          <span class="ambito-name">${ambito}</span>
          <span class="count-badge">0</span>
        `;

        const description = document.createElement('div');
        description.className = 'ambito-description';
        description.textContent = [...ambitoData.definitions][0];
        description.style.display = 'none';

        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'fields-container';
        fieldsContainer.style.display = 'none';

        ambitoData.fields.forEach(field => {
          const fieldId = `field-${field}`;
          const fieldWrapper = document.createElement('div');
          fieldWrapper.className = 'field-wrapper';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = fieldId;
          checkbox.dataset.field = field;

          const label = document.createElement('label');
          label.htmlFor = fieldId;
          label.textContent = this.fieldData[field].name;

          fieldWrapper.appendChild(checkbox);
          fieldWrapper.appendChild(label);
          fieldsContainer.appendChild(fieldWrapper);
        });

        ambitoContainer.appendChild(button);
        ambitoContainer.appendChild(description);
        ambitoContainer.appendChild(fieldsContainer);
        container.appendChild(ambitoContainer);
      });
    });
  }

  setupEventListeners() {
    const root = document.getElementById('ambito-buttons');

    root.addEventListener('click', (e) => {
      // 1) Toggle macro-sezione (STAT_DATA / DEMOGRAFICA)
      const header = e.target.closest('.file-section-header');
      if (header) {
        const section = header.closest('.file-section');
        const content = section.querySelector('.ambiti-container');
        const collapsed = section.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
        // assicurati che la lista si nasconda/mostri
        if (collapsed) content.style.display = 'none'; else content.style.display = '';
        return; // evita di propagare ad altri handler
      }

      // 2) Toggle ambito (accordion interno)
      const btn = e.target.classList.contains('ambito-button')
        ? e.target
        : e.target.closest('.ambito-button');
      if (btn) {
        const card = btn.closest('.ambito-container');
        const description = card.querySelector('.ambito-description');
        const fields = card.querySelector('.fields-container');

        const willOpen = (fields.style.display === 'none');
        description.style.display = willOpen ? 'block' : 'none';
        fields.style.display = willOpen ? 'grid' : 'none';
        card.classList.toggle('open', willOpen);
        btn.classList.toggle('active', willOpen);

        this.updateSelectedFields();
      }
    });

    // Selezione pill
    root.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') this.updateSelectedFields();
    });
  }

  updateSelectedFields() {
    this.selectedFields.clear();

    document.querySelectorAll('.fields-container input[type="checkbox"]:checked')
      .forEach(cb => this.selectedFields.add(cb.dataset.field));

    // Badge per AMBITO
    document.querySelectorAll('.ambito-container').forEach(card => {
      const n = card.querySelectorAll('.fields-container input[type="checkbox"]:checked').length;
      const badge = card.querySelector('.count-badge');
      if (badge) badge.textContent = n;  // mostra anche 0
      card.classList.toggle('has-selection', n > 0);
    });

    // Badge per SEZIONE (totale per file)
    const perFileCounts = {};
    this.selectedFields.forEach(id => {
      const f = this.fieldData[id]?.file;
      if (f) perFileCounts[f] = (perFileCounts[f] || 0) + 1;
    });
    Object.keys(this.files).forEach(file => {
      const section = document.getElementById(`file-section-${file}`);
      const badge = section?.querySelector('.section-count-badge');
      const n = perFileCounts[file] || 0;
      if (badge) badge.textContent = n;
      section?.classList.toggle('has-selection', n > 0);
    });

    // compatibilità con map.js
    window.selectedFields = [...this.selectedFields];

    this.sendToMap();
  }

  sendToMap() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const selected = [...this.selectedFields];
    if (selected.length === 0) return;

    const fileType = this.fieldData[selected[0]]?.file;
    const valuesToSend = (fileType === 'demografica')
      ? selected
      : selected.map(id => this.fieldData[id].name);

    this.debounceTimer = setTimeout(() => {
      window.mapManager?.updateMap(valuesToSend, fileType);
    }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
