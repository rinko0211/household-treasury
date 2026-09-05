(() => {
  const CARD_ID='annualReserveCardV36';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  let renderTimer=null;

  function annuals(st){return (st.masters?.fixedExpenses||[]).filter(x=>x.active!==false&&String(x.cadence||'').toUpperCase()==='ANNUAL')}
  function dueMonthOf(x){
    for(const v of [x.dueMonth,x.paymentMonth,x.annualMonth,x.month]){
      const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=12)return n;
    }
    const raw=String(x.nextDueDate||x.dueDate||'');const m=raw.match(/^\d{4}-(\d{2})/);return m?Number(m[1]):null;
  }
  function reservedOf(x){for(const v of [x.reservedAmount,x.reserved_amount,x.reserveAmount]){if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v))}return 0}
  function currentParts(){const d=new Date();return{year:d.getFullYear(),month:d.getMonth()+1}}
  function targetFor(item){
    const dueMonth=dueMonthOf(item);if(!dueMonth)return null;
    const now=currentParts();let year=dueMonth<now.month?now.year+1:now.year;
    const lastPaid=Number(item.lastPaidYear)||0;if(lastPaid>=year)year=lastPaid+1;
    const months=(year-now.year)*12+(dueMonth-now.month);
    return{year,month:dueMonth,months:Math.max(0,months)};
  }
  function metrics(item){
    const amount=Math.max(0,Number(item.amount)||0),reserved=Math.min(amount,Math.max(0,reservedOf(item))),shortage=Math.max(0,amount-reserved),target=targetFor(item);
    const monthly=target?Math.ceil(shortage/Math.max(1,target.months)):null;
    return{amount,reserved,shortage,target,monthly};
  }
  function persist(st,reason){
    window.treasuryRecoverySnapshot?.(reason||'年払い積立変更直前');
    st.annualReserveVersion=1;
    if(st.masters)st.masters.updatedAt=new Date().toISOString();
    window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.('年払い積立保存済み・同期中');window.cloudSyncOnLocalSave?.();
  }
  function ensureUi(){
    if($(CARD_ID))return true;
    const grid=document.querySelector('#settings .grid');if(!grid)return false;
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">年払い・積立 <span class="tag">Phase 5</span></div><div class="tiny">年払いごとに支払月と積立済額を持ち、次回支払までに毎月いくら確保すべきか計算します。支払月は推測しません。</div></div><button class="btn secondary" id="refreshAnnualReserveV36">再計算</button></div><div id="annualReserveSummaryV36" class="form" style="margin-top:12px"></div><div id="annualReserveRowsV36" style="margin-top:12px"></div>`;
    const master=$('householdMasterCardV1');if(master&&master.parentElement===grid)master.after(card);else grid.appendChild(card);
    $('refreshAnnualReserveV36').onclick=render;
    card.addEventListener('click',e=>{
      const save=e.target.closest?.('[data-annual-save]');if(save)return saveItem(save.dataset.annualSave);
      const paid=e.target.closest?.('[data-annual-paid]');if(paid)return markPaid(paid.dataset.annualPaid);
    });
    return true;
  }
  function saveItem(id){
    const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;
    const key=CSS.escape(String(id)),monthEl=document.querySelector(`[data-annual-month="${key}"]`),reservedEl=document.querySelector(`[data-annual-reserved="${key}"]`);
    const month=Number(monthEl?.value),reserved=Number(reservedEl?.value);
    if(!Number.isInteger(month)||month<1||month>12){alert('支払月は1〜12で入力してください。');return}
    if(!Number.isFinite(reserved)||reserved<0){alert('積立済額を確認してください。');return}
    item.dueMonth=month;item.reservedAmount=Math.round(reserved);persist(st,`年払い積立「${item.name||''}」変更直前`);render();
  }
  function markPaid(id){
    const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;
    const dueMonth=dueMonthOf(item);if(!dueMonth){alert('先に支払月を設定してください。');return}
    const year=new Date().getFullYear();if(!confirm(`${item.name||'この年払い'}を${year}年分支払済みにしますか？\n積立済額は0円に戻し、次回支払を翌サイクルで計算します。`))return;
    item.lastPaidYear=year;item.reservedAmount=0;item.lastPaidAt=new Date().toISOString();persist(st,`年払い「${item.name||''}」支払済み変更直前`);render();
  }
  function summary(items){
    let annual=0,reserved=0,shortage=0,monthly=0,configured=0;let next=null;
    for(const item of items){const m=metrics(item);annual+=m.amount;reserved+=m.reserved;shortage+=m.shortage;if(m.target){configured++;monthly+=m.monthly||0;if(!next||m.target.months<next.metrics.target.months)next={item,metrics:m}}}
    return{annual,reserved,shortage,monthly,configured,next};
  }
  function row(item){
    const m=metrics(item),id=esc(String(item.id)),target=m.target?`${m.target.year}年${m.target.month}月（あと${m.target.months}か月）`:'支払月未設定';
    const monthly=m.monthly===null?'—':yen(m.monthly);
    return `<div class="card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><b>${esc(item.name||'年払い')}</b><div class="tiny">年額 ${yen(m.amount)}${item.estimated?' · 概算':''}${item.lastPaidYear?` · ${esc(item.lastPaidYear)}年分支払済み`:''}</div></div><span class="tag ${m.shortage===0?'good':m.target&&m.target.months<=2?'warn':''}">${esc(target)}</span></div><div class="form" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><div class="field"><label>支払月</label><input type="number" min="1" max="12" inputmode="numeric" data-annual-month="${id}" value="${dueMonthOf(item)||''}" placeholder="1〜12"></div><div class="field"><label>積立済額</label><input type="number" min="0" step="1000" inputmode="numeric" data-annual-reserved="${id}" value="${Math.round(m.reserved)}"></div></div><div class="row"><span>不足額</span><b class="${m.shortage>0?'warn':'good'}">${yen(m.shortage)}</b></div><div class="row"><span>今から必要な月積立</span><b>${monthly}</b></div><div class="controls" style="margin-top:8px;flex-wrap:wrap"><button class="btn" data-annual-save="${id}">保存</button><button class="btn secondary" data-annual-paid="${id}">今年分支払済み</button></div></div>`;
  }
  function render(){
    if(!ensureUi())return;const st=stateNow(),items=annuals(st),s=summary(items);
    $('annualReserveSummaryV36').innerHTML=[['年払い合計',s.annual],['積立済み',s.reserved],['不足額',s.shortage],['必要な月積立',s.monthly]].map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${yen(v)}</b></div>`).join('');
    const next=s.next?`<div class="note" style="margin-bottom:10px"><b>次の支払：</b>${esc(s.next.item.name||'年払い')} · ${s.next.metrics.target.year}年${s.next.metrics.target.month}月 · 不足 ${yen(s.next.metrics.shortage)}</div>`:'';
    const missing=items.filter(x=>!dueMonthOf(x)).length?`<div class="note warn" style="margin-bottom:10px">支払月未設定が ${items.filter(x=>!dueMonthOf(x)).length}件あります。月が分からない項目は積立額を推測しません。</div>`:'';
    $('annualReserveRowsV36').innerHTML=items.length?next+missing+items.map(row).join(''):'<div class="note">ANNUALの年払いマスタはまだありません。家計マスタの固定費で周期をANNUALにするとここに表示されます。</div>';
  }
  function queue(){clearTimeout(renderTimer);renderTimer=setTimeout(render,80)}
  function boot(){ensureUi();render();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="settings"]'))setTimeout(render,0)});window.addEventListener('focus',queue);window.renderAnnualReserveV36=render}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();