// /info/info.js
import { getRepoBasePath } from '../utils.js';

const base = getRepoBasePath();

/* === Disponibilità: rimosso Trento come richiesto === */
const AVAILABILITY = {
  napoli: { stat_data:true, demografica:true,  dem_gen:true, turismo:true },
  genova: { stat_data:true, demografica:false, dem_gen:true, turismo:true },
  fvg:    { stat_data:false, demografica:false, dem_gen:true, turismo:true }
};

function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').trim();

/* =========================
   WIKIPEDIA – anteprime città
   ========================= */
async function fetchWikiSummary(title){
  const url = `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try{
    const r = await fetch(url, { headers:{'accept':'application/json'} });
    if(!r.ok) throw new Error('wiki not ok');
    const j = await r.json();
    return {
      title: j.title || title,
      desc: j.extract || '',
      img: (j.thumbnail && j.thumbnail.source) ? j.thumbnail.source : null,
      url: j.content_urls?.desktop?.page || null
    };
  }catch{ return { title, desc:'', img:null, url:null }; }
}

async function buildCityCard(node, city){
  const data = await fetchWikiSummary(city);
  node.innerHTML = `
    <div class="city-card__img" style="${data.img ? `background-image:url('${data.img}')` : ''}"></div>
    <div class="city-card__scrim"></div>
    <div class="city-card__body">
      <div class="city-card__title">${data.title}</div>
      <div class="city-card__desc">${data.desc || '—'}</div>
      ${data.url ? `<div style="margin-top:8px"><a class="btn btn--ghost btn--tiny" href="${data.url}" target="_blank" rel="noopener">Wikipedia</a></div>` : ''}
    </div>`;
}

async function buildCities(){
  const grid = document.getElementById('cities-grid');
  // card singole
  for (const node of grid.querySelectorAll('.city-card:not(.fvg-card)')) {
    await buildCityCard(node, node.dataset.city);
  }
  // macro FVG
  const fvg = grid.querySelector('.fvg-card');
  if (fvg){
    for (const mini of fvg.querySelectorAll('.mini-city')){
      const city = mini.dataset.city;
      const data = await fetchWikiSummary(city);
      mini.innerHTML = `
        <div class="city-card__img" style="${data.img ? `background-image:url('${data.img}')` : ''}"></div>
        <div class="city-card__scrim"></div>
        <div class="city-card__body">
          <div class="city-card__title">${data.title}</div>
        </div>`;
    }
  }
}

/* =========================
   DATASETS META
   ========================= */
function areasBadges(ds){
  const arr = [];
  const add = (label, ok) => arr.push(`<span class="badge ${ok?'badge--ok':'badge--no'}">${label}</span>`);
  add('Napoli', AVAILABILITY.napoli[ds]);
  add('Genova', AVAILABILITY.genova[ds]);
  add('FVG',    AVAILABILITY.fvg[ds]);
  return arr.join(' ');
}
function areasCount(ds){
  let n=0;
  if (AVAILABILITY.napoli[ds]) n++;
  if (AVAILABILITY.genova[ds]) n++;
  if (AVAILABILITY.fvg[ds]) n++;
  return n;
}

async function loadSpiegazione(){
  const csv = await fetch(base + 'data/spiegazione_dati.csv').then(r=>r.text()).catch(()=> '');
  if (!csv) return [];
  const rows = Papa.parse(csv, { header:true, skipEmptyLines:true }).data || [];
  const col = (row, ...ks) => { for(const k of ks){ if(row[k]!=null && String(row[k]).trim()!=='') return String(row[k]).trim(); } return ''; };
  return rows.map(r => ({
    file: col(r,'file','File','FILE','dataset','Dataset').toLowerCase(),
    ambito: col(r,'ambito','Ambito','AMBITO'),
    id: col(r,'ID','Id','id'),
    name: col(r,'DENOMINAZIONE','Denominazione','denominazione'),
    definizione: col(r,'DEFINIZIONE','Definizione','definizione'),
    fonte: col(r,'FONTI','Fonti','fonti')
  }));
}
async function loadDemGenColumns(){
  const csv = await fetch(base + 'data/demografica_generale.csv').then(r=>r.text()).catch(()=> '');
  if (!csv) return [];
  const rows = Papa.parse(csv, { header:true, skipEmptyLines:true }).data || [];
  if (!rows.length) return [];
  const exclude = new Set(['comune','Comune','COMUNE','Anno','ANNO','Sesso','SESSO','']);
  const clean = s => String(s ?? '').replace(/^\uFEFF/, '').trim();
  let cols = Object.keys(rows[0]).map(clean).filter(k => !exclude.has(k));
  return [...new Set(cols)];
}
async function loadTurismoMeta(){
  const csv = await fetch(base + 'data/turismo_anno.csv').then(r=>r.text()).catch(()=> '');
  if (!csv) return { list:[] };
  const rows = Papa.parse(csv, { header:true, skipEmptyLines:true }).data || [];
  if (!rows.length) return { list:[] };
  const cols = Object.keys(rows[0]);
  const suf = cols.some(c=>/_not_res$/.test(c)) ? {res:'res', notres:'not_res', tot:'tot'} : {res:'res', notres:'notres', tot:'tot'};
  const macros = ['arrivi','pernottamenti']; const subs = ['eserc','alberghi','extra'];
  const list=[];
  for(const m of macros){
    for(const s of subs){
      const any = ['res','notres','tot'].some(k => cols.includes(`${m}_${s}_${suf[k]}`));
      if (any) list.push(`${m}_${s}_tot`);
    }
  }
  return { list };
}

/* =========================
   UI: Tabs + Pannello
   ========================= */
function presetHref(ds){ return `../index.html?ds=${encodeURIComponent(ds)}`; }
function explainer(ds){
  if (ds==='stat_data')
    return `Indicatori territoriali (ASC), anno 2021. Se selezioni più variabili, usiamo la <em>media semplice</em> e coloriamo con normalizzazione min–max.`;
  if (ds==='demografica')
    return `Dati demografici 2021 per municipalità/ASC (Napoli).`;
  if (ds==='dem_gen')
    return `Serie Comune×Anno×Sesso. Modalità %: <code>valore / ((Pop. inizio + Pop. fine)/2)</code>.`;
  if (ds==='turismo')
    return `Arrivi e Pernottamenti per Comune×Anno (residenti, non residenti, totale). Modalità %: <code>valore / ((Pop. inizio + Pop. fine)/2)</code>.`;
  return '';
}

function fieldsPills(list){
  if (!list || !list.length) return '<div class="muted">—</div>';
  return list.map(f=>`<span class="field-pill">${f}</span>`).join('');
}

function buildShowMore(container, total, renderAll){
  const btn = el(`<div class="showmore">Mostra tutti (${total})</div>`);
  btn.addEventListener('click', ()=>{
    const expanded = container.classList.toggle('collapsed') === false;
    btn.textContent = expanded ? 'Mostra meno' : `Mostra tutti (${total})`;
    container.innerHTML = expanded ? fieldsPills(renderAll()) : fieldsPills(renderAll().slice(0, 24)) + '<div class="fade"></div>';
  });
  return btn;
}

function renderDetails(target, ds, meta){
  const fields = meta.fields || [];
  const total = fields.length;
  const areas = areasBadges(ds);
  const countAreas = areasCount(ds);

  target.innerHTML = `
    <div class="ds-head">
      <div class="left">
        <div class="ds-title">${ds.toUpperCase().replace('_',' ')}</div>
        <div class="ds-count">${total} campi • ${countAreas} aree</div>
      </div>
      <div class="ds-areas">${areas}</div>
    </div>

    <div class="ds-body">
      <div class="ds-col">
        <div class="ds-block-title">Come funziona</div>
        <p style="color:#e7f7ff; line-height:1.5">${explainer(ds)}</p>

        <div class="ds-block-title" id="formula">Formula (modalità %)</div>
        <pre style="margin:0;background:rgba(0,0,0,.25);padding:10px;border-radius:10px;border:1px solid rgba(57,247,255,.25);color:#dffcff">
percentuale = valore / ((Popolazione_inizio_periodo + Popolazione_fine_periodo) / 2)
        </pre>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px">
          <a class="btn btn--primary" href="${presetHref(ds)}">Apri nella mappa</a>
          ${ds==='dem_gen' ? `<a class="btn btn--ghost" href="../detail_timeline_page/index.html" target="_blank">Pagina di dettaglio</a>` : ''}
        </div>
      </div>

      <div class="ds-col">
        <div class="ds-block-title">Campi disponibili</div>
        <div class="fields ${total>24 ? 'collapsed' : ''}" id="fields-box">
          ${fieldsPills(fields.slice(0, 24))}
          ${total>24 ? '<div class="fade"></div>' : ''}
        </div>

        <div class="ds-block-title" style="margin-top:10px">Fonti</div>
        <p style="color:#e7f7ff; font-size:13px; margin:0">
          Dati <strong>ISTAT</strong> per tutti i dataset, tranne il rischio idrogeologico (<strong>ISPRA</strong>).
        </p>
      </div>
    </div>
  `;

  if (total>24){
    const box = target.querySelector('#fields-box');
    target.appendChild(buildShowMore(box, total, () => fields));
  }
}

async function buildDatasetTabs(){
  const tabs = document.getElementById('datasets-tabs');
  const panel = document.getElementById('dataset-details');

  // carica meta
  const spieg = await loadSpiegazione();
  const demGenCols = await loadDemGenColumns();
  const turMeta = await loadTurismoMeta();

  const meta = {
    stat_data: {
      fields: spieg.filter(r=>r.file==='stat_data').map(r=>r.name)
    },
    demografica: {
      fields: spieg.filter(r=>r.file==='demografica').map(r=>r.name)
    },
    dem_gen: {
      fields: demGenCols
    },
    turismo: {
      fields: turMeta.list
    }
  };

  const order = [
    { key:'stat_data', label:'STAT DATA' },
    { key:'demografica', label:'DEMOGRAFICA (2021)' },
    { key:'dem_gen', label:'DEMOGRAFICA GENERALE' },
    { key:'turismo', label:'TURISMO' }
  ];

  order.forEach(ds => {
    const t = el(`
      <button class="ds-tab" data-ds="${ds.key}">
        <span class="dot"></span>
        <span class="title">${ds.label}</span>
        <span class="meta">
          <span>${(meta[ds.key].fields||[]).length} campi</span> •
          <span>${areasCount(ds.key)} aree</span>
        </span>
      </button>
    `);
    tabs.appendChild(t);
  });

  function activate(dsKey){
    tabs.querySelectorAll('.ds-tab').forEach(b => b.classList.toggle('is-active', b.dataset.ds===dsKey));
    renderDetails(panel, dsKey, meta[dsKey]);
  }

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.ds-tab'); if (!b) return;
    activate(b.dataset.ds);
  });

  // attiva il primo di default
  activate('stat_data');
}

/* =========================
   BOOT
   ========================= */
window.addEventListener('DOMContentLoaded', async () => {
  await buildCities();
  await buildDatasetTabs();
});
