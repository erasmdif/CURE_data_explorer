import { getRepoBasePath } from "../utils.js";

export function createPopupContent({
  rawName,
  fieldsArray,
  rowData,
  dataSource,
  group = 'standard'
}) {
  console.log("🧩 POPUP: createPopupContent", { rawName, fieldsArray, rowData, group });

  const popupContent = document.createElement('div');
  popupContent.style.maxWidth = '500px';

  // Titolo
  const title = document.createElement('strong');
  title.textContent = rawName;
  title.style.display = 'block';
  title.style.fontSize = '16px';
  title.style.marginBottom = '4px';
  popupContent.appendChild(title);

  // Sottotitolo
  const subtitle = document.createElement('div');
  subtitle.textContent = fieldsArray.join(', ');
  subtitle.style.fontSize = '14px';
  subtitle.style.color = '#666';
  subtitle.style.marginBottom = '8px';
  popupContent.appendChild(subtitle);

  // Prepara dati per il grafico
  const fieldsData = [];
  fieldsArray.forEach(field => {
    const val = parseFloat(rowData?.[field]);
    const values = dataSource
      .map(d => parseFloat(d[field]))
      .filter(v => !isNaN(v) && v > 0);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    console.log(`📏 POPUP: campo=${field}, val=${val}, avg=${avg}`);

    if (rowData && !isNaN(val) && val > 0) {
      fieldsData.push({
        field,
        currentValue: val,
        averageValue: avg
      });
    }
  });

  console.log("📊 POPUP: fieldsData finale", fieldsData);

  if (fieldsData.length > 0 && window.chartManager) {
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'chart-container-actual';
    chartWrapper.style.marginTop = '10px';
    chartWrapper.style.width = '100%';
    chartWrapper.style.minHeight = `${Math.max(150, fieldsData.length * 40)}px`;
    popupContent.appendChild(chartWrapper);

    const detailBtn = document.createElement('button');
    detailBtn.textContent = 'Dettaglio completo';
    detailBtn.className = 'dettaglio-btn';
    detailBtn.onclick = () => {
      window.location.href = `${getRepoBasePath()}dettaglio/dettaglio.html?feature=${encodeURIComponent(rawName)}${group === 'municipality' ? '&group=municipality' : ''}`;
    };
    chartWrapper.appendChild(detailBtn);

    const chartContainer = document.createElement('div');
    chartContainer.style.height = chartWrapper.style.minHeight;
    chartContainer.style.width = '100%';
    chartWrapper.appendChild(chartContainer);

    setTimeout(async () => {
      console.log("📈 POPUP: avvio creazione grafico");
      await window.chartManager.createGradientBarChart(fieldsData, chartContainer);
    }, 50);
  } else {
    console.warn("⚠️ POPUP: Nessun dato per creare grafico o ChartManager assente");
  }

  return popupContent;
}
