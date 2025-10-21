// elaborazione_turismo/charts_turismo.js
// Richiede Chart.js già caricato in pagina

(function () {
  function ensureCanvas(container) {
    // se container è un <canvas>, lo uso; se è un div, cerco il canvas dentro
    let canvas = container.tagName.toLowerCase() === 'canvas' ? container : container.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      container.innerHTML = '';
      container.appendChild(canvas);
    }
    return canvas;
  }

  function destroyOldChart(canvas) {
    if (canvas && canvas._chartInstance) {
      try { canvas._chartInstance.destroy(); } catch {}
      canvas._chartInstance = null;
    }
  }

  window.chartManagerTurismo = {
    createGradientBarChart(valuesArray, container) {
      const labels = valuesArray.map(v => v.field);
      const dataVals = valuesArray.map(v => Number(v.value || 0));

      const canvas = ensureCanvas(container);
      destroyOldChart(canvas);

      const ctx = canvas.getContext('2d');

      // semplice bar chart; niente colori imposti (segue linee guida progetto)
      const cfg = {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Valori',
            data: dataVals
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => new Intl.NumberFormat('it-IT').format(ctx.parsed.y || 0)
              }
            }
          },
          scales: {
            x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true }
          }
        }
      };

      canvas._chartInstance = new Chart(ctx, cfg);
    }
  };
})();
