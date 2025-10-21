// Pagina di dettaglio per DEMOGEN e TURISMO
// - Carica CSV direttamente (niente dipendenze dalla pagina principale)
// - Serie storiche con Chart.js
// - Percentuale opzionale: valore / media(pop_start, pop_end)
// - In modalità %, confronto con altri comuni (linee grigie)

import { getRepoBasePath } from '../utils.js';

const norm = (s) => String(s||'')
  .toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,'')
  .replace(/\s+/g,' ')
  .trim();

const toNumber = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// piccolo renderer inline (evitiamo file condivisi)
function renderLines(container, series) {
  if (!container) return;
  if (container.__chart__) { try { container.__chart__.destroy(); } catch {} container.__chart__ = null; }
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const ds = series.map((s, i) => ({
    label: s.label,
    data: s.data,
    parsing: false,
    borderColor: s.borderColor || `rgba(${(i*73)%255}, ${(i*121)%255}, ${(i*41)%255}, 1)`,
    backgroundColor: s.backgroundColor || 'rgba(0,0,0,0)',
    borderWidth: s.borderWidth ?? 2,
    pointRadius: s.pointRadius ?? 2,
    tension: s.tension ?? 0.25,
    spanGaps: true,
    borderDash: s.borderDash || []
  }));

  const chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: {
            title(items) { return `Anno ${items?.[0]?.parsed?.x ?? ''}`; },
            label(item) {
              const v = item.parsed?.y;
              return `${item.dataset.label}: ${Number.isFinite(v) ? v.toLocaleString('it-IT') : 'n.d.'}`;
            }
          }
        }
      },
      scales: {
        x: { type: 'linear', grid: { display: false }, ticks: { precision: 0 } },
        y: { beginAtZero: true }
      },
      interaction: { mode: 'index', intersect: false }
    }
  });
  container.__chart__ = chart;
}

// ----- Mini utilities -----
function getColor(value, min, max) {
  if (!Number.isFinite(value)) return 'rgb(240,0,0)';
  const denom = (max - min) || 1;
  const t = Math.max(0, Math.min(1, (value - min) / denom));
  const r = Math.round(210 + 45 * t);
  return `rgb(${r}, 0, 0)`;
}

class DetailTimelinePage {
  constructor() {
    // base
    this.base = getRepoBasePath();

    // dataset: 'demogen' | 'turismo'
    this.ds = 'demogen';

    // colonne chiave (per-dataset)
    this.keyComune = null;
    this.keyAnno = null;
    this.keySesso = null;    // solo demogen
    this.keyPopStart = null; // entrambi (per %)
    this.keyPopEnd = null;   // entrambi (per %)

    // dati raw
    this.rows = [];
    this.fieldsAll = [];     // colonne selezionabili
    this.displayNameByNorm = new Map();

    // stato
    this.comuneParam = '';
    this.comuneFeature = null;
    this.comuneBounds = null;

    this.sex = 'Totale';     // usato solo per demogen
    this.percentMode = false;

    this.selectedFields = new Set();
    this.years = [];
    this.yearMin = null;
    this.yearMax = null;

    // index: sexKey -> year -> comuneNorm -> row
    this.idx = new Map();

    // cache range SOLO comune (per le mini mappe)
    this._rangeCacheKey = null;
    this._rangeStats = null;

    // mini mappe
    this.miniMaps = new Map();
    this._raf = null;

    // DOM
    this.$titleComune = document.getElementById('dt-comune');
    this.$dsPill = document.getElementById('dt-ds-pill');
    this.$sexBlock = document.getElementById('dt-sex-block');

    this.$chips = document.getElementById('dt-fields-container');
    this.$lines = document.getElementById('dt-lines');

    this.$percent = document.getElementById('dt-percent-toggle');
    this.$hintComp = document.getElementById('dt-hint-comp');

    this.$rangePill = document.getElementById('dt-range-pill');
    this.$min = document.getElementById('dt-year-min');
    this.$max = document.getElementById('dt-year-max');

    this.$grid = document.getElementById('dt-map-grid');

    // tabs
    this.$tabDemogen = document.getElementById('tab-demogen');
    this.$tabTurismo = document.getElementById('tab-turismo');

    this.boot();
  }

  async boot() {
    // query param
    const p = new URLSearchParams(location.search);
    this.comuneParam = p.get('comune') ? String(p.get('comune')) : '';
    const fieldsParam = p.get('fields') ? decodeURIComponent(p.get('fields')).split(',').map(s=>s.trim()).filter(Boolean) : [];
    const sexParam = p.get('sex');
    const dsParam = p.get('ds');
    const pctParam = p.get('pct');

    if (dsParam === 'turismo' || dsParam === 'demogen') this.ds = dsParam;
    if (sexParam) this.sex = (sexParam === 'Maschi' || sexParam === 'Femmine') ? sexParam : 'Totale';
    if (pctParam) this.percentMode = (pctParam === '1' || pctParam === 'true');

    this.updateDsUI();

    this.$titleComune.textContent = this.comuneParam || '—';
    if (this.$percent) this.$percent.checked = !!this.percentMode;

    // carica dati (csv + comuni)
    await this.loadDataset();

    // preselezioni campi
    if (fieldsParam.length) fieldsParam.forEach(f => { if (this.fieldsAll.includes(f)) this.selectedFields.add(f); });
    if (this.selectedFields.size === 0 && this.fieldsAll.length) this.selectedFields.add(this.fieldsAll[0]);

    // UI
    this.renderChips();
    this.bindEvents();

    // anni e slider
    this.refreshYearsAndSliders();

    // grafico + mappe
    this.drawLines();
    await this.prepareComuneFeature();
    this.renderGridMaps();
  }

  updateDsUI() {
    const isDemogen = (this.ds === 'demogen');
    this.$sexBlock.style.display = isDemogen ? '' : 'none';
    this.$dsPill.textContent = isDemogen ? 'DEMOGRAFICA_GENERALE' : 'TURISMO';

    this.$tabDemogen.setAttribute('aria-selected', isDemogen ? 'true' : 'false');
    this.$tabTurismo.setAttribute('aria-selected', isDemogen ? 'false' : 'true');

    // hint confronto
    this.$hintComp.style.display = this.percentMode ? '' : 'none';
  }

  async loadDataset() {
    // 1) carica CSV
    const url = (this.ds === 'demogen')
      ? this.base + 'data/demografica_generale.csv'
      : this.base + 'data/turismo_anno.csv';

    const text = await fetch(url).then(r=>r.text());
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    this.rows = parsed.data || [];

    // 2) mappa chiavi per dataset
    if (this.ds === 'demogen') {
      this.keyComune   = this.findKey(['comune','Comune','COMUNE']);
      this.keyAnno     = this.findKey(['Anno','anno','ANNO']);
      this.keySesso    = this.findKey(['Sesso','sesso','SESSO']);
      this.keyPopStart = this.findKey(['Popolazione inizio periodo']);
      this.keyPopEnd   = this.findKey(['Popolazione fine periodo']);
    } else {
      this.keyComune   = this.findKey(['Comune / Municipality','comune','Comune']);
      this.keyAnno     = this.findKey(['anno','Anno']);
      this.keySesso    = null; // non esiste
      this.keyPopStart = this.findKey(['Popolazione inizio periodo','pop_inizio','Pop_inizio']);
      this.keyPopEnd   = this.findKey(['Popolazione fine periodo','pop_fine','Pop_fine']);
    }

    // 3) estrae colonne selezionabili
    const exclude = new Set(['', this.keyComune, this.keyAnno, this.keySesso, this.keyPopStart, this.keyPopEnd].filter(Boolean));
    const cols = Object.keys(this.rows[0] || {})
      .map(k => String(k).replace(/^\uFEFF/,'').trim())
      .filter(k => !exclude.has(k));

    this.fieldsAll = Array.from(new Set(cols));

    // 4) indicizza: sexKey -> year -> comuneNorm -> row
    this.buildIndex();

    // 5) anni disponibili
    this.years = this.getYearsForCurrentSex();
  }

  findKey(candidates) {
    const head = this.rows[0] ? Object.keys(this.rows[0]) : [];
    for (const c of candidates) {
      const hit = head.find(k => String(k).trim() === c);
      if (hit) return hit;
    }
    return null;
  }

  buildIndex() {
    this.idx.clear();
    this.displayNameByNorm.clear();
    const sexKey = (row) => {
      if (this.keySesso) {
        const s = String(row[this.keySesso] || '').trim();
        return (s === 'Maschi' || s === 'Femmine') ? s : 'Totale';
      }
      return 'Totale';
    };
    const ensure = (map, key, ctor) => { if (!map.has(key)) map.set(key, ctor()); return map.get(key); };

    for (const r0 of this.rows) {
      const r = r0 || {};
      const y = parseInt(r[this.keyAnno], 10);
      if (!Number.isFinite(y)) continue;
      const k = norm(r[this.keyComune]);
      const sx = sexKey(r);

      const bySex = ensure(this.idx, sx, () => new Map());
      const byYear = ensure(bySex, y, () => new Map());
      byYear.set(k, r);

      // alias prima parola
      const first = k.split(' ')[0];
      if (!byYear.has(first)) byYear.set(first, r);

      // display name
      const display = String(r[this.keyComune] || '').trim();
      if (!this.displayNameByNorm.has(k)) this.displayNameByNorm.set(k, display);
    }
  }

  getYearsForCurrentSex() {
    const sKey = this.keySesso ? this.sex : 'Totale';
    const bySex = this.idx.get(sKey) || new Map();
    return Array.from(bySex.keys()).sort((a,b)=>a-b);
  }

  async prepareComuneFeature() {
    const comuni = await fetch(this.base + 'data/comuni.geojson').then(r=>r.json());
    const wanted = norm(this.comuneParam || '');
    const feats = comuni?.features || [];
    this.comuneFeature = feats.find(f => {
      const nm = norm(f.properties?.Name || f.properties?.name || '');
      return nm === wanted || nm.startsWith(wanted) || wanted.startsWith(nm);
    });
    if (!this.comuneFeature) {
      this.$grid.innerHTML = `<div style="padding:10px 6px;color:#ef4444;font-size:14px">Comune "<strong>${this.comuneParam}</strong>" non trovato in <code>comuni.geojson</code>.</div>`;
      return;
    }
    const fg = L.geoJSON(this.comuneFeature);
    this.comuneBounds = fg.getBounds();
  }

  // ----- UI -----
  bindEvents() {
    // tabs dataset
    this.$tabDemogen.addEventListener('click', async () => {
      if (this.ds === 'demogen') return;
      this.ds = 'demogen';
      this.sex = 'Totale';
      this.updateDsUI();
      await this.loadDataset();
      this.selectedFields.clear();
      if (this.fieldsAll.length) this.selectedFields.add(this.fieldsAll[0]);
      this.renderChips();
      this.refreshYearsAndSliders();
      this.drawLines();
      this.invalidateStatsCache();
      this.renderGridMaps();
    });

    this.$tabTurismo.addEventListener('click', async () => {
      if (this.ds === 'turismo') return;
      this.ds = 'turismo';
      this.updateDsUI();
      await this.loadDataset();
      this.selectedFields.clear();
      if (this.fieldsAll.length) this.selectedFields.add(this.fieldsAll[0]);
      this.renderChips();
      this.refreshYearsAndSliders();
      this.drawLines();
      this.invalidateStatsCache();
      this.renderGridMaps();
    });

    // percent switch
    this.$percent.addEventListener('change', () => {
      this.percentMode = !!this.$percent.checked;
      this.updateDsUI();
      this.drawLines();
      this.invalidateStatsCache();
      this.renderGridMaps();
    });

    // sesso
    document.querySelectorAll('input[name="dt-sex"]').forEach(r => {
      r.addEventListener('change', () => {
        if (this.ds !== 'demogen') return;
        this.sex = document.querySelector('input[name="dt-sex"]:checked')?.value || 'Totale';
        this.years = this.getYearsForCurrentSex();
        this.refreshYearsAndSliders();
        this.drawLines();
        this.invalidateStatsCache();
        this.renderGridMaps();
      });
    });
  }

  renderChips() {
    this.$chips.innerHTML = '';
    this.fieldsAll.forEach(f => {
      const div = document.createElement('div');
      div.className = 'dt-chip' + (this.selectedFields.has(f) ? ' active' : '');
      div.textContent = f;
      div.title = f;
      div.dataset.field = f;
      div.addEventListener('click', () => {
        if (this.selectedFields.has(f)) this.selectedFields.delete(f);
        else this.selectedFields.add(f);
        div.classList.toggle('active');
        this.drawLines();
        this.invalidateStatsCache();
        this.renderGridMaps();
      });
      this.$chips.appendChild(div);
    });
  }

  // invalida la cache usata per calcolare min/max del SOLO comune nel range selezionato
  invalidateStatsCache() {
    // (se le usi ancora) invalida le vecchie cache per-anno
    if (this.cacheByYear) this.cacheByYear.clear?.();
    this.cacheKey = null;

    // cache del range SOLO COMUNE (usata per colorare le mini-mappe)
    this._rangeCacheKey = null;
    this._rangeStats = null;
  }

  refreshYearsAndSliders() {
    if (!this.years.length) {
      this.yearMin = this.yearMax = null;
      this.$min.disabled = true; this.$max.disabled = true;
      this.$rangePill.textContent = '—';
      return;
    }
    const min = Math.min(...this.years);
    const max = Math.max(...this.years);

    if (this.yearMin === null) this.yearMin = min;
    if (this.yearMax === null) this.yearMax = max;

    this.yearMin = Math.max(min, Math.min(this.yearMin, max));
    this.yearMax = Math.max(this.yearMin, Math.min(this.yearMax, max));

    this.$min.disabled = false; this.$max.disabled = false;
    this.$min.min = this.$max.min = String(min);
    this.$min.max = this.$max.max = String(max);
    this.$min.value = String(this.yearMin);
    this.$max.value = String(this.yearMax);
    this.$rangePill.textContent = `${this.yearMin} – ${this.yearMax}`;

    this.$min.oninput = () => {
      this.yearMin = Math.min(parseInt(this.$min.value,10), this.yearMax);
      this.$min.value = String(this.yearMin);
      this.$rangePill.textContent = `${this.yearMin} – ${this.yearMax}`;
      this.invalidateStatsCache();
      this.scheduleGridRender();
    };
    this.$max.oninput = () => {
      this.yearMax = Math.max(parseInt(this.$max.value,10), this.yearMin);
      this.$max.value = String(this.yearMax);
      this.$rangePill.textContent = `${this.yearMin} – ${this.yearMax}`;
      this.invalidateStatsCache();
      this.scheduleGridRender();
    };

    // aggiorna stato radio sesso alla UI
    if (this.ds === 'demogen') {
      document.querySelectorAll('input[name="dt-sex"]').forEach(r => { r.checked = (r.value === this.sex); });
    }
  }

  // ----- Serie storiche -----
  drawLines() {
    const container = this.$lines;
    if (!container) return;

    const fields = [...this.selectedFields];
    if (!fields.length) {
      container.innerHTML = `<div style="font-size:12px;color:#6b7280;padding:6px 2px;">Seleziona almeno un campo per la serie storica.</div>`;
      return;
    }

    const comuneNorm = this.comuneParam ? norm(this.comuneParam) : null;
    const sKey = this.keySesso ? this.sex : 'Totale';
    const bySex = this.idx.get(sKey) || new Map();

    const valFor = (row, field) => {
      let v = toNumber(row?.[field]);
      if (this.percentMode && this.keyPopStart && this.keyPopEnd) {
        const den = (toNumber(row[this.keyPopStart]) + toNumber(row[this.keyPopEnd])) / 2;
        v = den > 0 ? (v / den) : 0;
      }
      return v;
    };

    const series = [];

    // 1) città selezionata (colorata)
    for (const f of fields) {
      const pts = [];
      for (const [year, mapComune] of bySex.entries()) {
        const r = comuneNorm
          ? (mapComune.get(comuneNorm)
              || mapComune.get(comuneNorm.split(' ')[0])
              || [...mapComune.entries()].find(([k]) => k.startsWith(comuneNorm))?.[1])
          : null;
        if (!r) continue;
        pts.push({ x: year, y: valFor(r, f) });
      }
      if (pts.length) {
        const label = comuneNorm ? `${this.comuneParam} — ${f}` : f;
        series.push({
          label,
          data: pts.sort((a,b)=>a.x-b.x),
          borderWidth: 2,
          pointRadius: 2
        });
      }
    }

    // 2) in modalità %: aggiungi altre città in grigio (max 25)
    if (this.percentMode && comuneNorm) {
      const others = new Set();
      for (const [, mapComune] of bySex.entries()) {
        for (const k of mapComune.keys()) {
          if (k.length < 2) continue;
          if (k === comuneNorm || k === comuneNorm.split(' ')[0]) continue;
          others.add(k);
        }
      }
      const MAX_OTHERS = 25;
      const othersArr = Array.from(others).slice(0, MAX_OTHERS);

      for (const otherKey of othersArr) {
        const pretty = this.displayNameByNorm.get(otherKey) || otherKey;
        for (const f of fields) {
          const pts = [];
          for (const [year, mapComune] of bySex.entries()) {
            const r = mapComune.get(otherKey)
              || mapComune.get(otherKey.split(' ')[0])
              || [...mapComune.entries()].find(([k]) => k.startsWith(otherKey))?.[1];
            if (!r) continue;
            pts.push({ x: year, y: valFor(r, f) });
          }
          if (pts.length >= 2) {
            series.push({
              label: `${pretty} — ${f}`,
              data: pts.sort((a,b)=>a.x-b.x),
              borderColor: 'rgba(107,114,128,0.5)',
              backgroundColor: 'rgba(0,0,0,0)',
              borderWidth: 1,
              pointRadius: 0,
              tension: 0.25
            });
          }
        }
      }
    }

    if (!series.length) {
      container.innerHTML = `<div style="font-size:12px;color:#6b7280;padding:6px 2px;">Nessuna serie trovata per la selezione corrente.</div>`;
      return;
    }

    renderLines(container, series);
  }

  // ----- Mappe (solo comune selezionato) -----
  comuneValueForYear(y) {
    const sKey = this.keySesso ? this.sex : 'Totale';
    const bySex = this.idx.get(sKey) || new Map();
    const mapComune = bySex.get(y) || new Map();

    const k = norm(this.comuneParam || '');
    const r = mapComune.get(k)
      || mapComune.get(k.split(' ')[0])
      || [...mapComune.entries()].find(([kk]) => kk.startsWith(k))?.[1];
    if (!r) return null;

    const valFor = (row, field) => {
      let v = toNumber(row?.[field]);
      if (this.percentMode && this.keyPopStart && this.keyPopEnd) {
        const den = (toNumber(row[this.keyPopStart]) + toNumber(row[this.keyPopEnd])) / 2;
        v = den > 0 ? (v / den) : 0;
      }
      return v;
    };

    let sum = 0, n = 0;
    for (const f of this.selectedFields) { sum += valFor(r, f); n++; }
    return n ? (sum / n) : null;
  }

  getComuneRangeStats() {
    const key = [
      this.ds,
      this.keySesso ? this.sex : 'Totale',
      [...this.selectedFields].sort().join('|'),
      norm(this.comuneParam || ''),
      this.yearMin, this.yearMax,
      this.percentMode ? 'pct' : 'abs'
    ].join('||');

    if (this._rangeCacheKey === key && this._rangeStats) return this._rangeStats;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    if (this.yearMin != null && this.yearMax != null) {
      for (let y = this.yearMin; y <= this.yearMax; y++) {
        const v = this.comuneValueForYear(y);
        if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
      }
    }
    if (!isFinite(min)) min = 0;
    if (!isFinite(max) || max <= min) max = min + 1;

    this._rangeCacheKey = key;
    this._rangeStats = { min, max };
    return this._rangeStats;
  }

  computeStatsForYear(y) {
    const { min, max } = this.getComuneRangeStats();
    const value = this.comuneValueForYear(y);
    return { min, max, value: Number.isFinite(value) ? value : 0 };
  }

  scheduleGridRender() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this.renderGridMaps();
      this._raf = null;
    });
  }

  insertCardSorted(card, year) {
  card.dataset.year = String(year);
  const kids = Array.from(this.$grid.children);
  const idx = kids.findIndex(el => parseInt(el.dataset.year, 10) > year);
  if (idx === -1) this.$grid.appendChild(card);
  else this.$grid.insertBefore(card, kids[idx]);
}

  ensureMiniMap(year) {
    if (this.miniMaps.has(year)) return this.miniMaps.get(year);

    // Card DOM
    const card = document.createElement('div');
    card.className = 'dt-map-card';
    card.dataset.year = String(year);

    const header = document.createElement('div');
    header.className = 'dt-map-card-header';
    header.innerHTML = `<div>Anno <strong>${year}</strong></div><div class="dt-map-tag">${this.sex}</div>`;

    const body = document.createElement('div');
    body.className = 'dt-map-card-body';

    card.appendChild(header);
    card.appendChild(body);

    // Inserimento in ordine crescente per anno
    this.insertCardSorted(card, year);

    // Leaflet mini mappa
    const map = L.map(body, {
      zoomControl: false, attributionControl: false,
      scrollWheelZoom: false, dragging: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false,
      zoomAnimation: false, fadeAnimation: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, updateWhenIdle: true, updateWhenZooming: false
    }).addTo(map);

    const layer = L.geoJSON({ type: 'FeatureCollection', features: [this.comuneFeature] }, {
      style: { fillColor: 'transparent', fillOpacity: 0.5, color: '#666', weight: 0.8 }
    }).addTo(map);

    if (this.comuneBounds && this.comuneBounds.isValid && this.comuneBounds.isValid()) {
      map.fitBounds(this.comuneBounds, { padding: [8,8] });
    }

    const entry = { map, layer, card, header, body };
    this.miniMaps.set(year, entry);
    return entry;
  }

  updateMiniMap(year, stats) {
    const entry = this.ensureMiniMap(year);
    const denom = (stats.max - stats.min) || 1;
    let t = Number.isFinite(stats.value) ? (stats.value - stats.min) / denom : 0;
    t = Math.max(0, Math.min(1, t));
    const color = getColor(stats.value, stats.min, stats.max);

    entry.layer.setStyle({
      fillColor: color,
      fillOpacity: 0.12 + 0.68 * t,
      color: t > 0 ? '#666' : '#9ca3af',
      weight: 0.8
    });
    const tag = entry.header.querySelector('.dt-map-tag');
    if (tag) tag.textContent = this.keySesso ? this.sex : '';
  }

  destroyMiniMap(year) {
    const entry = this.miniMaps.get(year);
    if (!entry) return;
    try { entry.map.remove(); } catch {}
    try { entry.card.remove(); } catch {}
    this.miniMaps.delete(year);
  }

  clearAllMiniMaps() {
    for (const y of [...this.miniMaps.keys()]) this.destroyMiniMap(y);
    this.$grid.innerHTML = '';
  }

  renderGridMaps() {
    if (!this.comuneFeature) return;
    const fields = [...this.selectedFields];
    if (!fields.length) {
      this.$grid.innerHTML = `<div style="font-size:12px;color:#6b7280;padding:6px 2px;">Seleziona almeno un campo per generare le mappe.</div>`;
      this.clearAllMiniMaps();
      return;
    }
    if (this.yearMin === null || this.yearMax === null) return;

    const yearsWanted = [];
    for (let y = this.yearMin; y <= this.yearMax; y++) yearsWanted.push(y);

    // rimuovi non più necessari
    for (const y of this.miniMaps.keys()) {
      if (y < this.yearMin || y > this.yearMax) this.destroyMiniMap(y);
    }

    // crea/aggiorna in ordine crescente
    for (const y of yearsWanted) {
      const stats = this.computeStatsForYear(y);
      this.updateMiniMap(y, stats);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DetailTimelinePage();
});
