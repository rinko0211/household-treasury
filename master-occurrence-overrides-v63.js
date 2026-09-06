(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const mobileMq=window.matchMedia('(max-width:820px)');
  let patchTimer=null,observer=null,editing=null;

  function isMasterEvent(e){return !!(e&&(e.source==='master_fixed'||e.source==='master_annual'||e.master_id))}
  function originalDate(e){return String(e?.occurrence_original_date||e?.date||'')}
  function key(masterId,date){return `${String(masterId)}|${String(date)}`}
  function ensureList(st){st.masterOccurrenceOverrides=Array.isArray(st.masterOccurrenceOverrides)?st.masterOccurrenceOverrides:[];return st.masterOccurrenceOverrides}
  function findOverride(st,masterId,date){return ensureList(st).find(x=>String(x.master_id)===String(masterId)&&String(x.occurrence_date)===String(date))||null}

  if(typeof generated==='function'&&!window.__masterOccurrenceV63Wrapped){
    window.__masterOccurrenceV63Wrapped=true;
    const previousGenerated=generated;
    generated=function generatedWithOccurrenceOverridesV63(days=90){
      const st=stateNow(),overrides=ensureList(st),map=new Map(overrides.map(x=>[key(x.master_id,x.occurrence_date),x]));
      const rows=previousGenerated(days),out=[];
      for(const e of rows){
        if(!isMasterEvent(e)){out.push(e);continue}
        const baseDate=originalDate(e),o=map.get(key(e.master_id||e.source_master_id,baseDate));
        if(!o){out.push(e);continue}
        if(o.action==='SKIP')continue;
        if(o.action==='OVERRIDE'){
          out.push({...e,date:o.date||e.date,name:o.name||e.name,amount:Number.isFinite(Number(o.amount))?Number(o.amount):e.amount,occurrence_original_date:baseDate,occurrence_overridden:true,occurrence_override_id:o.id});
          continue;
        }
        out.push(e);
      }
      const from=new Date();from.setHours(0,0,0,0);const to=new Date(from);to.setDate(to.getDate()+Math.max(0,Number(days)||90));
      const f=`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-${String(from.getDate()).padStart(2,'0')}`;
      const t=`${to.getFullYear()}-${String(to.getMonth()+1).padStart(2,'0')}-${String(to.getDate()).padStart(2,'0')}`;
      return out.filter(e=>!e.date||(e.date>=f&&e.date<=t)).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    };
  }

  function rowsNow(){
    const h=Number(document.querySelector('#mobileCashflowV60 [data-v60-h].active')?.dataset.v60H)||30;
    try{return typeof forecast==='function'?(forecast(h).rows||[]):[]}catch{return[]}
  }
  function installCss(){
    if($('masterOccurrenceStyleV63'))return;
    const s=document.createElement('style');s.id='masterOccurrenceStyleV63';s.textContent=`
      @media(max-width:820px){
        #mobileCashflowV60 [data-v62-master-edit],#mobileCashflowV60 [data-v62-master-del]{display:none!important}
        #masterOccurrenceModalV63 .v63-bg{position:fixed;inset:0;background:#0009;z-index:10600}
        #masterOccurrenceModalV63 .v63-modal{position:fixed;z-index:10601;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,520px);max-height:90vh;overflow:auto}
        #masterOccurrenceModalV63 .form{grid-template-columns:1fr!important}
      }
    `;document.head.appendChild(s);
  }
  function patchActions(){
    if(!mobileMq.matches)return;const host=$('mobileCashflowRowsV60');if(!host)return;
    const rows=rowsNow(),dom=[...host.querySelectorAll('.v60-row')];
    dom.forEach((row,i)=>{
      const e=rows[i];if(!isMasterEvent(e))return;
      const mid=String(e.master_id||e.source_master_id||''),base=originalDate(e);if(!mid||!base)return;
      let actions=row.querySelector('.v60-actions');if(!actions){actions=document.createElement('div');actions.className='v60-actions';row.appendChild(actions)}
      actions.innerHTML=`<button class="btn secondary" data-v63-occ-edit="${esc(mid)}" data-v63-occ-date="${esc(base)}">この回を編集</button><button class="btn danger" data-v63-occ-del="${esc(mid)}" data-v63-occ-date="${esc(base)}">この回を削除</button><button class="btn secondary" data-v63-master="${esc(mid)}">元マスタ</button>`;
      row.querySelector('.v60-generated')?.remove();
      if(e.occurrence_overridden){const note=row.querySelector('.v63-override-note')||document.createElement('div');note.className='tiny v63-override-note';note.textContent='この回だけ変更済み';actions.before(note)}
    });
  }
  function queuePatch(delay=60){clearTimeout(patchTimer);patchTimer=setTimeout(patchActions,delay)}

  function persist(st,msg){
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();
    window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();
    setTimeout(()=>{window.renderMobileCashflowV60?.();queuePatch(120)},80);
  }
  function ensureModal(){
    if($('masterOccurrenceModalV63'))return;
    const m=document.createElement('div');m.id='masterOccurrenceModalV63';m.className='hidden';m.innerHTML=`<div class="v63-bg" data-v63-close></div><div class="card v63-modal"><div class="title">この回だけ編集</div><div class="note" style="margin-bottom:10px">固定費マスタ本体は変更しません。この発生分だけ日付・名称・金額を上書きします。</div><div class="form"><div class="field"><label>日付</label><input id="v63OccDate" type="date"></div><div class="field"><label>内容</label><input id="v63OccName"></div><div class="field"><label>金額</label><input id="v63OccAmount" type="number" min="0"></div></div><div class="controls" style="margin-top:12px;flex-wrap:wrap"><button class="btn" id="v63OccSave">この回だけ保存</button><button class="btn secondary" id="v63OccReset">元の予定に戻す</button><button class="btn secondary" id="v63OccCancel">キャンセル</button></div></div>`;
    document.body.appendChild(m);m.querySelector('[data-v63-close]').onclick=closeModal;$('v63OccCancel').onclick=closeModal;$('v63OccSave').onclick=saveOccurrence;$('v63OccReset').onclick=resetOccurrence;
  }
  function baseEvent(masterId,date){return rowsNow().find(e=>String(e.master_id||e.source_master_id||'')===String(masterId)&&originalDate(e)===String(date))||null}
  function openOccurrence(masterId,date){
    ensureModal();const st=stateNow(),o=findOverride(st,masterId,date),e=baseEvent(masterId,date),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(masterId));
    editing={masterId:String(masterId),date:String(date),sign:Number(e?.amount)<0?-1:1,baseName:e?.name||m?.name||'',baseAmount:Math.abs(Number(e?.amount)||Number(m?.amount)||0)};
    $('v63OccDate').value=o?.date||e?.date||date;$('v63OccName').value=o?.name||e?.name||m?.name||'';$('v63OccAmount').value=String(Math.abs(Number(o?.amount)||Number(e?.amount)||Number(m?.amount)||0));$('masterOccurrenceModalV63').classList.remove('hidden');
  }
  function closeModal(){$('masterOccurrenceModalV63')?.classList.add('hidden');editing=null}
  function saveOccurrence(){
    if(!editing)return;const date=$('v63OccDate').value,name=$('v63OccName').value.trim(),raw=Number($('v63OccAmount').value);if(!date||!name||!Number.isFinite(raw)||raw<0)return alert('日付・内容・金額を確認してください。');
    const st=stateNow(),list=ensureList(st),now=new Date().toISOString();st.masterOccurrenceOverrides=list.filter(x=>key(x.master_id,x.occurrence_date)!==key(editing.masterId,editing.date));
    st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:editing.masterId,occurrence_date:editing.date,action:'OVERRIDE',date,name,amount:(editing.sign<0?-1:1)*Math.abs(raw),updatedAt:now,createdAt:now,version:1});
    persist(st,'固定費この回だけ編集');closeModal();
  }
  function deleteOccurrence(masterId,date){
    const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(masterId));if(!confirm(`「${m?.name||'この予定'}」の ${date} 分だけ削除しますか？\n固定費マスタと翌月以降は残ります。`))return;
    const list=ensureList(st),now=new Date().toISOString();st.masterOccurrenceOverrides=list.filter(x=>key(x.master_id,x.occurrence_date)!==key(masterId,date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:String(masterId),occurrence_date:String(date),action:'SKIP',updatedAt:now,createdAt:now,version:1});persist(st,'固定費この回だけ削除');
  }
  function resetOccurrence(){
    if(!editing)return;const st=stateNow();st.masterOccurrenceOverrides=ensureList(st).filter(x=>key(x.master_id,x.occurrence_date)!==key(editing.masterId,editing.date));persist(st,'固定費この回の変更解除');closeModal();
  }
  function editMaster(id){
    document.querySelector('[data-page="settings"]')?.click();let tries=0;const seek=()=>{try{window.renderSemanticUiV48?.()}catch{}const box=document.querySelector(`[data-v48-fixed="${CSS.escape(String(id))}"]`)||document.querySelector(`[data-v43-save="${CSS.escape(String(id))}"]`)?.closest('.card');if(box){if('open'in box)box.open=true;box.scrollIntoView({behavior:'smooth',block:'center'});return}if(++tries<24)setTimeout(seek,100)};setTimeout(seek,80);
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-v63-occ-edit],[data-v63-occ-del],[data-v63-master]');if(!b)return;e.preventDefault();e.stopPropagation();
    if(b.matches('[data-v63-occ-edit]'))return openOccurrence(b.dataset.v63OccEdit,b.dataset.v63OccDate);
    if(b.matches('[data-v63-occ-del]'))return deleteOccurrence(b.dataset.v63OccDel,b.dataset.v63OccDate);
    if(b.matches('[data-v63-master]'))return editMaster(b.dataset.v63Master);
  },true);

  function boot(){installCss();ensureModal();queuePatch(120);const host=$('mobileCashflowRowsV60');if(host){observer=new MutationObserver(()=>queuePatch(70));observer.observe(host,{childList:true,subtree:false})}document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],#mobileCashflowV60 [data-v60-h]'))queuePatch(140)});window.addEventListener('focus',()=>queuePatch(100));window.renderMasterOccurrenceV63=patchActions}
  function wait(n=0){if($('mobileCashflowV60'))return boot();if(n<50)setTimeout(()=>wait(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();