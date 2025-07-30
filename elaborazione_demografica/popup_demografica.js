// popup_demografica.js
export function createPopupContentDemografica({
    rawName,
    fieldsArray,
    rowData,
    dataSource,
    group = 'standard'
  }) {
    const popupContent = document.createElement('div');
    popupContent.style.maxWidth = '500px';
  
    const title = document.createElement('strong');
    title.textContent = rawName;
    title.style.display = 'block';
    title.style.fontSize = '16px';
    title.style.marginBottom = '4px';
    popupContent.appendChild(title);
  
    const subtitle = document.createElement('div');
    subtitle.textContent = fieldsArray.join(', ');
    subtitle.style.fontSize = '14px';
    subtitle.style.color = '#666';
    subtitle.style.marginBottom = '8px';
    popupContent.appendChild(subtitle);
  
    const fieldsData = [];
    fieldsArray.forEach(field => {
      const val = parseFloat(rowData?.[field]);
      if (!rowData.ASC_1LIV_COD) {
        console.warn("📍 Codice ASC_1LIV_COD non trovato in rowData:", rowData);
      }
      const values = dataSource
        .map(d => parseFloat(d[field]))
        .filter(v => !isNaN(v) && v > 0);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  
      if (!isNaN(val) && val > 0) {
        fieldsData.push({
          field,
          currentValue: val,
          averageValue: avg
        });
      }
    });
  
    if (fieldsData.length > 0 && window.chartManagerDemografica && window.detailChartDemografica) {
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-container-demografica';
        chartWrapper.style.marginTop = '10px';
        chartWrapper.style.width = '100%';
        popupContent.appendChild(chartWrapper);
      
        // 🎚️ Pulsanti toggle
        const toggleButtons = document.createElement('div');
        toggleButtons.className = 'chart-toggle-buttons';
        toggleButtons.style.display = 'flex';
        toggleButtons.style.justifyContent = 'center';
        toggleButtons.style.gap = '10px';
        toggleButtons.style.marginBottom = '8px';
      
        const btnBar = document.createElement('button');
        btnBar.textContent = 'Grafico barre';
        btnBar.className = 'active';
      
        const btnPie = document.createElement('button');
        btnPie.textContent = 'Grafico sezioni';
      
        toggleButtons.appendChild(btnBar);
        toggleButtons.appendChild(btnPie);
        chartWrapper.appendChild(toggleButtons);
      
        // 🔍 Bottone dettaglio
        const detailBtn = document.createElement('button');
        detailBtn.textContent = 'Dettaglio completo';
        detailBtn.className = 'dettaglio-btn';
        detailBtn.onclick = () => {
          const rawCode = rowData?.ASC_1LIV_COD;
          window.location.href = `../dettaglio_demografica/dettaglio_demografica.html?feature=${encodeURIComponent(rawName)}&code=${rawCode}${group === 'municipality' ? '&group=municipality' : ''}&file=demografica`;        };
        chartWrapper.appendChild(detailBtn);
      
        // 📊 Container per grafico
        const chartContainer = document.createElement('div');
        chartContainer.id = 'demograficaChart';
        chartContainer.style.height = `${Math.max(150, fieldsData.length * 40)}px`;
        chartContainer.style.width = '100%';
        chartWrapper.appendChild(chartContainer);

        // 🖼️ Overlay a schermo intero
        const fullscreenOverlay = document.createElement('div');
        fullscreenOverlay.style.position = 'fixed';
        fullscreenOverlay.style.top = '0';
        fullscreenOverlay.style.left = '0';
        fullscreenOverlay.style.width = '100vw';
        fullscreenOverlay.style.height = '100vh';
        fullscreenOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
        fullscreenOverlay.style.zIndex = '9999';
        fullscreenOverlay.style.display = 'none';
        fullscreenOverlay.style.flexDirection = 'column';
        fullscreenOverlay.style.alignItems = 'center';
        fullscreenOverlay.style.justifyContent = 'center';
        fullscreenOverlay.style.padding = '20px';
        fullscreenOverlay.style.boxSizing = 'border-box';
        document.body.appendChild(fullscreenOverlay);

        // 🔍 Bottone espandi a schermo intero (inizialmente nascosto)
        const expandBtn = document.createElement('button');
        expandBtn.textContent = '🔍 Espandi grafico';
        expandBtn.style.marginTop = '6px';
        expandBtn.style.display = 'none'; // 👈 NON mostrarlo subito
        expandBtn.style.marginInline = 'auto';
        chartWrapper.appendChild(expandBtn);

        // 📊 Canvas del grafico espanso
        const fullscreenChartContainer = document.createElement('div');
        fullscreenChartContainer.style.width = '90%';
        fullscreenChartContainer.style.height = '80%';
        fullscreenOverlay.appendChild(fullscreenChartContainer);

        // 🔙 Pulsante per chiudere
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '↩️ Riduci';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '20px';
        closeBtn.style.right = '30px';
        closeBtn.style.padding = '10px 20px';
        closeBtn.style.fontSize = '16px';
        closeBtn.style.cursor = 'pointer';
        fullscreenOverlay.appendChild(closeBtn);

        // Evento apertura
        expandBtn.onclick = () => {
          fullscreenOverlay.style.display = 'flex';
          fullscreenChartContainer.innerHTML = '';
          window.detailChartDemografica.createTrendChart(fieldsArray, rowData.ASC_1LIV_COD, fullscreenChartContainer);
        };

        // Evento chiusura
        closeBtn.onclick = () => {
          fullscreenOverlay.style.display = 'none';
          fullscreenChartContainer.innerHTML = '';
        };

      
        // Rendering iniziale SOLO quando visibile
        requestAnimationFrame(() => {
          const observer = new ResizeObserver(() => {
            if (chartContainer.offsetWidth > 0 && chartContainer.offsetHeight > 0) {
              window.chartManagerDemografica.createGradientBarChart(fieldsData, chartContainer);
              observer.disconnect(); // disconnetti dopo il primo rendering
            }
          });
          observer.observe(chartContainer);
        });
      
        // 🧠 Funzione di switch
        const ascCode = rowData?.ASC_1LIV_COD;
        console.log('📍 Codice ASC_1LIV_COD trovato:', ascCode);
      
        btnBar.onclick = () => {
          btnBar.classList.add('active');
          btnPie.classList.remove('active');
          chartContainer.innerHTML = '';
          expandBtn.style.display = 'none'; // 👈 NASCONDI il pulsante
          window.chartManagerDemografica.createGradientBarChart(fieldsData, chartContainer);
        };
      
        btnPie.onclick = () => {
          const container = document.querySelector("#demograficaChart");
          const ascCode = rowData.ASC_1LIV_COD;
        
          if (!container || !ascCode) {
            console.warn("❌ Mancano container o ASC_1LIV_COD per il grafico di dettaglio.");
            return;
          }
        
          btnPie.classList.add('active');
          btnBar.classList.remove('active');
          expandBtn.style.display = 'block'; // ✅ Mostralo solo qui
          container.innerHTML = '';
          window.detailChartDemografica.createTrendChart(fieldsArray, ascCode, container);
        };
      }      
  
    return popupContent;
  }
  