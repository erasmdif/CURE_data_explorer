class ChartManager2 {
  constructor() {
    this.chartJSLoaded = typeof Chart !== 'undefined';
  }

  async createLineChart(fieldsData, container) {
    console.log("📊 CHART: createLogarithmicLineChart", fieldsData);
    if (!container?.parentNode) {
      console.error('❌ CHART: Invalid chart container');
      return;
    }

    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const labels = fieldsData.map(item => window.labelMap?.[item.field] || item.field);
    const ratios = fieldsData.map(item => (item.currentValue / item.averageValue));

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Rapporto rispetto alla media',
          data: ratios,
          borderColor: '#b00',
          backgroundColor: 'rgba(187, 0, 0, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#b00',
          pointRadius: 4,
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            type: 'logarithmic',
            title: {
              display: true,
              text: 'Rapporto (scala logaritmica)'
            },
            ticks: {
              callback: function(value) {
                return value + 'x';
              }
            }
          },
          x: {
            title: {
              display: true,
              text: 'Indicatori'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const data = fieldsData[ctx.dataIndex];
                return [
                  `Rapporto: ${ctx.raw.toFixed(2)}x`,
                  `Valore: ${data.currentValue.toFixed(2)}`,
                  `Media: ${data.averageValue.toFixed(2)}`,
                  `Pari al ${Math.round((data.currentValue / data.averageValue) * 100)}% della media`
                ];
              }
            }
          }
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.chartManager2) {
    window.chartManager2 = new ChartManager2();
  }
});