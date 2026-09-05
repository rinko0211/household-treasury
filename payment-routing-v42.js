(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const VALID_ROUTE=new Set(['DIRECT','CARD','TRACK_ONLY']);
  let timer=null;

  function masters(st){return (st.masters?.fixedExpenses||[]).filter(x=>x.active!==false)}
  function routeOf(item){
    const r=String(item?.paymentRoute||item?.payment_route||'DIRECT').toUpperCase();
    return VALID_ROUTE.has(r)?r:'DIRECT';
  }
  function routeLabel(r){return r==='CARD'?'カード請求に含む':r==='TRACK_ONLY'?'管理のみ':'口座・現金から直接'}
  function linkage(st){
    const ms=masters(st),rs=Array.isArray(st.rules)?st.rules:[],linkedRuleIndexes=new Set(),linkedRuleNames=new Set(),masterById=new Map(ms.map(x=>[String(x.id),x]));
    rs.forEach((r,i)=>{
      const mid=String(r.source_master_id||r.master_id||'');
      if(mid&&masterById.has(mid)){linkedRuleIndexes.add(i);linkedRuleNames.add(norm(r.name));return}
      const n=norm(r.name),sameM=ms.filter(x=>norm(x.name)===n),sameR=rs.filter(x=>norm(x.name)===n);
      if(n&&sameM.length===1&&sameR.length===1){linkedRuleIndexes.add(i);linkedRuleNames.add(n)}
    });
    return{linkedRuleIndexes,linkedRuleNames};
  }
  function persistRoute(id,value){
    const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;
    if(!VALID_ROUTE.has(value))return;
    if(routeOf(item)===value)return;
    window.treasuryRecoverySnapshot?.(`固定費「${item.name||''}」支払経路変更直前`);
    item.paymentRoute=value;item.payment_route=value;st.paymentRoutingVersion=1;
    if(st.masters)st.masters.updatedAt=new Date().toISOString();
    window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.('支払経路保存済み・同期中');window.cloudSyncOnLocalSave?.();queue();
  }

  const previousGenerated=typeof generated==='function'?generated:null;
  if(previousGenerated){
    generated=function generatedV42(days=90){
      const st=stateNow(),rows=previousGenerated(days),link=linkage(st),routeByMaster=new Map(masters(st).map(x=>[String(x.id),routeOf(x)]));
      return rows.filter(e=>{
        if(e.source==='rule'&&link.linkedRuleNames.has(norm(e.name)))return false;
        if((e.source==='master_fixed'||e.source==='master_annual')){
          const r=routeByMaster.get(String(e.master_id||''))||'DIRECT';
          if(r!=='DIRECT')return false;
        }
        return true;
      });
    };
  }

  function optionHtml(item){const r=routeOf(item);return `<div class="field" data-p42-route-wrap="${esc(String(item.id))}"><label>支払経路</label><select data-p42-route="${esc(String(item.id))}"><option value="DIRECT" ${r==='DIRECT'?'selected':''}>口座・現金から直接</option><option value="CARD" ${r==='CARD'?'selected':''}>カード請求に含む</option><option value="TRACK_ONLY" ${r==='TRACK_ONLY'?'selected':''}>管理のみ</option></select><div class="tiny">${r==='CARD'?'固定費として管理しますが、CF出金はカード引落だけを使います。':r==='TRACK_ONLY'?'金額の管理だけ行い、CF予測には出しません。':'固定費マスタからCF出金を生成します。'}</div></div>`}
  function injectRoutes(){
    const st=stateNow();
    for(const item of masters(st)){
      const id=String(item.id);
      const fixedBtn=document.querySelector(`[data-p10-fixed-save="${CSS.escape(id)}"]`),annualBtn=document.querySelector(`[data-p10-annual-save="${CSS.escape(id)}"]`);
      const card=(fixedBtn||annualBtn)?.closest('.card');if(!card)continue;
      let wrap=card.querySelector(`[data-p42-route-wrap="${CSS.escape(id)}"]`);
      if(!wrap){
        const form=card.querySelector('.form');if(!form)continue;
        const holder=document.createElement('div');holder.innerHTML=optionHtml(item);wrap=holder.firstElementChild;form.appendChild(wrap);
      }else{
        const sel=wrap.querySelector('[data-p42-route]');if(sel)sel.value=routeOf(item);
      }
    }
    const note=$('phase10FixedCardV41')?.querySelector('.note');
    if(note)note.innerHTML='家計マスタを正本にします。<b>口座・現金から直接</b>だけマスタからCF出金を生成します。<b>カード請求に含む</b>はカード引落だけをCFに使い、旧固定費ルールも抑止します。';
  }

  function renderLegacyRulesV42(){
    const host=$('rules');if(!host)return;const st=stateNow(),link=linkage(st),rows=(st.rules||[]).map((r,i)=>({r,i})).filter(x=>!link.linkedRuleIndexes.has(x.i));
    host.innerHTML=rows.map(({r,i})=>`<div class="row"><div><b>${esc(r.name)}</b><div class="tiny">毎月${Number(r.day)||1}日 · ${esc(r.type||'fixed')} · 未移行/特殊ルール</div></div><div class="controls"><span class="amt ${Number(r.amount)<0?'bad':'good'}">${yen(r.amount)}</span><button class="btn secondary" onclick="editRule(${i})">編集</button><button class="btn secondary" onclick="delRule(${i})">削除</button></div></div>`).join('')||'<div class="note good">固定費ルールはすべて家計マスタへ統合済みです。旧ルールはデータとして保持していますが、表示・予測には重ねません。</div>';
    const card=host.closest('.card'),title=card?.querySelector('.title');if(title)title.textContent='固定費ルール（未移行・特殊のみ）';
  }
  try{if(typeof renderRules==='function')renderRules=renderLegacyRulesV42}catch{}

  function renderBadges(){
    const st=stateNow(),counts={DIRECT:0,CARD:0,TRACK_ONLY:0};for(const x of masters(st))counts[routeOf(x)]++;
    const box=$('phase10FixedSummaryV41');if(box){const old=box.textContent||'';const base=old.replace(/\s*·\s*支払経路:.*/,'');box.innerHTML=`${esc(base)} · 支払経路: 直接 ${counts.DIRECT} / カード ${counts.CARD} / 管理のみ ${counts.TRACK_ONLY}`}
  }
  function renderAll(){injectRoutes();renderLegacyRulesV42();renderBadges()}
  function queue(){clearTimeout(timer);timer=setTimeout(renderAll,60)}
  function boot(){
    renderAll();
    document.addEventListener('change',e=>{const el=e.target.closest?.('[data-p42-route]');if(el)persistRoute(el.dataset.p42Route,el.value)});
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="settings"],[data-page="cashflow"],[data-page="dashboard"]'))setTimeout(renderAll,0)});
    window.addEventListener('focus',queue);window.renderPaymentRoutingV42=renderAll;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();