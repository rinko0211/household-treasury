(() => {
  if(window.__cardImportCorrectionsV73)return;
  window.__cardImportCorrectionsV73=true;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const isRakuten=s=>{const n=norm(s);return n.includes('RAKUTEN')||n.includes('楽天')};
  let purchaseRef=null,settlementRef=null;

  function monthIndex(ym){const m=String(ym||'').match(/^(\d{4})-(\d{2})$/);return m?Number(m[1])*12+Number(m[2])-1:null}
  function validMonth(s){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s||''))}
  function deriveRakutenBillingMonth(src,file){
    try{
      const rows=parseCsv(src.text),hi=findHeader(rows,['利用日','利用店名・商品名']);if(hi<0)return'';
      const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,'').normalize('NFKC').trim());
      const payHeader=h.find(x=>/^\d{1,2}月支払金額$/.test(x));if(!payHeader)return'';
      const hm=Number((payHeader.match(/^(\d{1,2})月/)||[])[1]);if(!(hm>=1&&hm<=12))return'';
      const fm=String(file?.name||'').match(/enavi(\d{4})(\d{2})/i);
      let ref=null,refYear=null;
      if(fm){refYear=Number(fm[1]);ref=refYear*12+Number(fm[2])-1}
      const purchaseIdx=[];
      for(const r of rows.slice(hi+1)){
        const o=rowObj(h,r),d=parseDate(o['利用日']);const mi=monthIndex(String(d||'').slice(0,7));if(mi!==null)purchaseIdx.push(mi);
      }
      const latest=purchaseIdx.length?Math.max(...purchaseIdx):null;
      if(ref===null&&latest!==null){ref=latest;refYear=Math.floor((latest-1)/12)}
      if(refYear===null)refYear=new Date().getFullYear();
      const candidates=[refYear-1,refYear,refYear+1].map(y=>({ym:`${y}-${String(hm).padStart(2,'0')}`,idx:y*12+hm-1}));
      candidates.forEach(c=>{c.score=ref===null?0:Math.abs(c.idx-ref);if(latest!==null){if(c.idx<latest)c.score+=100;const lag=c.idx-latest;if(lag>4)c.score+=(lag-4)*20}});
      candidates.sort((a,b)=>a.score-b.score);return candidates[0]?.ym||'';
    }catch{return''}
  }
  function cardDay(st,name){
    const cards=st.masters?.cards||[],n=norm(name);const c=cards.find(x=>{const k=norm(x.name);return k===n||k.includes(n)||n.includes(k)});
    const d=Number(c?.settlementDay||c?.paymentDay||c?.dueDay);return Number.isInteger(d)&&d>=1&&d<=31?d:(isRakuten(name)?27:null);
  }
  function dateForMonth(ym,day){
    if(!validMonth(ym)||!day)return'';const [y,m]=ym.split('-').map(Number),last=new Date(y,m,0).getDate();return `${ym}-${String(Math.min(day,last)).padStart(2,'0')}`;
  }
  function autoCorrectRakuten(st,file,billingMonth){
    if(!billingMonth)return 0;let changed=0;
    for(const p of st.purchaseEvents||[]){if(!isRakuten(p.card)||String(p.source_file||'')!==String(file.name))continue;if(String(p.billing_month||'')!==billingMonth){p.billing_month_corrected_from=p.billing_month||null;p.billing_month=billingMonth;p.billing_month_source='CSV_PAYMENT_HEADER';changed++}}
    for(const l of st.cardBillingLines||[]){if(!isRakuten(l.card)||String(l.source_file||'')!==String(file.name))continue;if(String(l.billing_month||'')!==billingMonth){l.billing_month_corrected_from=l.billing_month||null;l.billing_month=billingMonth;l.billing_month_source='CSV_PAYMENT_HEADER';changed++}}
    for(const s of st.cardSettlements||[]){if(!isRakuten(s.card)||String(s.source_file||'')!==String(file.name))continue;const due=dateForMonth(billingMonth,cardDay(st,s.card));if(due&&String(s.due_date||'')!==due){s.import_original_due_date=s.due_date||null;s.due_date=due;s.billing_month_source='CSV_PAYMENT_HEADER';changed++}}
    return changed;
  }

  if(typeof parseRakutenCard==='function'){
    const previousRakuten=parseRakutenCard;
    parseRakutenCard=function parseRakutenCardV73(src,file){
      const billingMonth=deriveRakutenBillingMonth(src,file),result=previousRakuten(src,file),st=typeof state!=='undefined'?state:null;
      const corrected=st?autoCorrectRakuten(st,file,billingMonth):0;
      if(billingMonth)result.detectedBillingMonth=billingMonth;
      if(corrected)result.autoCorrected=(Number(result.autoCorrected)||0)+corrected;
      return result;
    };
  }

  function repairLinkedSettlementDates(st){
    let changed=0;
    for(const s of st.cardSettlements||[]){
      if(!s.bank_transaction_id)continue;const t=(st.cashTransactions||[]).find(x=>String(x.id)===String(s.bank_transaction_id));if(!t?.date||String(t.date)===String(s.due_date))continue;
      if(!s.statement_due_date)s.statement_due_date=s.due_date||null;s.due_date=t.date;s.due_date_source='BANK_ACTUAL';changed++;
    }
    return changed;
  }
  if(typeof importOne==='function'){
    const previousImport=importOne;
    importOne=async function importOneV73(file){
      const r=await previousImport(file);if(r?.skipped)return r;
      const st=typeof state!=='undefined'?state:null;if(!st)return r;
      const fixed=repairLinkedSettlementDates(st);if(fixed){try{save()}catch{}r.autoCorrected=(Number(r.autoCorrected)||0)+fixed;const rec=(st.imports||[]).find(x=>x.file===file.name);if(rec)rec.autoCorrected=r.autoCorrected}
      return r;
    };
  }

  function linkedLines(st,p){
    let lines=(st.cardBillingLines||[]).filter(x=>p.purchase_id&&String(x.purchase_id||'')===String(p.purchase_id)&&Number(x.occurrence_index||1)===Number(p.occurrence_index||1));
    if(lines.length)return lines;
    return (st.cardBillingLines||[]).filter(x=>norm(x.card)===norm(p.card)&&String(x.purchase_date||'')===String(p.purchase_date||'')&&norm(x.merchant_raw||'')===norm(p.merchant_raw||'')&&Math.abs(Number(x.original_amount)||0)===Math.abs(Number(p.original_amount)||0)&&Number(x.occurrence_index||1)===Number(p.occurrence_index||1));
  }
  function suspicious(st,p){
    const pm=monthIndex(String(p.purchase_date||'').slice(0,7)),bm=monthIndex(p.billing_month);if(!p.billing_month||bm===null)return true;
    const installment=Number(p.installment_count)>1||Number(p.installment_number)>1||/分割|リボ/i.test(String(p.payment_method||''));
    if(pm!==null&&(bm<pm||(!installment&&bm-pm>3)))return true;
    return linkedLines(st,p).some(l=>String(l.billing_month||'')!==String(p.billing_month||'')||String(l.purchase_date||'')!==String(p.purchase_date||'')||norm(l.card)!==norm(p.card));
  }
  function purchaseKey(p){return [p.purchase_id||'',Number(p.occurrence_index||1),p.source_file||'',p.purchase_date||'',p.merchant_raw||'',Number(p.original_amount)||0].join('|')}
  function findPurchase(st,ref){return (st.purchaseEvents||[]).find(p=>purchaseKey(p)===ref)||null}

  function ensureUi(){
    const grid=document.querySelector('#imports .grid');if(!grid)return null;let card=$('cardImportCorrectionsV73');
    if(!card){
      card=document.createElement('div');card.id='cardImportCorrectionsV73';card.className='card full';
      card.innerHTML='<div class="title">カード取込補正 <span class="tag">v73</span></div><div class="tiny">CSVは自動補正します。残った日付・請求月・金額・カード名のズレだけここで修正できます。</div><div id="cardImportCorrectionRowsV73" style="margin-top:10px"></div><div class="title" style="margin-top:16px">カード請求</div><div id="cardSettlementCorrectionRowsV73"></div>';
      grid.appendChild(card);card.addEventListener('click',onCardClick);
    }
    ensureModal();return card;
  }
  function ensureModal(){
    if($('cardImportEditModalV73'))return;const m=document.createElement('div');m.id='cardImportEditModalV73';m.hidden=true;m.style.display='none';m.innerHTML=`<div data-v73-close style="position:fixed;inset:0;background:#0009;z-index:12100"></div><div class="card" style="position:fixed;z-index:12101;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,560px);max-height:90vh;overflow:auto"><div class="title" id="cardImportEditTitleV73">カード明細を編集</div><div id="cardImportEditBodyV73"></div><div class="controls" style="margin-top:12px;flex-wrap:wrap"><button class="btn" data-v73-save>保存</button><button class="btn secondary" data-v73-close>キャンセル</button></div></div>`;document.body.appendChild(m);m.addEventListener('click',onModalClick)}
  function showModal(){const m=$('cardImportEditModalV73');m.hidden=false;m.style.display='block'}
  function hideModal(){const m=$('cardImportEditModalV73');m.hidden=true;m.style.display='none';purchaseRef=null;settlementRef=null}
  function renderUi(){
    if(!document.getElementById('imports')?.classList.contains('active'))return;ensureUi();const st=stateNow(),ph=$('cardImportCorrectionRowsV73'),sh=$('cardSettlementCorrectionRowsV73');if(!ph||!sh)return;
    const ps=[...(st.purchaseEvents||[])].filter(p=>p.card).sort((a,b)=>String(b.purchase_date||'').localeCompare(String(a.purchase_date||''))).slice(0,60);
    ph.innerHTML=ps.length?ps.map(p=>{const warn=suspicious(st,p),lines=linkedLines(st,p);return `<div class="row" style="align-items:flex-start;gap:8px"><div style="min-width:0;flex:1"><b>${esc(p.merchant_raw||'カード利用')}</b><div class="tiny">${esc(p.purchase_date||'')} · ${esc(p.card||'')} · 請求月 ${esc(p.billing_month||'未設定')} · ${yen(p.original_amount)}${lines.length?` · 請求明細${lines.length}件`:''}</div><div class="tiny">${esc(p.source_file||'')}</div></div><div class="controls" style="flex-wrap:wrap;justify-content:flex-end">${warn?'<span class="tag warn">要補正</span>':''}<button type="button" class="btn secondary" data-v73-purchase="${esc(purchaseKey(p))}">編集</button></div></div>`}).join(''):'<div class="muted">カード利用明細はありません。</div>';
    const ss=[...(st.cardSettlements||[])].filter(s=>s.due_date).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date))).slice(0,20);
    sh.innerHTML=ss.length?ss.map(s=>`<div class="row"><div><b>${esc(s.card||'カード')}</b><div class="tiny">${esc(s.due_date||'')} · ${esc(s.source_file||'')}${s.due_date_source==='BANK_ACTUAL'?' · 口座実績日':''}</div></div><div class="controls"><b class="amt">${yen(s.amount)}</b><button type="button" class="btn secondary" data-v73-settlement="${esc(String(s.settlement_id||''))}">編集</button></div></div>`).join(''):'<div class="muted">カード請求はありません。</div>';
  }
  function openPurchase(ref){
    const st=stateNow(),p=findPurchase(st,ref);if(!p)return alert('編集対象が見つかりません。');purchaseRef=ref;settlementRef=null;const lines=linkedLines(st,p),line=lines.length===1?lines[0]:null;$('cardImportEditTitleV73').textContent='カード利用明細を編集';$('cardImportEditBodyV73').innerHTML=`<div class="form" style="grid-template-columns:1fr 1fr"><div class="field"><label>カード</label><input id="v73Card" value="${esc(p.card||'')}"></div><div class="field"><label>利用日</label><input id="v73PurchaseDate" type="date" value="${esc(p.purchase_date||'')}"></div><div class="field" style="grid-column:1/-1"><label>利用先</label><input id="v73Merchant" value="${esc(p.merchant_raw||'')}"></div><div class="field"><label>利用額</label><input id="v73OriginalAmount" type="number" min="0" value="${Math.abs(Number(p.original_amount)||0)}"></div><div class="field"><label>請求月</label><input id="v73BillingMonth" type="month" value="${esc(p.billing_month||'')}"></div>${line?`<div class="field"><label>当月請求額</label><input id="v73BilledAmount" type="number" value="${Number(line.billed_amount)||0}"></div>`:''}</div><div class="tiny" style="margin-top:8px">元CSV: ${esc(p.source_file||'不明')}${lines.length>1?` · 対応請求行 ${lines.length}件（請求額は個別変更しません）`:''}</div>`;showModal()
  }
  function openSettlement(id){
    const st=stateNow(),s=(st.cardSettlements||[]).find(x=>String(x.settlement_id||'')===String(id));if(!s)return alert('請求が見つかりません。');settlementRef=String(id);purchaseRef=null;const t=(st.cashTransactions||[]).find(x=>String(x.id)===String(s.bank_transaction_id||''));$('cardImportEditTitleV73').textContent='カード請求を編集';$('cardImportEditBodyV73').innerHTML=`<div class="form"><div class="field"><label>カード</label><input id="v73SettlementCard" value="${esc(s.card||'')}"></div><div class="field"><label>引落日</label><input id="v73SettlementDate" type="date" value="${esc(s.due_date||'')}"></div><div class="field"><label>請求額</label><input id="v73SettlementAmount" type="number" min="0" value="${Math.abs(Number(s.amount)||0)}"></div></div>${t?.date?`<div class="note" style="margin-top:8px">口座実績日: ${esc(t.date)} <button type="button" class="btn secondary" data-v73-use-bank-date="${esc(t.date)}">この日に合わせる</button></div>`:''}`;showModal()
  }
  function persist(st,msg){window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();setTimeout(renderUi,0)}
  function savePurchase(){
    const st=stateNow(),p=findPurchase(st,purchaseRef);if(!p)return;const old={card:p.card,purchase_date:p.purchase_date,merchant_raw:p.merchant_raw,original_amount:p.original_amount,billing_month:p.billing_month};const card=$('v73Card').value.trim(),date=$('v73PurchaseDate').value,merchant=$('v73Merchant').value.trim(),amount=Number($('v73OriginalAmount').value),bm=$('v73BillingMonth').value;if(!card||!date||!merchant||!Number.isFinite(amount)||amount<0||!validMonth(bm))return alert('カード・利用日・利用先・金額・請求月を確認してください。');const lines=linkedLines(st,p);Object.assign(p,{card,purchase_date:date,merchant_raw:merchant,merchant_normalized:typeof normalizeText==='function'?normalizeText(merchant):norm(merchant),original_amount:Math.abs(amount),billing_month:bm,confidence:1,manual_corrected:true,manual_corrected_at:new Date().toISOString()});for(const l of lines)Object.assign(l,{card,purchase_date:date,merchant_raw:merchant,merchant_normalized:p.merchant_normalized,original_amount:Math.abs(amount),billing_month:bm,manual_corrected:true,manual_corrected_at:p.manual_corrected_at});if(lines.length===1&&$('v73BilledAmount')){const ba=Number($('v73BilledAmount').value);if(Number.isFinite(ba))lines[0].billed_amount=ba}p.manual_correction_from=old;persist(st,'カード明細補正');hideModal()
  }
  function saveSettlement(){
    const st=stateNow(),s=(st.cardSettlements||[]).find(x=>String(x.settlement_id||'')===settlementRef);if(!s)return;const card=$('v73SettlementCard').value.trim(),date=$('v73SettlementDate').value,amount=Number($('v73SettlementAmount').value);if(!card||!date||!Number.isFinite(amount)||amount<0)return alert('カード・引落日・請求額を確認してください。');s.manual_correction_from={card:s.card,due_date:s.due_date,amount:s.amount};Object.assign(s,{card,due_date:date,amount:Math.abs(amount),manual_corrected:true,manual_corrected_at:new Date().toISOString(),due_date_source:'MANUAL'});persist(st,'カード請求補正');hideModal()
  }
  function onCardClick(e){const p=e.target.closest?.('[data-v73-purchase]'),s=e.target.closest?.('[data-v73-settlement]');if(p)return openPurchase(p.dataset.v73Purchase);if(s)return openSettlement(s.dataset.v73Settlement)}
  function onModalClick(e){if(e.target.closest?.('[data-v73-close]'))return hideModal();const bank=e.target.closest?.('[data-v73-use-bank-date]');if(bank){$('v73SettlementDate').value=bank.dataset.v73UseBankDate;return}if(e.target.closest?.('[data-v73-save]'))return purchaseRef?savePurchase():settlementRef?saveSettlement():null}

  window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='imports')setTimeout(renderUi,0)});
  window.renderCardImportCorrectionsV73=renderUi;
})();
