(() => {
  if (window.__mufgCardSemanticsV75) return;
  window.__mufgCardSemanticsV75 = true;
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const sameMerchant=(a,b)=>norm(a)===norm(b);
  const isMufgCard=s=>{const n=norm(s);return n.includes('MUFG')||n.includes('DC')||n.includes('JAL')};

  function enrich(st,fileName){
    let changed=0;const source=String(fileName||'');
    try { window.householdSemanticV47?.migrateState?.(st); } catch {}
    for(const p of st.purchaseEvents||[]){
      if(!isMufgCard(p.card)||String(p.source_file||'')!==source)continue;
      const d=window.householdDateNormalizerV75?.isoDate?.(p.purchase_date)||p.purchase_date;
      const bm=window.householdDateNormalizerV75?.isoMonth?.(p.billing_month)||p.billing_month;
      if(d&&d!==p.purchase_date){p.purchase_date=d;changed++}if(bm&&bm!==p.billing_month){p.billing_month=bm;changed++}
      if(!p.economic_type||p.economic_type==='UNKNOWN'){p.economic_type='EXPENSE';changed++}
      if(!p.spending_class){p.spending_class='NORMAL';p.expense_scope='NORMAL';p.ordinary_or_special='NORMAL';changed++}
      const n=norm(p.merchant_raw||p.merchant_normalized||'');
      if(n.includes('ETC')){if(p.category!=='CAR'||p.subcategory!=='TOLL'){p.category='CAR';p.subcategory='TOLL';changed++}}
      else if(p.economic_type==='EXPENSE'&&!p.category){p.category='OTHER';p.subcategory='OTHER';changed++}
      if(/リボ/.test(String(p.payment_method||''))){if(p.payment_model!=='REVOLVING'){p.payment_model='REVOLVING';changed++}}
      if(Number(p.confidence||0)<.8){p.confidence=.8;changed++}
      p.record_kind='CARD_PURCHASE';
    }
    if(Array.isArray(st.reviewQueue)){
      const before=st.reviewQueue.length;
      st.reviewQueue=st.reviewQueue.filter(q=>!(st.purchaseEvents||[]).some(p=>isMufgCard(p.card)&&String(p.source_file||'')===source&&sameMerchant(p.merchant_raw||'',q.merchant||q.description||'')&&(!q.date||window.householdDateNormalizerV75?.isoDate?.(q.date)===p.purchase_date)&&p.economic_type==='EXPENSE'&&p.category));
      if(st.reviewQueue.length!==before)changed+=before-st.reviewQueue.length;
    }
    return changed;
  }

  if(typeof parseMufg==='function'){
    const prev=parseMufg;
    parseMufg=function parseMufgSemanticsV75(src,file){const r=prev(src,file),st=typeof state!=='undefined'?state:null;if(st){const n=enrich(st,file.name);if(n){r.autoCorrected=(Number(r.autoCorrected)||0)+n;r.review=0;r.autoClassified=Math.max(Number(r.autoClassified)||0,Number(r.read)||0)}}return r};
  }
  window.householdMufgCardSemanticsV75={enrich};
})();
