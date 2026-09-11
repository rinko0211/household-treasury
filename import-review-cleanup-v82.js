(() => {
  if (window.__importReviewCleanupV82) return;
  window.__importReviewCleanupV82 = true;

  function cleanLegacyReviewRows() {
    const host = document.getElementById('reviewQueue');
    if (!host) return;
    host.querySelectorAll('button').forEach(button => {
      const onclick = String(button.getAttribute('onclick') || '');
      if (!onclick.includes('dismissReview')) return;
      const row = button.closest('.row');
      if (row) row.remove();
      else button.remove();
    });
  }

  try {
    if (typeof renderImportSummary === 'function' && !window.__importSummaryWrappedV82) {
      window.__importSummaryWrappedV82 = true;
      const previousRenderImportSummary = renderImportSummary;
      renderImportSummary = function renderImportSummaryV82(...args) {
        const result = previousRenderImportSummary.apply(this, args);
        cleanLegacyReviewRows();
        return result;
      };
    }
  } catch {}

  document.addEventListener('change', event => {
    if (event.target?.matches?.('input[type="file"]')) setTimeout(cleanLegacyReviewRows, 0);
  }, true);
  window.addEventListener('treasury:pagechange', event => {
    if (event?.detail?.page === 'imports') setTimeout(cleanLegacyReviewRows, 0);
  });
  window.addEventListener('pageshow', () => setTimeout(cleanLegacyReviewRows, 0));
  setTimeout(cleanLegacyReviewRows, 0);

  window.householdImportReviewCleanupV82 = { clean: cleanLegacyReviewRows };
})();
