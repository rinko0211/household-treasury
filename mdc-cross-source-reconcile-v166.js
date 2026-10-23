/* v166: manual cross-source JAL PDF reconciliation.
 * Does not delete transactions or alter the canonical statement. */
(() => {
'use strict';
if(window.householdJalCrossSourceV166)return;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').normalize('NFKC').replace(/［[^］]*］|\[[^\]]*\]/g,'')
  .replace(/[\s　()（）._\-／/・]/g,'').toUpperCase();
const amt=x=>Math.abs(Number(x)||0);
const dateValid=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
const yen=x=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(x);
const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
const isPdf=x=>Boolean(x?.mdc_import_v144||x?.pdf_card_identity||/^MDC_PDF_/i.test(String(x?.source_file||'')));
const isCounted=x=>x?.count_in_spending!==false&&x?.reconciliation_status!=='ABSORBED_DUPLICATE'&&
  String(x?.economic_type||'EXPENSE').toUpperCase()==='EXPENSE';
function sourceType(x,kind){
 if(!isCounted(x))return false;
 if(kind==='cash'){
   const desc=String(x.description||x.description_raw||'');
   const payment=String(x.payment_method||'').toUpperCase();
   // Never suggest unannotated cash: equal date/amount can be a separate cash purchase.
   return /クレジット|カード末尾|JALカード|DCカード|MUFG|［カード］|\[CREDIT\]/i.test(desc)||
     ['CREDIT','CARD','JAL','MUFG/DC/JAL'].includes(payment);
 }
 if(isPdf(x))return false;
 const card=norm(x.card||'');
 const receipt=Boolean(x.receipt_reconciliation_pending||x.source_cash_expense_id||
   /^receipt:/i.test(String(x.purchase_id||'')));
 if(/RAKUTEN|楽天|DCARD|Dカード|KABU|PAYPAY|SUICA|PASMO/.test(card))return false;
 if(receipt){
   const method=String(x.payment_method||'').toUpperCase();
   if(['PAYPAY','TRANSIT_IC','CASH'].includes(method))return false;
   return true;
 }
 return /MUFG|JAL|DCカード/.test(card);
}
function targets(st){
 const pdfs=(st.purchaseEvents||[]).map((row,index)=>({row,index}))
   .filter(x=>isPdf(x.row)&&isCounted(x.row)&&dateValid(x.row.purchase_date)&&amt(x.row.original_amount)>0);
 const sources=[];
 for(const [i,row] of (st.purchaseEvents||[]).entries()){
   if(sourceType(row,'purchase')&&dateValid(row.purchase_date)&&amt(row.original_amount))
     sources.push({kind:'purchase',index:i,row,date:row.purchase_date,amount:amt(row.original_amount),
       label:row.merchant_raw||row.merchant_normalized||row.source_receipt_description||'',card:row.card||''});
 }
 for(const [i,row] of (st.cashExpenses||[]).entries()){
   if(sourceType(row,'cash')&&dateValid(row.date)&&amt(row.amount))
     sources.push({kind:'cash',index:i,row,date:row.date,amount:amt(row.amount),
       label:row.description||row.description_raw||'',card:row.payment_method||''});
 }
 return {pdfs,sources};
}
function scan(st=stateNow()){
 const {pdfs,sources}=targets(st),matches=[];
 for(const src of sources)for(const pdf of pdfs){
   if(src.date!==pdf.row.purchase_date||src.amount!==amt(pdf.row.original_amount))continue;
   const sourceName=norm(src.label),pdfName=norm(pdf.row.merchant_raw||pdf.row.merchant_normalized);
   const identical=Boolean(sourceName&&pdfName&&sourceName===pdfName);
   matches.push({
     key:src.kind+':'+src.index+':'+pdf.index,
     kind:src.kind,index:src.index,pdfIndex:pdf.index,date:src.date,amount:src.amount,
     sourceLabel:src.label,pdfLabel:pdf.row.merchant_raw||pdf.row.merchant_normalized||'',
     originalCard:src.card,pdfCard:pdf.row.pdf_card_identity||pdf.row.card||'',
     identical,sourceFile:String(src.row.source_file||''),pdfFile:String(pdf.row.source_file||'')
   });
 }
 return matches.sort((a,b)=>b.date.localeCompare(a.date)||Number(b.identical)-Number(a.identical)||b.amount-a.amount);
}
function scanPdfPreview(parsed,st=stateNow()){
 const sources=targets(st).sources;
 const hits=[];
 for(const e of parsed?.entries||[]){
   if(!dateValid(e.date)||!Number.isSafeInteger(Number(e.amount)))continue;
   const same=sources.filter(src=>src.date===e.date&&src.amount===amt(e.amount));
   for(const src of same)hits.push({date:e.date,amount:amt(e.amount),sourceLabel:src.label,pdfLabel:e.merchant,
     kind:src.kind,identical:norm(src.label)===norm(e.merchant)});
 }
 return hits;
}
function plan(st,selected){
 if(!Array.isArray(selected)||!selected.length||selected.length>150)throw Error('照合件数が不正です');
 const candidates=new Map(scan(st).map(x=>[x.key,x])),sources=new Set(),pdfs=new Set();
 const operations=[];
 for(const key of selected){
   const m=candidates.get(String(key));
   if(!m)throw Error('原本が更新されたか、照合候補がなくなりました。再点検してください。');
   const sourceKey=m.kind+':'+m.index;
   if(sources.has(sourceKey)||pdfs.has(m.pdfIndex))throw Error('同じ明細を複数回対応付けできません。1対1で選択してください。');
   sources.add(sourceKey);pdfs.add(m.pdfIndex);
   operations.push(m);
 }
 return {operations,count:operations.length,amount:operations.reduce((t,x)=>t+x.amount,0)};
}
function apply(selected){
 if(typeof window.treasuryRecoverySnapshot!=='function'||typeof window.replaceTreasuryState!=='function')
   throw Error('復旧履歴または台帳保存の機能が利用できません。');
 const original=stateNow(),pre=plan(original,selected);
 const details=pre.operations.slice(0,5).map(x=>x.date+' '+x.sourceLabel+' → '+x.pdfLabel+' '+yen(x.amount)).join('\n');
 if(!window.confirm('JAL PDFの明細を残し、照合した旧購入記録'+pre.count+'件（'+yen(pre.amount)+
   '）だけを二重計上から除外します。\n購入先が違う同額の買い物を誤って選んでいないか確認してください。\n'+details+
   '\n元記録は削除しません。復旧履歴を作成して適用しますか？'))return {cancelled:true};
 const fresh=stateNow(),next=structuredClone(fresh),validated=plan(next,selected);
 if(validated.amount!==pre.amount||validated.count!==pre.count)
   throw Error('照合中に元データが変わりました。保存していません。');
 const now=new Date().toISOString(),months=new Set();
 for(const m of validated.operations){
   const src=(m.kind==='purchase'?next.purchaseEvents:next.cashExpenses)[m.index];
   const pdf=next.purchaseEvents[m.pdfIndex];
   if(!src||!pdf||!isPdf(pdf)||!isCounted(pdf)||
     (m.kind==='purchase'?src.purchase_date:src.date)!==m.date||
     amt(m.kind==='purchase'?src.original_amount:src.amount)!==m.amount||
     amt(pdf.original_amount)!==m.amount||pdf.purchase_date!==m.date)
     throw Error('照合直前の原本確認に失敗しました。未変更です。');
   src.count_in_spending=false;
   src.reconciliation_status='ABSORBED_DUPLICATE';
   src.receipt_reconciliation_pending=false;
   src.jal_pdf_reconciled_at=now;
   src.jal_pdf_canonical_purchase_id=String(pdf.purchase_id||'');
   src.jal_pdf_canonical_source_file=String(pdf.source_file||'');
   months.add(m.date.slice(0,7));
 }
 window.treasuryRecoverySnapshot('JAL PDF購入明細との重複照合・計上除外の直前');
 const saved=window.replaceTreasuryState(next);
 if(saved===false)throw Error('台帳の保存に失敗しました。');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent(new CustomEvent('treasury:expenses-imported',{detail:{months:[...months],source:'JAL_PDF_CROSS_SOURCE_RECONCILIATION'}}));
 window.householdExpenseUnifiedV148?.render?.();
 return {count:validated.count,amount:validated.amount};
}
function mountInto(container){
 if(!container)return;
 container.querySelector?.('#mdcCrossSourceV166')?.remove();
 const matches=scan();
 const section=document.createElement('div');
 section.id='mdcCrossSourceV166';
 section.style.cssText='border-top:1px solid #506274;margin-top:14px;padding-top:12px';
 section.innerHTML='<div class="title">CSV・購入記録とJAL PDFの重複照合</div>'+
  '<p class="tiny">同じ利用日・金額の候補だけを表示します。購入先が異なる場合、別の買い物の可能性があります。チェックした組だけ、PDF側を残して旧記録の支出計上を停止します。元記録は保存されます。</p>'+
  (matches.length?'<div class="note" style="margin:8px 0">'+matches.length+'組の候補。確実に同じ買い物と判断できる組だけ選択してください。</div>'+
    '<div style="max-height:360px;overflow:auto">'+matches.slice(0,150).map(m=>
      '<label class="row" style="align-items:flex-start;gap:10px"><input type="checkbox" data-mdc-crosspair="'+esc(m.key)+'">'+
      '<span style="min-width:0;flex:1"><b>'+esc(m.date)+'　'+yen(m.amount)+'</b>'+
      '<div class="tiny">元記録：'+esc(m.sourceLabel)+' ['+esc(m.originalCard)+']</div>'+
      '<div class="tiny">JAL PDF：'+esc(m.pdfLabel)+' ['+esc(m.pdfCard)+']</div>'+
      '<div class="tiny" style="color:'+(m.identical?'#85d4b3':'#f1c683')+'">'+
      (m.identical?'購入先表記も一致':'利用日・金額のみ一致：購入先を必ず確認')+'</div></span></label>').join('')+'</div>'+
    '<button type="button" class="btn secondary" id="mdcCrossApplyV166">選択した重複の計上を修正</button>'+
    '<div class="tiny" id="mdcCrossResultV166" role="status"></div>':
    '<p class="tiny">現在、支払方法から確認できるCSV・購入記録とJAL PDFの重複候補はありません。現金記録のままの支出は、支払方法を先に確認してください。</p>');
 container.appendChild(section);
 const button=section.querySelector('#mdcCrossApplyV166');
 if(button)button.onclick=()=>{
   const keys=[...section.querySelectorAll('input[data-mdc-crosspair]:checked')].map(x=>x.dataset.mdcCrosspair);
   const status=section.querySelector('#mdcCrossResultV166');
   if(!keys.length){status.textContent='重複と確認できた組を選択してください。';return}
   try{
     const result=apply(keys);
     if(result.cancelled){status.textContent='キャンセルしました。';return}
     window.householdMdcPdfDeltaV144?.mountAudit?.();
     if(!window.householdMdcPdfDeltaV144?.mountAudit)mountInto(container);
   }catch(e){status.textContent='未修正：'+String(e?.message||e)}
 };
}
window.householdJalCrossSourceV166={scan,scanPdfPreview,plan,apply,mountInto};
function mount(){
 const box=$('mdcDuplicateAuditV144');if(box)mountInto(box);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else setTimeout(mount,0);
window.addEventListener('treasury:expenses-imported',()=>setTimeout(mount,0));
})();