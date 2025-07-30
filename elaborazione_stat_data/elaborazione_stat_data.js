export class DataProcessor {
    constructor() {
      this.groupByMunicipality = false;
      this.data = [];
      this.dataMap = {};
      this.municipalityData = {};
      this.labelMap = {};
    }
  
    async load() {
      const [csvText, explanationCsv] = await Promise.all([
        fetch("../data/stat_data.csv").then(res => res.text()),
        fetch("../data/spiegazione_dati.csv").then(res => res.text())
      ]);
  
      this.data = Papa.parse(csvText, { header: true }).data;
      const explanationData = Papa.parse(explanationCsv, { header: true }).data;
  
      this.labelMap = {};
      explanationData.forEach(row => {
        if (row.DENOMINAZIONE && row.ID) {
          this.labelMap[row.DENOMINAZIONE.trim()] = row.ID.trim();
        }
      });
  
      this.processData();
    }
  
    processData() {
      if (this.groupByMunicipality) {
        this.processMunicipalityData();
      } else {
        this.processStandardData();
      }
    }
  
    processStandardData() {
      this.dataMap = {};
      this.data.forEach(row => {
        const key = this.normalize(row.nome);
        if (key) this.dataMap[key] = row;
      });
    }
  
    processMunicipalityData() {
      const grouped = {};
      this.data.forEach(row => {
        const key = this.normalize(row.comune);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      });
  
      this.municipalityData = {};
      Object.entries(grouped).forEach(([key, records]) => {
        const avg = { comune: key };
        Object.keys(records[0]).forEach(field => {
          if (!['comune', 'nome'].includes(field)) {
            const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
            avg[field] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
          }
        });
        this.municipalityData[key] = avg;
      });
    }
  
    getValue(feature, field) {
      const key = this.normalize(feature.properties.Name || feature.properties.name || "");
      const row = this.groupByMunicipality ? this.municipalityData[key] : this.dataMap[key];
      return row ? parseFloat(row[field]) : null;
    }
  
    getRange(field) {
      const dataset = this.groupByMunicipality ? Object.values(this.municipalityData) : this.data;
      const values = dataset.map(d => parseFloat(d[field])).filter(v => !isNaN(v) && v > 0);
      return {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 100
      };
    }
  
    getPopupData(feature, fields) {
      const key = this.normalize(feature.properties.Name || feature.properties.name || "");
      const row = this.groupByMunicipality ? this.municipalityData[key] : this.dataMap[key];
      return row ? { name: key, values: fields.map(f => ({ field: f, value: row[f] })) } : null;
    }
  
    normalize(name) {
      return name?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, '') || '';
    }
  
    setGrouping(value) {
      this.groupByMunicipality = value;
      this.processData();
    }
  }  