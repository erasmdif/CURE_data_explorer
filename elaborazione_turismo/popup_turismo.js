// elaborazione_turismo/popup_turismo.js

export function createPopupContentTurismo({ rawName, fieldsArray, rowData }) {
  const nf = new Intl.NumberFormat('it-IT');

  const listItems = rowData.values.map(({ field, value }) => {
    // field è il nome colonna così come nel CSV
    const label = field;
    const val = nf.format(value || 0);
    return `<li><strong>${label}</strong>: ${val}</li>`;
  }).join('');

  // un solo canvas per popup
  return `
    <div>
      <strong>${rawName}</strong>
      <div style="margin:8px 0 6px; color:#777; font-size:13px;">
        Anno: <b>${window.mapManager?.yearFilter ?? ''}</b>
      </div>
      <ul style="padding-left:18px; margin:0 0 10px;">
        ${listItems}
      </ul>

      <div class="chart-container-actual">
        <canvas id="turismoChart"></canvas>
      </div>
    </div>
  `;
}
