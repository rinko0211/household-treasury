(() => {
  const CARD_ID='futurePlannerCardV37';
  const MODAL_ID='futurePlannerModalV37';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>Number.isFinite(Number(n))?new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)):'金額未定';
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const todayIso=()=>iso(new Date());
  const VALID_CERTAINTY=new Set(['CONFIRMED','ESTIMATED','TBD']);
  const VALID_RECURRING=new Set(['NONE','MONTHLY','YEARLY']);
  const VALID_KIND=new Set(['INCOME','NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER']);
  let editingId=null,renderTimer=null,observer=null;

  function inferKind(e){
    if(VALID_KIND.has(String(e?.future_kind||'').toUpperCase()))return String(e.future_kind).toUpperCase();
    const scope=String(e?.expense_scope||e?.ordinary_or_special||'').toUpperCase(),type=String(e?.type||'').toUpperCase();
    if(Number(e?.amount)>0||type.includes('INCOME')||type.includes('BONUS')||type.includes('SALARY'))return'INCOME';
    if(scope==='SPECIAL'||type.includes('SPECIAL')||type.includes('TRAVEL'))return'SPECIAL';
    if(scope==='INVESTMENT'||type.includes('INVEST'))return'INVESTMENT';
    if(scope==='DEBT'||type.includes('DEBT')||type.includes('LOAN'))return'DEBT';
    if(scope==='TRANSFER'||type.includes('TRANSFER'))return'TRANSFER';
    return'NORMAL';
  }
  function certainty(e){const c=String(e?.certainty||'').toUpperCase();if(VALID_CERTAINTY.has(c))return c;return e?.estimated?'ESTIMATED':'CONFIRMED'}
  function recurring(e){const r=String(e?.recurring||'').toUpperCase();return VALID_RECURRING.has(r)?r:'NONE'}
  function normalizedAmount(e){if(e?.amount===null||e?.amount===''||!Number.isFinite(Number(e?.amount)))return null;return Number(e.amount)}
  function normalizeEvents(st){
    let changed=false;
    if(!Array.isArray(st.events))st.events=[];
    for(const e of st.events){
      if(!e.id){e.id=crypto.randomUUID();changed=true}
      const k=inferKind(e),c=certainty(e),r=recurring(e);
      if(e.future_kind!==k){e.future_kind=k;changed=true}
      if(e.certainty!==c){e.certainty=c;changed=true}
      if(e.recurring!==r){e.recurring=r;changed=true}
      if(e.note==null){e.note='';changed=true}
      if(!e.expense_scope&&k!=='INCOME'){e.expense_scope=k;changed=true}
      if(!e.futurePlannerVersion){e.futurePlannerVersion=1;changed=true}
    }
    if(st.futurePlannerVersion!==1){st.futurePlannerVersion=1;changed=true}
    return changed;
  }
  function persist(st,reason='未来予定を更新'){
    normalizeEvents(st);
    window.treasuryRecoverySnapshot?.(reason+'直前');
    window.replaceTreasuryState?.(st);
    window.repairTreasuryBankBalances?.();
    window.setTreasurySaveStatus?.('未来予定保存済み・同期中');
    window.cloudSyncOnLocalSave?.();
  }

  function addMonths(date,n){const d=new Date(`${date}T12:00:00`);if(Number.isNaN(d.getTime()))return'';const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return iso(d)}
  function addYears(date,n){const d=new Date(`${date}T12:00:00`);if(Number.isNaN(d.getTime()))return'';const m=d.getMonth(),day=d.getDate();d.setFullYear(d.getFullYear()+n,0,1);d.setMonth(m,1);const last=new Date(d.getFullYear(),m+1,0).getDate();d.setDate(Math.min(day,last));return iso(d)}
  function recurrenceDates(e,from,to){
    const r=recurring(e),base=String(e.date||'');if(r==='NONE'||!base)return[];
    const out=[];let cur=base,guard=0;
    while(cur<from&&guard++<600)cur=r==='MONTHLY'?addMonths(cur,1):addYears(cur,1);
    while(cur&&cur<=to&&guard++<1200){out.push(cur);cur=r==='MONTHLY'?addMonths(cur,1):addYears(cur,1)}
    return out;
  }

  if(typeof generated==='function'){
    const previousGenerated=generated;
    generated=function generatedWithFuturePlannerV37(days=90){
      const base=previousGenerated(days),from=todayIso(),to=iso(new Date(Date.now()+Number(days)*86400000));
      const recurringIds=new Set((state.events||[]).filter(e=>recurring(e)!=='NONE').map(e=>String(e.id)));
      const out=base.filter(e=>!(e.source!=='rule'&&recurringIds.has(String(e.id))));
      for(const e of state.events||[]){
        if(recurring(e)==='NONE')continue;
        for(const date of recurrenceDates(e,from,to)){
          const amt=normalizedAmount(e);
          out.push({...e,id:`future:${e.id}:${date}`,date,amount:amt===null?0:amt,amount_unknown:amt===null,generated:true,source:'future_recurring',parent_event_id:e.id});
        }
      }
      return out.filter(e=>e.date>=from&&e.date<=to).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    };
  }

  function ensureUi(){
    if($(CARD_ID))return true;
    const grid=document.querySelector('#cashflow .grid');if(!grid)return false;
    const old=$('adhocEventListCardV15');if(old)old.style.display='none';
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">未来予定 <span class="tag">Phase 6</span></div><div class="tiny">確定・概算・未定を分け、単発 / 毎月 / 毎年の予定を資金繰りへ反映します。</div></div><button class="btn" id="futureAddV37">＋予定を追加</button></div><div id="futureSummaryV37" class="form" style="margin-top:12px"></div><div id="futureRowsV37" style="margin-top:12px"></div>`;
    grid.appendChild(card);
    $('futureAddV37').onclick=()=>openEditor();
    card.addEventListener('click',e=>{const edit=e.target.closest?.('[data-future-edit]'),del=e.target.closest?.('[data-future-del]');if(edit)openEditor(edit.dataset.futureEdit);if(del)removeEvent(del.dataset.futureDel)});
    ensureModal();return true;
  }
  function ensureModal(){
    if($(MODAL_ID))return;
    const modal=document.createElement('div');modal.id=MODAL_ID;modal.className='hidden';
    modal.innerHTML=`<div style="position:fixed;inset:0;background:#0009;z-index:10120" data-future-close></div><div class="card" style="position:fixed;z-index:10121;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,620px);max-height:90vh;overflow:auto"><div class="title" id="futureModalTitleV37">未来予定</div><div class="form" style="grid-template-columns:1fr 1fr"><div class="field"><label>日付</label><input id="futureDateV37" type="date"></div><div class="field"><label>種類</label><select id="futureKindV37"><option value="INCOME">収入</option><option value="NORMAL">通常費</option><option value="SPECIAL">特別費</option><option value="INVESTMENT">投資</option><option value="DEBT">負債返済</option><option value="TRANSFER">資金移動</option></select></div><div class="field" style="grid-column:1/-1"><label>内容</label><input id="futureNameV37" placeholder="例：ボーナス、旅行、保険、入園費"></div><div class="field"><label>金額</label><input id="futureAmountV37" type="number" min="0" step="1" placeholder="未定なら空欄"></div><div class="field"><label>確度</label><select id="futureCertaintyV37"><option value="CONFIRMED">確定</option><option value="ESTIMATED">概算</option><option value="TBD">未定</option></select></div><div class="field"><label>繰り返し</label><select id="futureRecurringV37"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div><div class="field" style="grid-column:1/-1"><label>メモ</label><textarea id="futureNoteV37" rows="3" placeholder="根拠、支払条件、確認事項など"></textarea></div></div><div class="tiny" style="margin-top:8px">金額は正の額で入力します。収入は＋、それ以外は−として資金繰りに反映します。金額未定は残高予測に加算しません。</div><div class="controls" style="margin-top:14px;flex-wrap:wrap"><button class="btn" id="futureSaveV37">保存</button><button class="btn secondary" id="futureCancelV37">キャンセル</button></div></div>`;
    document.body.appendChild(modal);modal.querySelector('[data-future-close]').onclick=closeEditor;$('futureCancelV37').onclick=closeEditor;$('futureSaveV37').onclick=saveEditor;
  }
  function openEditor(id=''){
    ensureModal();const st=stateNow(),e=id?(st.events||[]).find(x=>String(x.id)===String(id)):null;editingId=e?.id||null;
    $('futureModalTitleV37').textContent=e?'未来予定を編集':'未来予定を追加';$('futureDateV37').value=e?.date||todayIso();$('futureNameV37').value=e?.name||'';$('futureKindV37').value=e?inferKind(e):'SPECIAL';const a=e?normalizedAmount(e):null;$('futureAmountV37').value=a===null?'':String(Math.abs(a));$('futureCertaintyV37').value=e?certainty(e):'ESTIMATED';$('futureRecurringV37').value=e?recurring(e):'NONE';$('futureNoteV37').value=e?.note||'';$(MODAL_ID).classList.remove('hidden');
  }
  function closeEditor(){$(MODAL_ID)?.classList.add('hidden');editingId=null}
  function saveEditor(){
    const date=$('futureDateV37').value,name=$('futureNameV37').value.trim(),kind=$('futureKindV37').value,raw=$('futureAmountV37').value,cert=$('futureCertaintyV37').value,rec=$('futureRecurringV37').value,note=$('futureNoteV37').value.trim();
    if(!date||!name||!VALID_KIND.has(kind)||!VALID_CERTAINTY.has(cert)||!VALID_RECURRING.has(rec)){alert('日付・内容・種類を確認してください。');return}
    const numeric=raw===''?null:Number(raw);if(numeric!==null&&!Number.isFinite(numeric)){alert('金額を確認してください。');return}
    const amount=numeric===null?null:(kind==='INCOME'?Math.abs(numeric):-Math.abs(numeric));const st=stateNow();normalizeEvents(st);let e=editingId?(st.events||[]).find(x=>String(x.id)===String(editingId)):null;
    if(!e){e={id:crypto.randomUUID(),createdAt:new Date().toISOString()};st.events.push(e)}
    Object.assign(e,{date,name,amount,type:`FUTURE_${kind}`,future_kind:kind,expense_scope:kind==='INCOME'?null:kind,certainty:cert,estimated:cert!=='CONFIRMED',recurring:rec,note,updatedAt:new Date().toISOString(),futurePlannerVersion:1});persist(st,e.id===editingId?'未来予定編集':'未来予定追加');closeEditor();renderPlanner();try{render()}catch{}
  }
  function removeEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;if(!confirm(`「${e.name}」を削除しますか？`))return;st.events=st.events.filter(x=>String(x.id)!==String(id));persist(st,'未来予定削除');renderPlanner();try{render()}catch{}}

  function certLabel(c){return c==='CONFIRMED'?'確定':c==='ESTIMATED'?'概算':'未定'}
  function recurLabel(r){return r==='MONTHLY'?'毎月':r==='YEARLY'?'毎年':'単発'}
  function kindLabel(k){return({INCOME:'収入',NORMAL:'通常費',SPECIAL:'特別費',INVESTMENT:'投資',DEBT:'負債返済',TRANSFER:'資金移動'})[k]||k}
  function renderPlanner(){
    if(!ensureUi())return;const st=stateNow();normalizeEvents(st);const rows=[...(st.events||[])].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    const future=rows.filter(e=>String(e.date||'')>=todayIso()),unknown=future.filter(e=>normalizedAmount(e)===null||certainty(e)==='TBD').length,confirmed=future.filter(e=>certainty(e)==='CONFIRMED').length,estimated=future.filter(e=>certainty(e)==='ESTIMATED').length;
    $('futureSummaryV37').innerHTML=[['今後の予定',future.length+'件'],['確定',confirmed+'件'],['概算',estimated+'件'],['未定/金額未定',unknown+'件']].map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${v}</b></div>`).join('');
    $('futureRowsV37').innerHTML=rows.length?rows.map(e=>{const k=inferKind(e),c=certainty(e),r=recurring(e),a=normalizedAmount(e),past=String(e.date||'')<todayIso();return`<div class="row" style="align-items:flex-start;gap:10px"><div style="min-width:0;flex:1"><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'日付未設定')} · ${kindLabel(k)} · ${certLabel(c)} · ${recurLabel(r)}${past?' · 過去':''}</div>${e.note?`<div class="tiny" style="margin-top:4px">${esc(e.note)}</div>`:''}</div><div class="controls" style="flex-wrap:wrap;justify-content:flex-end"><b class="amt ${a===null?'warn':a<0?'bad':'good'}">${a===null?'金額未定':`${a>0?'+':''}${yen(a)}`}</b><button class="btn secondary" data-future-edit="${esc(e.id)}">編集</button><button class="btn danger" data-future-del="${esc(e.id)}">削除</button></div></div>`}).join(''):'<div class="note">未来予定はまだありません。「＋予定を追加」から登録できます。</div>';
  }
  function queue(){clearTimeout(renderTimer);renderTimer=setTimeout(renderPlanner,80)}
  function boot(){const st=stateNow();if(normalizeEvents(st))persist(st,'Phase 6データ移行');ensureUi();renderPlanner();const target=$('eventsBody');if(target){observer=new MutationObserver(queue);observer.observe(target,{childList:true,subtree:true})}document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"]'))setTimeout(renderPlanner,0)});window.addEventListener('focus',queue);window.renderFuturePlannerV37=renderPlanner}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();