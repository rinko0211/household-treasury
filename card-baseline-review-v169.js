/* v169 — reviewed card settlement baselines; never count a settlement as new consumption.
   Exact historic evidence is documented; values are editable after applying. */
(() => {
'use strict';
if(window.householdCardBaselineReviewV169)return;
const yen=x=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(x);
const money=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const norm=s=>String(s||'').normalize('NFKC').replace(/[\s　()（）\[\]［］_\-\.／/]/g,'').toUpperCase();
const profiles=Object.freeze({
 rakuten:{label:'楽天カード',amount:75000,confidence:'参考水準',
   details:'2026年9月請求124,012円と10月請求25,517円の中間（74,765円を千円単位で丸め）。引越分割・前年購入を含む1月52万円は除外。'},
 jal:{label:'JAL/DC',amount:70000,confidence:'暫定水準',
   details:'9月のリボ完済221,823円を除外。9月・10月のJALカード利用80,504円／78,441円と11月PDF 63,736円を参考に70,000円と推定。'},
 dcard:{label:'dカード',amount:20000,confidence:'暫定水準',
   details:'古いマスター50,000円から、最新10月23日バックアップでは20,000円へ変更済み。妻スマホ料金が約14,000円→3,000円へ縮小予定。明細未収録月がある。'}
});
function keyOf(card){
 const a=norm(card?.name||card?.importLabel);
 if(/RAKUTEN|楽天/.test(a))return'rakuten';
 if(/JAL|MUFGDC/.test(a))return'jal';
 if(a==='Dカード'||a==='DCARD'||a==='D'||/DOCOMO/.test(a))return'dcard';
 return null;
}
function review(st){
 const result=[];
 for(const [key,profile] of Object.entries(profiles)){
   const matched=(st?.masters?.cards||[]).filter(card=>card.active!==false&&keyOf(card)===key);
   result.push({key,...profile,card:matched.length===1?matched[0]:null,
     ambiguous:matched.length>1,current:matched.length===1?
       money(matched[0].monthlyBaselineAmount??matched[0].cardBaselineAmount??0):null});
 }
 return result;
}
function update(st,keys){
 if(!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length)
   throw Error('更新対象が不正です');
 const next=structuredClone(st),items=review(next),byKey=new Map(items.map(x=>[x.key,x])),changes=[];
 for(const key of keys){
   const it=byKey.get(key);
   if(!it||it.ambiguous||!it.card)throw Error('カードの識別に失敗しました。カードマスターを確認してください。');
   if(String(it.card.paymentMode||it.card.payment_mode||'FULL').toUpperCase()!=='FULL')
     throw Error('リボ設定中のカードは、標準一括請求額へ変更しません');
   if(it.current===it.amount&&String(it.card.forecastMode||it.card.forecast_mode||'').toUpperCase()==='BASELINE')
     continue;
   it.card.monthlyBaselineAmount=it.amount;
   it.card.forecastMode='BASELINE';it.card.forecast_mode='BASELINE';it.card.baselineModeExplicitV88='BASELINE';
   it.card.baselineSource='USER_APPROVED_V169';it.card.baselineReviewedAt=new Date().toISOString();
   changes.push({key,from:it.current,to:it.amount,id:it.card.id});
 }
 if(changes.length)next.masters.updatedAt=new Date().toISOString();
 return {next,changes};
}
function apply(keys){
 const actual=(window.getTreasuryStateRaw||window.getTreasuryState)?.();
 if(!actual)throw Error('マスターがまだ読み込まれていません');
 const planned=update(actual,keys);
 if(!planned.changes.length)return {changed:0};
 const msg=planned.changes.map(x=>profiles[x.key].label+' '+yen(x.from)+' → '+yen(x.to)).join('\n');
 if(!window.confirm('カードの毎月標準引落見込を更新します（実際の請求額・購入額ではありません）。\n'+msg+
    '\n月別に確定した請求と、設定済みの個別上書きは優先されます。復旧履歴を保存して続けますか？'))
    return {cancelled:true,changed:0};
 if(typeof window.treasuryRecoverySnapshot!=='function'||typeof window.replaceTreasuryState!=='function')
   throw Error('保存・復旧機能が利用できません');
 const recent=update((window.getTreasuryStateRaw||window.getTreasuryState)(),keys);
 // Ensure no changes to bank, purchases, card settlement originals or asset balances.
 window.treasuryRecoverySnapshot('カード標準引落見込更新前（v169）');
 if(window.replaceTreasuryState(recent.next)===false)throw Error('保存に失敗しました');
 window.cloudSyncOnLocalSave?.();
 window.setTreasurySaveStatus?.('カード標準額の設定を保存・同期中');
 window.householdCardSettingsV77?.render?.();
 window.renderPlanningUiV79?.();
 return {changed:recent.changes.length};
}
const el=id=>document.getElementById(id);
function mount(){
 const grid=document.querySelector('#settings .grid');
 if(!grid)return false;
 let box=el('cardBaselineReviewV169');
 if(!box){box=document.createElement('section');box.id='cardBaselineReviewV169';
   box.className='card full treasury-baseline-panel';
   const existing=el('householdMasterCardV1');
   if(existing&&existing.parentElement===grid)existing.after(box);else grid.prepend(box);
   box.addEventListener('click',e=>{
     const button=e.target.closest?.('[data-v169-apply]');
     if(!button)return;
     const k=button.dataset.v169Apply;
     const keys=k==='all'?['rakuten','jal','dcard']:[k];
     try{
       const result=apply(keys);
       el('v169BaselineStatus').textContent=result.cancelled?'変更を中止しました':
         result.changed?'マスターを更新しました。クラウド同期後に他端末へ反映されます。':'標準額はすでに一致しています。';
       draw();
     }catch(err){el('v169BaselineStatus').textContent='未更新：'+String(err.message||err)}
   });
 }
 draw();return true;
}
function draw(){
 const root=el('cardBaselineReviewV169');if(!root)return;
 const entries=review((window.getTreasuryStateRaw||window.getTreasuryState)?.()||{});
 const total=entries.reduce((sum,x)=>sum+x.amount,0);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 root.innerHTML='<div class="treasury-panel-heading"><div><div class="treasury-eyebrow">CASH FLOW PLANNING</div>'+
  '<div class="title">カード標準引落額の見直し</div><p class="tiny">実績と一時的なリボ・引越費用を分離した暫定値。カード引落を消費支出に足しません。</p></div>'+
  '<div class="treasury-card-sum"><span>標準額合計（参考）</span><b>'+yen(total)+'</b><small>／月</small></div></div>'+
  '<div class="treasury-baseline-grid">'+entries.map(x=>
   '<article class="treasury-baseline-row"><div class="treasury-baseline-title"><b>'+x.label+'</b><span>'+x.confidence+'</span></div>'+
   '<div class="treasury-baseline-number">'+yen(x.amount)+'</div>'+
   '<div class="tiny">現在のマスター：'+(x.card?yen(x.current):'カードが見つかりません')+'</div>'+
   '<p class="tiny">'+esc(x.details)+'</p>'+
   '<button type="button" class="btn secondary" data-v169-apply="'+x.key+'" '+
   (!x.card||x.ambiguous?'disabled':'')+'>このカードに反映</button></article>').join('')+'</div>'+
  '<div class="treasury-baseline-actions"><button type="button" class="btn" data-v169-apply="all" '+
  (entries.some(x=>!x.card||x.ambiguous)?'disabled':'')+'>3枚まとめてマスターに反映</button>'+
  '<span class="tiny">既存の個別月見込・請求実績は維持。復旧履歴を保存します。</span></div>'+
  '<div class="tiny" id="v169BaselineStatus" role="status"></div>';
}
window.householdCardBaselineReviewV169={profiles,keyOf,review,update,apply,mount};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else setTimeout(mount,0);
window.addEventListener?.('treasury:pagechange',e=>{if(e.detail?.page==='settings')setTimeout(mount,0)});
})();
