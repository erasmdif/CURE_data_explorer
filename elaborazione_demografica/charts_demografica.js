// charts_demografica.js
class ChartManagerDemografica {
    constructor() {
      this.chartJSLoaded = false;
      this.loadChartJS();
    }
  
    async loadChartJS() {
      if (typeof Chart === 'undefined') {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
          script.onload = () => {
            this.chartJSLoaded = true;
            console.log('Chart.js loaded (demografica)');
            resolve();
          };
          script.onerror = () => {
            console.error('Failed to load Chart.js (demografica)');
            resolve();
          };
          document.head.appendChild(script);
        });
      } else {
        this.chartJSLoaded = true;
      }
    }
  
    async createGradientBarChart(fieldsData, container) {
      if (!this.chartJSLoaded) await this.loadChartJS();
      if (!container?.parentNode) {
        console.error('Invalid chart container (demografica)');
        return;
      }
  
      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
  
      const labels = fieldsData.map(item => window.labelMap?.[item.field] || item.field);
      const percentages = fieldsData.map(item =>
        Math.round((item.currentValue / item.averageValue) * 100)
      );
  
      const getGradient = (ctx, chartArea, value) => {
        const ratio = value / 100;
        const gradient = ctx.createLinearGradient(0, 0, chartArea.right, 0);
        if (ratio < 0.5) {
          gradient.addColorStop(0, 'rgba(0, 180, 0, 0.7)');
          gradient.addColorStop(1, 'rgba(255, 255, 0, 0.7)');
        } else if (ratio < 1) {
          gradient.addColorStop(0, 'rgba(255, 255, 0, 0.7)');
          gradient.addColorStop(1, 'rgba(255, 165, 0, 0.7)');
        } else {
          gradient.addColorStop(0, 'rgba(255, 165, 0, 0.7)');
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0.7)');
        }
        return gradient;
      };
  
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Rapporto rispetto alla media',
            data: percentages,
            backgroundColor: (context) => {
              const chart = context.chart;
              const {ctx, chartArea} = chart;
              if (!chartArea) return;
              return getGradient(ctx, chartArea, context.raw);
            },
            borderColor: 'rgba(0,0,0,0.8)',
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          scales: {
            x: {
              beginAtZero: true,
              title: {
                display: true,
                text: '% rispetto alla media'
              },
              ticks: {
                callback: v => v + '%'
              }
            },
            y: {
              type: 'category',
              title: {
                display: true,
                text: 'Indicatori'
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const data = fieldsData[ctx.dataIndex];
                  const code = window.labelMap?.[data.field] || data.field;
                  return [
                    `${code} – ${data.field}`,
                    `Valore: ${data.currentValue.toFixed(2)}`,
                    `Media: ${data.averageValue.toFixed(2)}`,
                    `Rapporto: ${(data.currentValue/data.averageValue).toFixed(2)}x (${ctx.raw}%)`
                  ];
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Inizializzazione
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.chartManagerDemografica) {
      window.chartManagerDemografica = new ChartManagerDemografica();
      console.log('ChartManagerDemografica initialized');
    }
  });
  