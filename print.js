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
   * Opens ONE popup window holding several documents and prints them ONE AT A
   * TIME — a separate print dialog (and so a separate saved PDF file) per
   * document, without needing one pop-up window each.
   *
   * Only the bill currently being printed is visible to the print renderer
   * (`.batch-doc.printing`), so each dialog sees exactly one bill. The chain is
   * driven by `afterprint`, which fires when the dialog is dismissed whether the
   * user saved or cancelled; browsers that don't fire it leave the on-screen
   * "Print next" button as the manual fallback, which is also how a user
   * re-prints one they cancelled by mistake.
   *
   * @param {{title: string, html: string}[]} docs - one entry per bill, in print order
   * @param {string} windowTitle - title shown before the first bill starts printing
   * @param {Window} [existingWin] - window pre-opened inside the user's click
   */
  openSequentialPrintWindow(docs, windowTitle = 'Batch Print', existingWin = null) {
    const titles = JSON.stringify(docs.map(d => d.title));
    const docsHTML = docs.map((d, i) => `<div class="batch-doc" id="batch-doc-${i}">${d.html}</div>`).join('');

    const fullHTML = `<!DOCTYPE html>
<html>
<head>
${_printHead(windowTitle)}
  <style>
    .batch-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 14px;
      padding: 12px 18px; background: #0f172a; color: #fff; font-size: 0.9rem; flex-wrap: wrap; }
    .batch-bar strong { font-weight: 600; }
    .batch-bar button { font: inherit; font-weight: 600; padding: 7px 14px; border: 0; border-radius: 7px; cursor: pointer; }
    .batch-bar .primary { background: #10b981; color: #fff; }
    .batch-bar .ghost { background: rgba(255,255,255,0.14); color: #fff; }
    .batch-bar button[disabled] { opacity: 0.45; cursor: default; }
    .batch-status { flex: 1; min-width: 180px; color: #cbd5e1; }
    .batch-doc { border-bottom: 1px dashed #cbd5e1; padding-bottom: 24px; margin-bottom: 24px; }
    .batch-doc:last-child { border-bottom: 0; }
    @media print {
      /* One dialog sees exactly one bill. */
      .batch-doc { display: none; border: 0; padding: 0; margin: 0; }
      .batch-doc.printing { display: block; }
    }
  </style>
</head>
<body>
  <div class="batch-bar no-print">
    <strong id="batch-heading">Batch Print</strong>
    <span class="batch-status" id="batch-status">Preparing…</span>
    <button class="primary" id="batch-next" disabled>Print next</button>
    <button class="ghost" id="batch-close">Close</button>
  </div>
  ${docsHTML}
  <script>
    (function () {
      var titles = ${titles};
      var total = titles.length;
      var next = 0;          // index of the bill the next dialog will print
      var busy = false;      // guards against afterprint firing twice for one dialog
      var auto = true;       // chain automatically until the user cancels out

      var statusEl = document.getElementById('batch-status');
      var nextBtn = document.getElementById('batch-next');
      var headingEl = document.getElementById('batch-heading');
      headingEl.textContent = 'Batch Print — ' + total + ' bill' + (total === 1 ? '' : 's');

      function label() {
        if (next >= total) return 'All ' + total + ' bill' + (total === 1 ? '' : 's') + ' printed. You can close this window.';
        return 'Ready: bill ' + (next + 1) + ' of ' + total + ' (' + titles[next] + ')';
      }
      function refresh() {
        statusEl.textContent = label();
        nextBtn.disabled = next >= total;
        nextBtn.textContent = next >= total ? 'Done' : 'Print bill ' + (next + 1) + ' of ' + total;
      }

      function printOne() {
        if (busy || next >= total) return;
        busy = true;
        var i = next;
        var docs = document.querySelectorAll('.batch-doc');
        for (var d = 0; d < docs.length; d++) docs[d].classList.remove('printing');
        docs[i].classList.add('printing');
        // The document title is what the browser offers as the Save-as-PDF
        // filename, so each bill saves under its own order number.
        document.title = titles[i];
        statusEl.textContent = 'Printing bill ' + (i + 1) + ' of ' + total + '…';
        nextBtn.disabled = true;
        window.print();
      }

      function finishedOne() {
        if (!busy) return;
        busy = false;
        next++;
        var docs = document.querySelectorAll('.batch-doc');
        for (var d = 0; d < docs.length; d++) docs[d].classList.remove('printing');
        document.title = ${JSON.stringify(windowTitle)};
        refresh();
        if (auto && next < total) {
          // Chaining straight out of the afterprint handler is unreliable in
          // some browsers; a short gap lets the previous dialog fully tear down.
          setTimeout(printOne, 400);
        }
      }

      window.addEventListener('afterprint', finishedOne);
      nextBtn.addEventListener('click', function () { auto = true; printOne(); });
      document.getElementById('batch-close').addEventListener('click', function () { window.close(); });

      refresh();
      document.fonts.ready.then(function () { setTimeout(printOne, 150); });
    })();
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
