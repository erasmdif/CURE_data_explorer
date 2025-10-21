// timeline/timeline_charts.js
// Usa Chart.js (già incluso in index.html). Crea/aggiorna un line chart multi-serie.
(function () {
    function destroyIfAny(container) {
      if (container.__chart__) {
        try { container.__chart__.destroy(); } catch {}
        container.__chart__ = null;
      }
    }
  
    function ensureCanvas(container) {
      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      return canvas.getContext('2d');
    }
  
    function distinctColor(i) {
      // palette deterministica semplice
      const colors = [
        'rgba(37,99,235,1)', 'rgba(16,185,129,1)', 'rgba(244,114,182,1)',
        'rgba(234,179,8,1)', 'rgba(236,72,153,1)', 'rgba(99,102,241,1)',
        'rgba(107,114,128,1)', 'rgba(0,168,133,1)'
      ];
      return colors[i % colors.length];
    }
  
    window.timelineChartManager = {
      renderLines(container, series, opts = {}) {
        // series: [{ label: "Grado — Nati", data: [{x:1991,y:7}, ...] }, ...]
        if (!container) return;
        destroyIfAny(container);
        const ctx = ensureCanvas(container);
  
        const ds = series.map((s, i) => ({
          label: s.label,
          data: s.data,
          parsing: false,
          borderColor: distinctColor(i),
          backgroundColor: 'rgba(0,0,0,0)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25
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
                mode: 'index',
                intersect: false,
                callbacks: {
                  title(items) { return `Anno ${items?.[0]?.parsed?.x ?? ''}`; },
                  label(item) {
                    const v = item.parsed?.y;
                    const isPercent = !!document.getElementById('demogen-percent-toggle')?.checked;
                    if (!Number.isFinite(v)) return `${item.dataset.label}: n.d.`;
                    return isPercent
                      ? `${item.dataset.label}: ${v.toLocaleString('it-IT', { maximumFractionDigits: 6 })}`
                      : `${item.dataset.label}: ${v.toLocaleString('it-IT')}`;
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
    };
  })();
  