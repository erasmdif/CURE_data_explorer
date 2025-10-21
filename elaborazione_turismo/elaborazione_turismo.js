// elaborazione_turismo/elaborazione_turismo.js
import { getRepoBasePath } from '../utils.js';

function parseNumber(x) {
  if (x == null || x === '') return 0;
  const n = Number(String(x).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// --- normalizzazione & risoluzione chiavi comune ---------------------------------
function normComune(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/comune\s+di\s+/g, '')          // "Comune di Lignano Sabbiadoro" -> ...
    .replace(/[\u2019']/g, '')               // apostrofi curvi/semplici
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// alias utili (es. "lignano sabbiadoro" -> ["lignano sabbiadoro","lignano"])
function aliasKeysFor(norm) {
  const parts = norm.split(' ');
  const out = new Set([norm]);
  if (parts.length >= 1 && parts[0]) out.add(parts[0]);                   // "lignano"
  if (parts.length >= 2) out.add(parts.slice(0, 2).join(' '));            // "lignano sabbiadoro"
  return [...out];
}

// sceglie la miglior chiave presente nel dizionario: exact → alias → fuzzy (startsWith bidirezionale)
function resolveComuneKey(dictKeysSet, queryNorm) {
  if (dictKeysSet.has(queryNorm)) return queryNorm;

  for (const k of aliasKeysFor(queryNorm)) {
    if (dictKeysSet.has(k)) return k;
  }

  // fuzzy: privilegia la chiave più "specifica" (più lunga)
  let best = null;
  for (const k of dictKeysSet) {
    if (k.startsWith(queryNorm) || queryNorm.startsWith(k)) {
      if (!best || k.length > best.length) best = k;
    }
  }
  return best; // può essere null
}

export class TurismoProcessor {
  constructor() {
    this.base = getRepoBasePath();
    this.rows = [];                    // righe CSV originali
    this.byComuneYear = new Map();     // comuneNorm(alias) -> Map(year -> row)
    this.groupByMunicipality = true;   // disegno su comuni.geojson
    this.availableYears = [];
    this.yearFilter = null;

    // opzionale: normalizzazione percentuale su popolazione media
    this.percentMode = false;
  }

  setPercentMode(flag) { this.percentMode = !!flag; }

  async load() {
    const url = this.base + 'data/turismo_anno.csv';
    const text = await fetch(url).then(r => r.text());
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = (parsed.data || []).filter(r => Object.keys(r).length > 0);

    this.rows = rows;

    const years = new Set();

    rows.forEach(r => {
      const rawComune =
        r['Comune / Municipality'] ?? r['Comune'] ?? r['Municipality'] ?? r['comune'] ?? '';
      const yy = parseInt(r['anno'] ?? r['Anno'] ?? r['year'] ?? r['Year'] ?? '', 10);
      if (!rawComune || !Number.isFinite(yy)) return;

      years.add(yy);

      const norm = normComune(rawComune);
      const aliases = aliasKeysFor(norm); // include anche norm stesso

      // indicizzo la stessa riga per tutti gli alias
      aliases.forEach(key => {
        if (!this.byComuneYear.has(key)) this.byComuneYear.set(key, new Map());
        this.byComuneYear.get(key).set(yy, r);
      });
    });

    this.availableYears = Array.from(years).sort((a, b) => a - b);

    // default anno: 2024 se presente, altrimenti l'ultimo
    if (!this.yearFilter && this.availableYears.length) {
      this.yearFilter = this.availableYears.includes(2024)
        ? 2024
        : this.availableYears[this.availableYears.length - 1];
    }
  }

  setYearFilter(year) {
    const y = parseInt(year, 10);
    if (Number.isFinite(y)) this.yearFilter = y;
  }

  getAvailableYears() {
    return this.availableYears.slice();
  }

  // ---- helpers su row ------------------------------------------------------------

  _avgPopulation(row) {
    const p0 = parseNumber(row['Popolazione inizio periodo']);
    const p1 = parseNumber(row['Popolazione fine periodo']);
    const avg = (p0 + p1) / 2;
    return avg > 0 ? avg : 0;
  }

  _valueFromRow(row, fieldName) {
    const raw = parseNumber(row[fieldName]);
    if (!this.percentMode) return raw;
    const denom = this._avgPopulation(row);
    return denom > 0 ? (raw / denom) : 0;
  }

  _getRowForFeature(feature) {
    const name = feature?.properties?.Name || feature?.properties?.name || '';
    const q = normComune(name);

    const keysArr = Array.from(this.byComuneYear.keys());
    const key = resolveComuneKey(new Set(keysArr), q);
    if (!key) return null;

    return this.byComuneYear.get(key)?.get(this.yearFilter) || null;
  }

  // ---- API usate dalla mappa -----------------------------------------------------

  // range min/max per la legenda, sull'anno corrente
  getRange(fieldName) {
    const y = this.yearFilter;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;

    for (const [, byYear] of this.byComuneYear.entries()) {
      const row = byYear.get(y);
      if (!row) continue;

      const val = this._valueFromRow(row, fieldName);
      if (Number.isFinite(val) && val > 0) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    if (!Number.isFinite(min)) min = 0;
    if (max <= min) max = min > 0 ? min * 1.1 : 1; // evita range zero piatto
    return { min, max };
  }

  getValue(feature, fieldName) {
    const row = this._getRowForFeature(feature);
    if (!row) return 0;
    return this._valueFromRow(row, fieldName);
  }

  getPopupData(feature, fieldsArray) {
    const row = this._getRowForFeature(feature);
    if (!row) return null;

    const values = fieldsArray.map(f => ({ field: f, value: this._valueFromRow(row, f) }));
    return { values, raw: row };
  }

  // serie storica (per timeline/uso generico). Se comuneNormOrNull è null → aggrega tutti i comuni.
  // In percentMode: (somma numeratori) / (somma popolazioni medie)
  getTimeSeriesFor(fieldName, comuneNormOrNull = null) {
    const years = this.getAvailableYears().sort((a, b) => a - b);

    // individua i comuni da includere
    let keysToUse = [];
    if (comuneNormOrNull) {
      const needle = normComune(comuneNormOrNull);
      const allKeys = Array.from(this.byComuneYear.keys());
      // risolvo una chiave “preferita” e includo anche eventuali varianti/alias compatibili
      const picked = resolveComuneKey(new Set(allKeys), needle);
      if (picked) {
        keysToUse = allKeys.filter(k => k === picked || k.startsWith(picked) || picked.startsWith(k));
      } else {
        keysToUse = allKeys.filter(k => k === needle || k.startsWith(needle));
      }
    } else {
      keysToUse = Array.from(this.byComuneYear.keys());
    }

    const series = [];
    for (const y of years) {
      let numSum = 0;
      let popSum = 0;

      for (const k of keysToUse) {
        const row = this.byComuneYear.get(k)?.get(y);
        if (!row) continue;

        const raw = parseNumber(row[fieldName]);
        if (!this.percentMode) {
          if (Number.isFinite(raw)) numSum += raw;
        } else {
          const avgPop = this._avgPopulation(row);
          if (avgPop > 0 && Number.isFinite(raw)) {
            numSum += raw;
            popSum += avgPop;
          }
        }
      }

      const value = this.percentMode
        ? (popSum > 0 ? numSum / popSum : 0)
        : numSum;

      series.push({ year: y, value });
    }

    return series;
  }

  // compatibilità con toggle “Raggruppa per Comune”
  setGrouping(_) { this.groupByMunicipality = true; }
}
