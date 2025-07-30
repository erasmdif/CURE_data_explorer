class Dashboard {
  constructor() {
    this.selectedFields = new Set();
    this.fieldData = {};
    this.files = {}; // <- Nuovo: organizza per file (es. stat_data, demografica)
    this.debounceTimer = null;
    this.init();
  }

  async init() {
    await this.loadFieldData();
    this.createFileSections();
    this.createAmbitoButtons();
    this.setupEventListeners();
  }

  async loadFieldData() {
    const response = await fetch("data/spiegazione_dati.csv");
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
        this.files[file].ambiti[ambito] = {
          fields: [],
          definitions: new Set()
        };
      }
  
      this.files[file].ambiti[ambito].fields.push(field);
      this.files[file].ambiti[ambito].definitions.add(definizione);
    });
    }  

  createFileSections() {
    const container = document.getElementById('ambito-buttons');
    container.innerHTML = '';
  
    Object.keys(this.files).forEach(fileName => {
      const section = document.createElement('div');
      section.className = 'file-section';
      section.id = `file-section-${fileName}`;

  
      const title = document.createElement('h3');
      title.textContent = fileName.toUpperCase(); // stat_data → STAT_DATA
      title.style.marginTop = '20px';
      title.style.color = '#b00';
      section.appendChild(title);
  
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
        const button = document.createElement('button');
        button.className = 'ambito-button';
        button.textContent = ambito;
        button.dataset.ambito = ambito;
        button.dataset.file = file;
  
        const description = document.createElement('div');
        description.className = 'ambito-description';
        description.textContent = [...ambitoData.definitions][0];
        description.style.display = 'none';
  
        const ambitoContainer = document.createElement('div');
        ambitoContainer.className = 'ambito-container';
        ambitoContainer.appendChild(button);
        ambitoContainer.appendChild(description);
  
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
  
        ambitoContainer.appendChild(fieldsContainer);
        container.appendChild(ambitoContainer);
      });
    });
  }  

  setupEventListeners() {
    document.getElementById('ambito-buttons').addEventListener('click', (e) => {
      if (e.target.classList.contains('ambito-button')) {
        const container = e.target.closest('.ambito-container');
        const description = container.querySelector('.ambito-description');
        const fields = container.querySelector('.fields-container');

        description.style.display = description.style.display === 'none' ? 'block' : 'none';
        fields.style.display = fields.style.display === 'none' ? 'grid' : 'none';

        this.updateSelectedFields();
      }
    });

    document.getElementById('ambito-buttons').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        this.updateSelectedFields();
      }
    });
  }

  updateSelectedFields() {
    this.selectedFields.clear();

    document.querySelectorAll('.fields-container input[type="checkbox"]:checked').forEach(checkbox => {
      this.selectedFields.add(checkbox.dataset.field);
    });

    this.sendToMap();
  }

  sendToMap() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  
    const selected = [...this.selectedFields];
    if (selected.length === 0) return;
  
    const fileType = this.fieldData[selected[0]]?.file;
  
    let valuesToSend;
    let debugLabels;
  
    if (fileType === 'demografica') {
      valuesToSend = selected;  // P2, P20, P100, ecc.
      debugLabels = selected.map(id => this.fieldData[id].name);
    } else {
      valuesToSend = selected.map(id => this.fieldData[id].name);  // es. "Popolazione residente"
      debugLabels = valuesToSend;
    }
    
    this.debounceTimer = setTimeout(() => {
      if (window.mapManager) {
        window.mapManager.updateMap(valuesToSend, fileType);
      }
    }, 300);
  }  
}

document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
