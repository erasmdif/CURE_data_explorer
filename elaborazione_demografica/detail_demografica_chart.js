class DetailChartDemografica {
  constructor() {
    this.chartJSLoaded = false;
    this.data = null;
    this.fullView = false;
    this.chartInstance = null;
    this.loadChartJS();
    this.loadDetailData();
  }

  async loadChartJS() {
    if (typeof Chart === 'undefined') {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
        script.onload = () => {
          this.chartJSLoaded = true;
          console.log('✅ Chart.js caricato correttamente (detail)');
          resolve();
        };
        document.head.appendChild(script);
      });
    } else {
      this.chartJSLoaded = true;
    }
  }

  async loadDetailData() {
    try {
      const res = await fetch("../data/demografica_2021_dettaglio.csv");
      const text = await res.text();
      const rows = text.trim().split("\n").map(row => row.split(","));
      const header = rows[0].map(h => h.trim());

      this.data = rows.slice(1).map((r) => {
        const obj = {};
        header.forEach((h, i) => {
          const val = r[i]?.trim();
          if (val !== undefined) {
            obj[h] = isNaN(val) || val === '' ? val : Number(val);
          }
        });
        obj.ASC_1LIV_COD = obj.ASC_1LIV_COD?.toString().trim();
        obj.SEZ2011 = obj.SEZ2011?.toString().trim();
        return obj;
      });

      console.log("📊 Detail data loaded:", this.data.length, "righe");
      if (this.data.length > 0) {
        console.log("📌 Esempio riga:", this.data[0]);
      }
    } catch (e) {
      console.error("❌ Errore nel caricamento del CSV di dettaglio:", e);
    }
  }

  async createTrendChart(fields, ascCode, container) {
    console.log("📥 createTrendChart chiamato con ASC_1LIV_COD:", ascCode);
    console.log("📋 Campi selezionati:", fields);

    if (!this.chartJSLoaded) await this.loadChartJS();
    if (!this.data || !ascCode || !container) {
      console.warn("🚫 Dati mancanti: ", { chartJSLoaded: this.chartJSLoaded, data: this.data, ascCode, container });
      container.innerHTML = '<div style="color:red">Dati mancanti per generare il grafico</div>';
      return;
    }

    const ascCodeClean = ascCode.toString().trim();
    const filtered = this.data.filter(row => row.ASC_1LIV_COD === ascCodeClean);

    if (filtered.length === 0) {
      container.innerHTML = '<div style="color:darkorange">Nessun dato di dettaglio disponibile</div>';
      return;
    }

    const valuesBySection = {};
    filtered.forEach(row => {
      const key = row.SEZ2011 || "sezione_sconosciuta";
      if (!valuesBySection[key]) valuesBySection[key] = 0;
      fields.forEach(f => {
        const v = row[f];
        if (typeof v === 'number' && !isNaN(v)) {
          valuesBySection[key] += v;
        }
      });
    });

    const labels = Object.keys(valuesBySection).sort();
    const values = labels.map(k => valuesBySection[k]);

    const compactLimit = 8;
    const showAll = this.fullView || labels.length <= compactLimit;

    const displayLabels = showAll ? labels : labels.slice(0, compactLimit);
    const displayValues = showAll ? values : values.slice(0, compactLimit);

    container.innerHTML = '';

    const canvas = document.createElement("canvas");
    canvas.style.height = "300px"; 
    canvas.style.width = "100%"; 
    canvas.id = "trendChartCanvas";
    
    container.appendChild(canvas);

    const button = document.createElement("button");
    button.textContent = showAll ? "⬆ Mostra meno" : "⬇ Mostra tutte le sezioni";
    button.style.cssText = "margin-top: 10px; background: #eee; padding: 4px 8px; border: 1px solid #ccc; cursor: pointer;";
    button.onclick = () => {
      this.fullView = !this.fullView;
      this.createTrendChart(fields, ascCode, container);
    };

    container.appendChild(button);

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    this.chartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: displayLabels,
        datasets: [{
          label: "Somma dei valori per sezione",
          data: displayValues,
          fill: false,
          borderColor: "rgba(200, 30, 30, 0.8)",
          backgroundColor: "rgba(200, 30, 30, 0.3)",
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Trend dei valori per sezione (somma dei fattori selezionati)'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.formattedValue}`
            }
          }
        },
        scales: {
          x: { title: { display: true, text: "Sezioni" }, ticks: { autoSkip: true } },
          y: { title: { display: true, text: "Valore totale" } }
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("🟢 Inizializzazione DetailChartDemografica");
  window.detailChartDemografica = new DetailChartDemografica();
});
