(() => {
  const $=id=>document.getElementById(id);
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const ECON_LABEL={EXPENSE:'支出',INCOME:'収入',TRANSFER:'資金移動',INVESTMENT:'投資',DEBT_PRINCIPAL:'借入元本返済',DEBT_INTEREST:'利息・手数料',UNKNOWN:'未判定'};
  const SPEND_LABEL={NORMAL:'通常費',SPECIAL:'特別費'};
  const ROUTE_LABEL={DIRECT:'口座・現金から直接',CARD:'カード請求に含む',TRACK_ONLY:'管理のみ'};
  const CAD_LABEL={MONTHLY:'毎月',SEMI_FIXED:'準固定',ANNUAL:'年払い'};
  const SUB_LABEL={ELECTRICITY:'電気',WATER:'水道',GAS:'ガス',MOBILE:'携帯',INTERNET:'インターネット',FUEL:'燃料',MAINTENANCE:'整備',PARKING:'駐車場',TOLL:'高速・ETC',LIFE:'生命保険',AUTO:'自動車保険',DIGITAL:'デジタル',MEMBERSHIP:'会費',CARD_FEE:'カード年会費',CLINIC:'医療機関',DENTAL:'歯科',CONTACTS:'コンタクト',PHARMACY:'薬局',GROCERIES:'食料品',EATING_OUT:'外食',CAFE:'カフェ',LODGING:'宿泊',AIR:'航空',CHILDCARE:'保育',SCHOOL:'学校',OTHER:'その他'};

  function categoryDefs(){return window.householdSemanticV47?.CATEGORY_DEFS||{}}
  function categoryLabel(cat){return categoryDefs()[cat]?.label||cat||'カテゴリなし'}
  function subLabel(sub){return SUB_LABEL[sub]||sub||''}
  function summaryLine(box){
    const name=box.querySelector('[data-f-name]')?.value?.trim()||'未設定';
    const amount=Math.abs(Number(box.querySelector('[data-f-amount]')?.value)||0);
    const cad=box.querySelector('[data-f-cad]')?.value||'MONTHLY';
    const econ=box.querySelector('[data-f-econ]')?.value||'EXPENSE';
    const spend=box.querySelector('[data-f-spend]')?.value||'NORMAL';
    const cat=box.querySelector('[data-f-cat]')?.value||'';
    const sub=box.querySelector('[data-f-sub]')?.value||'';
    const route=box.querySelector('[data-f-route]')?.value||'DIRECT';
    const semantic=econ==='EXPENSE'?`${SPEND_LABEL[spend]||spend} · ${categoryLabel(cat)}${sub?` > ${subLabel(sub)}`:''}`:(ECON_LABEL[econ]||econ);
    return{name,text:`${CAD_LABEL[cad]||cad} · ${yen(amount)} · ${semantic} · ${ROUTE_LABEL[route]||route}`};
  }
  function updateBox(box){
    if(!box)return;const s=summaryLine(box),summary=box.querySelector('summary');if(!summary)return;
    const title=summary.querySelector('b');if(title)title.textContent=s.name;
    const tiny=summary.querySelector('.tiny');if(tiny)tiny.textContent=s.text;
  }
  function updateAll(){document.querySelectorAll('#semanticFixedRowsV48 [data-v48-fixed]').forEach(updateBox)}
  function install(){
    const host=$('semanticFixedMasterV48');if(!host||host.dataset.v53Reactive)return false;host.dataset.v53Reactive='1';
    const react=e=>{const box=e.target.closest?.('[data-v48-fixed]');if(box&&e.target.matches('input,select'))updateBox(box)};
    host.addEventListener('input',react);host.addEventListener('change',react);
    host.addEventListener('click',e=>{if(e.target.closest?.('[data-v48-fixed-save],[data-v48-add],[data-v48-fixed-del]'))setTimeout(()=>{window.renderSemanticUiV48?.();setTimeout(updateAll,0)},0)});
    updateAll();return true;
  }
  function boot(){if(!install())setTimeout(boot,80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.refreshFixedSummaryV53=()=>{install();updateAll()};
})();
