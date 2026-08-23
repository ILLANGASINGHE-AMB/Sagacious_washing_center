// print.js - Centralized PDF/Print Window Helper Module
// Standardizes HTML print popup windows across Invoices, Credit Bills, Quotations, Catalogs, and Reports

const Print = {
  /**
   * Opens a standardized styled popup window and triggers print after fonts load
   * @param {string} htmlContent - The body HTML content to display inside the printable document
   * @param {string} documentTitle - The title tag for the printable document
   * @param {Window} [existingWin] - An already-opened window to write into instead
   *   of opening a new one. Batch printing opens all of its windows up front,
   *   inside the user's click, so pop-up blockers don't kill the ones that would
   *   otherwise be opened after an await.
   */
  openPrintWindow(htmlContent, documentTitle = 'Print Document', existingWin = null) {
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
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
  </style>
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

    const win = existingWin || window.open('', '_blank');
    if (!win) {
      if (window.toast) window.toast('Please allow pop-ups to view printable documents', 'warning');
      return null;
    }

    if (existingWin) win.document.open();
    win.document.write(fullHTML);
    win.document.close();
    return win;
  }
};

window.Print = Print;
