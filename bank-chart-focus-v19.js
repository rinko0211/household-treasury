(() => {
  const PREF_KEY='householdTreasuryBankChartPrefsV18';
  const MIGRATION_KEY='householdTreasuryBankChartFocusV19Applied';
  try {
    if (!localStorage.getItem(MIGRATION_KEY)) {
      const current = JSON.parse(localStorage.getItem(PREF_KEY) || 'null') || {};
      current.count = ['30','90','200','all'].includes(String(current.count)) ? String(current.count) : '90';
      current.visible = { total:true, rakuten:false, yucho:false, other:false };
      localStorage.setItem(PREF_KEY, JSON.stringify(current));
      localStorage.setItem(MIGRATION_KEY, '1');
    }
  } catch {}

  function annotate() {
    const coverage = document.getElementById('bankChartCoverageV18');
    if (coverage && !coverage.dataset.focusV19) {
      coverage.dataset.focusV19='1';
      const base=coverage.textContent || '取引イベント順で表示';
      coverage.textContent=`${base} · 合計フォーカス`; 
    }
    const legend=document.getElementById('bankChartLegendV18');
    if (legend && !document.getElementById('bankChartFocusNoteV19')) {
      const note=document.createElement('span');
      note.id='bankChartFocusNoteV19';
      note.className='tiny';
      note.textContent='白線だけならY軸を合計残高に自動ズーム。銀行線は必要時にON。';
      legend.appendChild(note);
    }
  }

  const original=window.renderBankChart;
  if (typeof original==='function') {
    window.renderBankChart=()=>{original();annotate()};
    try { window.renderBankChart(); } catch {}
  } else {
    window.addEventListener('load',()=>{try{window.renderBankChart?.();annotate()}catch{}});
  }
})();