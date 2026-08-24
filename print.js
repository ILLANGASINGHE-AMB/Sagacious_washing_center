// print.js - Centralized PDF/Print Window Helper Module
// Standardizes HTML print popup windows across Invoices, Credit Bills, Quotations, Catalogs, and Reports

// Shared <head> for every print window this module opens, so a single-bill
// print and a batch print are rendered by byte-for-byte the same stylesheet.
function _printHead(documentTitle) {
  return `  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${documentTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1e293b; line-height: 1.5; }
    @media print {
      body { margin: 0; background: #fff; }
      @page { margin: 12mm 10mm; size: A4; }
      .no-print { display: none !important; }
    }
  </style>`;
}

const Print = {
  /**
   * Opens a standardized styled popup window and triggers print after fonts load
   * @param {string} htmlContent - The body HTML content to display inside the printable document
   * @param {string} documentTitle - The title tag for the printable document
   * @param {Window} [existingWin] - An already-opened window to write into instead
   *   of opening a new one. Batch printing opens its window up front, inside the
   *   user's click, so pop-up blockers don't kill a window that would otherwise be
   *   opened after an await.
   */
  openPrintWindow(htmlContent, documentTitle = 'Print Document', existingWin = null) {
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
${_printHead(documentTitle)}
</head>
<body>
  ${htmlContent}
  <script>
    document.fonts.ready.then(() => {
      setTimeout(() => {
        window.print();
      }, 100);
    });
  <\/script>
</body>
</html>`;

    return this._write(fullHTML, existingWin);
  },

  /**
   * Opens ONE popup window holding several documents and prints them in ONE
   * print dialog — each document forced onto its own page, so the dialog's
   * preview pages through every bill and "Save as PDF" produces a single file
   * with one bill per page.
   *
   * @param {{title: string, html: string}[]} docs - one entry per bill, in print order
   * @param {string} windowTitle - document title, i.e. the offered PDF filename
   * @param {Window} [existingWin] - window pre-opened inside the user's click
   */
  openBatchPrintWindow(docs, windowTitle = 'Batch Print', existingWin = null) {
    const docsHTML = docs.map((d, i) => `
      <div class="batch-doc">
        <div class="batch-doc-label no-print">Bill ${i + 1} of ${docs.length} — ${d.title}</div>
        ${d.html}
      </div>`).join('');

    const fullHTML = `<!DOCTYPE html>
<html>
<head>
${_printHead(windowTitle)}
  <style>
    .batch-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 14px;
      padding: 12px 18px; background: #0f172a; color: #fff; font-size: 0.9rem; flex-wrap: wrap; }
    .batch-bar strong { font-weight: 600; }
    .batch-bar .batch-status { flex: 1; min-width: 180px; color: #cbd5e1; }
    .batch-bar button { font: inherit; font-weight: 600; padding: 7px 14px; border: 0; border-radius: 7px; cursor: pointer; }
    .batch-bar .primary { background: #10b981; color: #fff; }
    .batch-bar .ghost { background: rgba(255,255,255,0.14); color: #fff; }
    .batch-doc-label { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      color: #94a3b8; padding: 18px 4px 8px; }
    @media print {
      /* Every bill starts a fresh page; :not(:last-child) keeps the run from
         ending on a trailing blank one. */
      .batch-doc:not(:last-child) { page-break-after: always; break-after: page; }
    }
  </style>
</head>
<body>
  <div class="batch-bar no-print">
    <strong>Batch Print — ${docs.length} bill${docs.length === 1 ? '' : 's'}</strong>
    <span class="batch-status">All ${docs.length} bill${docs.length === 1 ? '' : 's'} are in one print dialog, one per page — scroll the preview to see them all.</span>
    <button class="primary" id="batch-print">Print again</button>
    <button class="ghost" id="batch-close">Close</button>
  </div>
  ${docsHTML}
  <script>
    document.getElementById('batch-print').addEventListener('click', function () { window.print(); });
    document.getElementById('batch-close').addEventListener('click', function () { window.close(); });
    document.fonts.ready.then(function () { setTimeout(function () { window.print(); }, 150); });
  <\/script>
</body>
</html>`;

    return this._write(fullHTML, existingWin);
  },

  _write(fullHTML, existingWin) {
    // A window pre-opened inside the user's click may have been closed again
    // while the content was being built — fall back to opening a fresh one
    // rather than throwing on a dead document.
    let target = existingWin;
    if (target) { try { if (target.closed) target = null; } catch (e) { target = null; } }
    const win = target || window.open('', '_blank');
    if (!win) {
      if (window.toast) window.toast('Please allow pop-ups to view printable documents', 'warning');
      return null;
    }
    if (target) win.document.open();
    win.document.write(fullHTML);
    win.document.close();
    return win;
  }
};

window.Print = Print;
