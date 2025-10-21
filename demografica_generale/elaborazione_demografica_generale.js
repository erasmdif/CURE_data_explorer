// demografica_generale/elaborazione_demografica_generale.js
import { getRepoBasePath } from '../utils.js';

export class DemograficaGeneraleProcessor {
  constructor() {
    this.base = getRepoBasePath();

    // Dati originali e indici
    this.rows = []; // righe CSV originali
    // indice: comuneNorm -> sexKey('Maschi'|'Femmine'|'Totale') -> year -> row
    this.byComuneSexYear = new Map();

    // Stato
    this.groupByMunicipality = true;   // su comuni.geojson
    this.yearFilter = null;
    this.availableYears = [];
    this.sexFilter = 'Totale';         // 'Maschi' | 'Femmine' | 'Totale'
    this.percentMode = false;          // true => valore / popolazione media (non applicato ai tassi derivati)
  }

  // ========== Utils base ==========
  normalizeComune(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeSex(s) {
    const v = String(s || '').toLowerCase().trim();
    if (v.startsWith('mas')) return 'Maschi';
    if (v.startsWith('fem')) return 'Femmine';
    return 'Totale';
  }

  parseNumber(x) {
    if (x == null || x === '') return 0;
    const n = Number(String(x).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  // ========== Caricamento ==========
  async load() {
    const url = this.base + 'data/demografica_generale.csv';
    const text = await fetch(url).then(r => r.text());
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const data = (parsed.data || []).filter(r => Object.keys(r).length);

    this.rows = data;

    const years = new Set();

    data.forEach(r => {
      const comune = this.normalizeComune(r['comune'] ?? r['Comune'] ?? r['COMUNE'] ?? '');
      const sex = this.normalizeSex(r['Sesso'] ?? r['sesso'] ?? '');
      const yy = parseInt(r['Anno'] ?? r['ANNO'] ?? r['anno'] ?? '', 10);

      if (!comune || !Number.isFinite(yy)) return;
      years.add(yy);

      if (!this.byComuneSexYear.has(comune)) this.byComuneSexYear.set(comune, new Map());
      const bySex = this.byComuneSexYear.get(comune);
      if (!bySex.has(sex)) bySex.set(sex, new Map());
      bySex.get(sex).set(yy, r);
    });

    this.availableYears = Array.from(years).sort((a,b) => a - b);

    // default: ultimo anno disponibile
    if (!this.yearFilter && this.availableYears.length) {
      this.yearFilter = this.availableYears[this.availableYears.length - 1];
    }
  }

  // ========== Stato/filtri ==========
  setYearFilter(year) {
    const y = parseInt(year, 10);
    if (Number.isFinite(y)) this.yearFilter = y;
  }
  getAvailableYears() {
    return this.availableYears.slice();
  }

  setSexFilter(sex) {
    this.sexFilter = this.normalizeSex(sex);
  }

  setPercentMode(flag) {
    this.percentMode = !!flag;
  }

  // ========== Accesso ai dati indicizzati ==========
  _getRow(comuneNorm, year, sexKey) {
    const bySex = this.byComuneSexYear.get(comuneNorm);
    return bySex?.get(sexKey)?.get(year) || null;
  }

  _avgPopulation(row) {
    const p0 = this.parseNumber(row['Popolazione inizio periodo']);
    const p1 = this.parseNumber(row['Popolazione fine periodo']);
    const avg = (p0 + p1) / 2;
    return avg > 0 ? avg : 0;
  }

  _isDerived(fieldName) {
    return fieldName === 'Tasso di natalità' || fieldName === 'Tasso di mortalità';
  }

  _derivedValue(row, fieldName) {
    const pop = this._avgPopulation(row) || 0;
    if (pop <= 0) return 0;
    if (fieldName === 'Tasso di natalità') {
      const nati = this.parseNumber(row['Nati']);
      return nati / pop;
    }
    if (fieldName === 'Tasso di mortalità') {
      const morti = this.parseNumber(row['Morti']);
      return morti / pop;
    }
    return 0;
  }

  _valueFromRow(row, fieldName) {
    // Per i tassi derivati usiamo sempre la formula (indipendente da percentMode)
    if (this._isDerived(fieldName)) {
      return this._derivedValue(row, fieldName);
    }

    // Altri campi: grezzi oppure divisi per popolazione media se percentMode è attivo
    const raw = this.parseNumber(row[fieldName]);
    if (!this.percentMode) return raw;

    const denom = this._avgPopulation(row);
    if (denom <= 0) return 0;
    return raw / denom; // frazione (eventuale %/‰ lo gestisci in UI moltiplicando)
  }

  // ========== Range per legenda (sull'anno/sex correnti) ==========
  getRange(fieldName) {
    const year = this.yearFilter;
    const sex = this.sexFilter;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const [comuneNorm, bySex] of this.byComuneSexYear.entries()) {
      const row = bySex?.get(sex)?.get(year);
      if (!row) continue;

      const val = this._valueFromRow(row, fieldName);
      if (Number.isFinite(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max) || max <= min) max = (min > 0 ? min * 1.1 : 1);

    return { min, max };
  }

  // ========== Valore per feature (comune) ==========
  getValue(feature, fieldName) {
    const comuneNorm = this.normalizeComune(feature?.properties?.Name || feature?.properties?.name || '');
    const row = this._getRow(comuneNorm, this.yearFilter, this.sexFilter);
    if (!row) return 0;
    return this._valueFromRow(row, fieldName);
  }

  // ========== Dati per popup (multi-campo) ==========
  getPopupData(feature, fieldsArray) {
    const comuneNorm = this.normalizeComune(feature?.properties?.Name || feature?.properties?.name || '');
    const row = this._getRow(comuneNorm, this.yearFilter, this.sexFilter);
    if (!row) return null;

    const values = fieldsArray.map(f => ({ field: f, value: this._valueFromRow(row, f) }));
    return { values, raw: row };
  }

  // ========== Serie temporali ==========
  // comuneNormOrNull: se null → aggrega su tutti i comuni
  // percentMode: (somma numeratori) / (somma popolazioni medie)
  // tassi derivati: sempre (somma Nati|Morti) / (somma popolazioni medie)
  getTimeSeriesFor(fieldName, comuneNormOrNull = null, sexOverride = null) {
    const sex = sexOverride ? this.normalizeSex(sexOverride) : this.sexFilter;
    const years = this.availableYears.slice().sort((a,b) => a - b);

    // Selezione comuni
    const keysToUse = (() => {
      if (!comuneNormOrNull) return Array.from(this.byComuneSexYear.keys());
      const needle = this.normalizeComune(comuneNormOrNull);
      const out = [];
      for (const key of this.byComuneSexYear.keys()) {
        if (key === needle || key.startsWith(needle)) out.push(key);
      }
      return out;
    })();

    const series = [];
    const isDerived = this._isDerived(fieldName);

    for (const y of years) {
      let numSum = 0;
      let popSum = 0;

      for (const k of keysToUse) {
        const row = this.byComuneSexYear.get(k)?.get(sex)?.get(y);
        if (!row) continue;

        if (isDerived) {
          // Nati/Morti su popolazione media (aggregazione: somma numeratori e popolazioni)
          const pop = this._avgPopulation(row);
          if (pop > 0) {
            popSum += pop;
            if (fieldName === 'Tasso di natalità') numSum += this.parseNumber(row['Nati']);
            else if (fieldName === 'Tasso di mortalità') numSum += this.parseNumber(row['Morti']);
          }
        } else if (this.percentMode) {
          const raw = this.parseNumber(row[fieldName]);
          const pop = this._avgPopulation(row);
          if (pop > 0) { numSum += raw; popSum += pop; }
        } else {
          const raw = this.parseNumber(row[fieldName]);
          if (Number.isFinite(raw)) numSum += raw;
        }
      }

      const value = (isDerived || this.percentMode)
        ? (popSum > 0 ? numSum / popSum : 0)
        : numSum;

      series.push({ year: y, value });
    }

    return series;
  }

  // ========== Elenco campi disponibili (inclusi i derivati) ==========
  get fields() {
    // deduci dai dati la lista colonne, poi escludi chiavi di join/metadati
    const first = this.rows?.find(r => r) || {};
    const base = Object.keys(first).filter(k =>
      !['comune','Comune','COMUNE','Anno','ANNO','Sesso','SESSO',''].includes(k)
    );
    // aggiungi i derivati se non presenti come colonne nel CSV
    if (!base.includes('Tasso di natalità')) base.push('Tasso di natalità');
    if (!base.includes('Tasso di mortalità')) base.push('Tasso di mortalità');
    return base;
  }

  // compat per eventuali toggle (resta sempre true)
  setGrouping(_) { this.groupByMunicipality = true; }
}
