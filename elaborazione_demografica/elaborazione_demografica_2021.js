import { getRepoBasePath } from '../utils.js';

export class DemograficaProcessor {
  constructor() {
    this.data = [];
    this.dataMap = {};
    this.groupByMunicipality = false;
  }

  async load() {
    const csvText = await fetch(getRepoBasePath() + "data/demografica_2021.csv").then(res => res.text());
    this.data = Papa.parse(csvText, { header: true }).data;

    this.dataMap = {};
    this.data.forEach(row => {
      const key = row.ASC_1LIV_COD?.trim();
      if (key) {
        row.ASC_1LIV_COD = key;  // 🛠️ Inietta il codice nell'oggetto row
        this.dataMap[key] = row;
      }
        });

    console.log("✅ Caricati", this.data.length, "record demografici.");
  }

  setGrouping(value) {
    this.groupByMunicipality = value;
  }

  getValue(feature, field) {
    const key = feature.properties.COM_ASC1?.toString().trim();
    const row = this.dataMap[key];

    if (!row) {
      console.warn(`❌ Nessun match per COM_ASC1 = "${key}"`);
      return null;
    }

    const rawValue = row[field];
    const value = parseFloat(rawValue);

    if (isNaN(value)) {
      console.warn(`⚠️ Valore non numerico per campo "${field}" nella riga con ASC_1LIV_COD = "${key}":`, rawValue);
      return null;
    }

    return value;
  }

  getRange(field) {
    const values = Object.values(this.dataMap)
      .map(row => parseFloat(row[field]))
      .filter(val => !isNaN(val) && val > 0);

    if (values.length === 0) return { min: 0, max: 1 };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

getPopupData(feature, fields) {
  const key = feature.properties.COM_ASC1?.toString().trim();
  const row = this.dataMap[key];
  if (!row) return null;

  const values = fields.map(field => ({
    field,
    value: parseFloat(row[field]) || "–"
  }));

  return {
    values,
    ASC_1LIV_COD: key  // 🔧 aggiunto!
  };
}
}
