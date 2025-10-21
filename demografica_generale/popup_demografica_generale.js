// demografica_generale/popup_demografica_generale.js
export function createPopupContentDemograficaGenerale({ rawName, fieldsArray, rowData }) {
  const comuneEnc = encodeURIComponent(rawName || '');
  const fieldsEnc = encodeURIComponent((fieldsArray || []).join(','));
  const sex = rowData?.sesso || 'Totale';
  const link = `./detail_timeline_page/index.html?comune=${comuneEnc}&fields=${fieldsEnc}&sex=${encodeURIComponent(sex)}`;

  const rowsHtml = (rowData?.values || [])
    .map(({ field, value }) => `
      <tr>
        <td>${field}</td>
        <td style="text-align:right">${Number.isFinite(value) ? value.toLocaleString('it-IT') : 'n.d.'}</td>
      </tr>
    `).join('');

  return `
    <div class="popup-demogen">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h3 style="margin:0">${rawName}</h3>
        <a href="${link}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb;text-decoration:none;font-weight:600">Dettaglio timeline »</a>
      </div>
      <div style="font-size:12px;opacity:.8;margin-bottom:8px">
        Sesso: <strong>${sex}</strong> &nbsp;·&nbsp; Anno: <strong>${rowData?.anno ?? '—'}</strong>
      </div>

      <div id="demograficaGeneraleChart" style="width:100%;max-width:580px;margin:6px 0 10px 0"></div>

      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ccc">Indicatore</th>
            <th style="text-align:right;border-bottom:1px solid #ccc">Valore</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}
