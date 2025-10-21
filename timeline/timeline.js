// timeline/timeline.js
// Richiede: Chart.js, timeline_charts.js, map.js (window.mapManager), dashboard.js (window.dashboard)

(function () {

    class Timeline {
      constructor() {
        this.root = null;
        this.range = null;
        this.yearPill = null;
        this.chartContainer = null;
  
        this.currentYears = [2021, 2021]; // min,max
        this.currentYear = 2021;
  
        this.initDOM();
        this.attachListeners();
        this.refreshFromMap();  // prima init
      }
  
      initDOM() {
        const root = document.createElement('div');
        root.id = 'timeline-root';
        root.innerHTML = `
          <div class="timeline-container">
            <div class="timeline-header">
              <div class="timeline-title">Timeline</div>
              <div class="timeline-year-pill" id="timeline-year-pill">Anno: —</div>
            </div>
            <div class="timeline-charts">
              <div id="timeline-lines"></div>
            </div>
            <div class="timeline-controls">
              <input type="range" id="timeline-year-range" min="2000" max="2025" step="1" value="2025" />
              <div class="timeline-legend" id="timeline-legend">Seleziona un anno per filtrare i dati mostrati in mappa.</div>
            </div>
          </div>
        `;
        document.body.appendChild(root);
        this.root = root;
        this.range = document.getElementById('timeline-year-range');
        this.yearPill = document.getElementById('timeline-year-pill');
        this.chartContainer = document.getElementById('timeline-lines');
      }
  
      attachListeners() {
        // Slider → aggiorna anno
        this.range.addEventListener('input', (e) => {
          const year = parseInt(e.target.value, 10);
          this.currentYear = year;
          this.updateYearPill();
          // Informa la mappa
          window.mapManager?.setYear?.(year);
          // Aggiorna grafici (non serve aspettare il re-render)
          this.drawLines();
        });
  
        // Reagisci agli update della mappa e della dashboard
        window.addEventListener('map:updated', () => this.refreshFromMap());
        window.addEventListener('dashboard:selectionChanged', () => this.refreshFromMap());
  
        // Reagisci al cambio filtro sesso DEMOGEN
        document.getElementById('sex-filter-demogen')?.addEventListener('change', () => {
          this.refreshFromMap();
        });
  
        // Reagisci al cambio toggle città
        document.getElementById('city-toggles')?.addEventListener('change', () => {
          this.refreshFromMap();
        });
      }
  
      updateYearPill() {
        this.yearPill.textContent = `Anno: ${this.currentYear}`;
      }
  
      refreshFromMap() {
        // 1) anni disponibili dal processor corrente
        const years = window.mapManager?.getAvailableYears?.();
        if (Array.isArray(years) && years.length) {
          const min = Math.min(...years);
          const max = Math.max(...years);
          this.currentYears = [min, max];
          // mantieni l'anno se cade nel range; altrimenti clamp
          if (!Number.isFinite(this.currentYear) || this.currentYear < min || this.currentYear > max) {
            this.currentYear = max;
          }
          this.range.min = String(min);
          this.range.max = String(max);
          this.range.value = String(this.currentYear);
          this.updateYearPill();
        }
  
        // 2) ridisegna i grafici
        this.drawLines();
      }
  
      getActiveContext() {
        // Campi selezionati: la dashboard salva qui la lista "effettiva" dei campi da mappa
        const selectedFields = Array.isArray(window.selectedFields) ? window.selectedFields.slice() : [];
        if (!selectedFields.length) return null;

        // Quale file è attivo in mappa
        const fileType = window.mapManager?.lastFileType || window.mapManager?.currentFileType || 'stat_data';

        // Per dem_gen e turismo i campi sono già "reali" (nomi colonna del CSV)
        const fieldsReadable = selectedFields.slice();

        // Comuni selezionati (serve a dem_gen e turismo)
        const togglesRoot = document.getElementById('city-toggles');
        const checked = togglesRoot
          ? [...togglesRoot.querySelectorAll('input[type=checkbox]:checked')].map(i => i.id.replace(/^toggle-/, ''))
          : [];
        const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
        const comuniSet = new Set(checked.map(normalize));

        // Filtro sesso (solo dem_gen)
        const sex = document.querySelector('input[name="sex-demogen"]:checked')?.value || 'Totale';

        return { fileType, selectedFields, fieldsReadable, comuniSet, sex };
      }

      drawLines() {
        const ctx = this.getActiveContext();
        const container = this.chartContainer;
        if (!ctx || !container) return;

        // Supporto: DEMOGRAFICA_GENERALE e TURISMO
        if (ctx.fileType !== 'demografica_generale' && ctx.fileType !== 'turismo') {
          container.innerHTML = `<div style="font-size:12px;color:#6b7280;padding:6px 2px;">Serie storica: attiva per DEMOGRAFICA_GENERALE e TURISMO.</div>`;
          return;
        }

        const proc = window.mapManager?.dataProcessor;
        if (!proc || typeof proc.getTimeSeriesFor !== 'function') {
          container.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:6px 2px;">Impossibile costruire la serie storica (processor non compatibile).</div>`;
          return;
        }

        // Se nessun comune selezionato → aggrego (proc decide come)
        const comuni = ctx.comuniSet.size ? [...ctx.comuniSet] : [];

        const series = [];
        for (const field of ctx.fieldsReadable) {
          if (comuni.length === 0) {
            const ts = proc.getTimeSeriesFor(field, null, ctx.sex);
            if (ts?.length) series.push({ label: field, data: ts.map(d => ({ x: d.year, y: d.value })) });
          } else {
            for (const comune of comuni) {
              const ts = proc.getTimeSeriesFor(field, comune, ctx.sex);
              if (ts?.length) {
                series.push({
                  label: `${capitalize(comune)} — ${field}`,
                  data: ts.map(d => ({ x: d.year, y: d.value }))
                });
              }
            }
          }
        }

        if (!series.length) {
          container.innerHTML = `<div style="font-size:12px;color:#6b7280;padding:6px 2px;">Nessuna serie disponibile per la selezione corrente.</div>`;
          return;
        }

        window.timelineChartManager.renderLines(container, series);
      }
    }
  
    function capitalize(s) {
      s = String(s || '');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  
    // Boot
    window.addEventListener('DOMContentLoaded', () => {
      window.timeline = new Timeline();
    });
  
  })();
  