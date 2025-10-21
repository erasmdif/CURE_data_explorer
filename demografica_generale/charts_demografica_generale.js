// demografica_generale/charts_demografica_generale.js
// Richiede Chart.js già caricato globalmente
(function () {
    function createCanvas(container) {
      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.width = container.clientWidth || 560;
      canvas.height = 260;
      container.appendChild(canvas);
      return canvas.getContext('2d');
    }
  
    function destroyIfAny(container) {
      if (container.__chart__) {
        try { container.__chart__.destroy(); } catch {}
        container.__chart__ = null;
      }
    }
  
    window.chartManagerDemograficaGenerale = {
      createGradientBarChart(values, container) {
        if (!container) return;
        destroyIfAny(container);
  
        const labels = values.map(v => v.field);
        const data = values.map(v => (Number.isFinite(v.value) ? v.value : 0));
  
        const ctx = createCanvas(container);
        const chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Valori',
              data
            }]
          },
          options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { autoSkip: true, maxRotation: 0 }, grid: { display: false } },
              y: { beginAtZero: true }
            }
          }
        });
        container.__chart__ = chart;
      }
    };
  })();
  