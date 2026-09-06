(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const mobileMq=window.matchMedia('(max-width:820px)');
  let horizon=30,editingId=null,timer=null,booted=false;

  function isMobile(){return mobileMq.matches}
  function parentId(e,st){
    if(e?.parent_event_id && (st.events||[]).some(x=>String(x.id)===String(e.parent_event_id))) return String(e.parent_event_id);
    if((st.events||[]).some(x=>String(x.id)===String(e?.id))) return String(e.id);
    const id=String(e?.id||'');
    if(id.startsWith('future:')){
      for(const x of st.events||[]){if(id.startsWith(`future:${x.id}:`))return String(x.id)}
    }
    return '';
  }
  function kindOf(e){const k=String(e?.future_kind||'').toUpperCase();if(['INCOME','NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].includes(k))return k;return Number(e?.amount)>0?'INCOME':'SPECIAL'}
  function kindLabel(k){return({INCOME:'収入',NORMAL:'通常費',SPECIAL:'特別費',INVESTMENT:'投資',DEBT:'負債返済',TRANSFER:'資金移動'})[k]||k}

  function installCss(){
    if($('mobileCashflowStyleV60'))return;const s=document.createElement('style');s.id='mobileCashflowStyleV60';s.textContent=`
      @media(max-width:820px){
        #mobileCashflowV60{display:block!important;grid-column:1/-1!important}
        #mobileCashflowV60 .v60-horizons{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0 12px}
        #mobileCashflowV60 .v60-horizons button{padding:10px 4px;min-width:0;font-size:13px}
        #mobileCashflowV60 .v60-horizons button.active{background:#28436c;border-color:#7dd3fc;color:#eef4ff}
        #mobileCashflowV60 .v60-row{display:block;padding:11px 0;border-bottom:1px solid #263755}
        #mobileCashflowV60 .v60-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
        #mobileCashflowV60 .v60-name{min-width:0;flex:1;overflow-wrap:anywhere}
        #mobileCashflowV60 .v60-actions{display:flex;gap:7px;margin-top:8px;justify-content:flex-end}
        #mobileCashflowV60 .v60-actions .btn{padding:8px 13px}
        #mobileCashflowV60 .v60-generated{margin-top:7px;text-align:right}
        #mobileFutureV59{display:none!important}
        #cashflow #eventsBody{display:none!important}
        #cashflow #eventsBody:has(*){display:none!important}
        #cashflow #eventsBody.closest{display:none!important}
        #futureEditorV60 .v60-bg{position:fixed;inset:0;background:#0009;z-index:10400}
        #futureEditorV60 .v60-modal{position:fixed;z-index:10401;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,520px);max-height:90vh;overflow:auto}
        #futureEditorV60 .form{grid-template-columns:1fr!important}
      }
      @media(min-width:821px){#mobileCashflowV60{display:none!important}}
    `;document.head.appendChild(s);
  }

  function ensureUi(){
    installCss();let card=$('mobileCashflowV60');
    if(!card){
      const grid=document.querySelector('#cashflow .grid');if(!grid)return null;
      card=document.createElement('div');card.id='mobileCashflowV60';card.className='card full';
      card.innerHTML=`<div><div class="title" style="margin-bottom:3px">将来イベント <span class="tag">携帯 v60</span></div><div class="tiny">期間切替と手動予定の編集・削除をここで行えます。</div></div><div class="v60-horizons"><button class="btn secondary" data-v60-h="30">30日</button><button class="btn secondary" data-v60-h="60">60日</button><button class="btn secondary" data-v60-h="90">90日</button><button class="btn secondary" data-v60-h="180">6か月</button></div><div id="mobileCashflowRowsV60"></div>`;
      grid.prepend(card);
      card.addEventListener('click',e=>{
        const hb=e.target.closest?.('[data-v60-h]');if(hb){horizon=Number(hb.dataset.v60H)||30;render();return}
        const eb=e.target.closest?.('[data-v60-edit]');if(eb){openEditor(eb.dataset.v60Edit);return}
        const db=e.target.closest?.('[data-v60-del]');if(db){removeEvent(db.dataset.v60Del);return}
      });
    }
    return card;
  }

  function rowsFor(){
    let rows=[];try{if(typeof forecast==='function')rows=forecast(horizon).rows||[];else if(typeof generated==='function')rows=generated(horizon)||[]}catch(e){console.error('mobile cash flow v60 forecast',e)}return rows;
  }
  function render(){
    if(!isMobile())return;const card=ensureUi();if(!card)return;
    card.querySelectorAll('[data-v60-h]').forEach(b=>b.classList.toggle('active',Number(b.dataset.v60H)===horizon));
    const st=stateNow(),rows=rowsFor(),host=$('mobileCashflowRowsV60');if(!host)return;
    const shown=rows.slice(0,80);
    host.innerHTML=shown.length?shown.map(e=>{
      const pid=parentId(e,st),amountUnknown=e.amount_unknown||e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount));
      const kind=kindOf(e),amount=Number(e.amount)||0;
      return `<div class="v60-row"><div class="v60-top"><div class="v60-name"><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'')} · ${esc(kindLabel(kind))}</div></div><b class="amt ${amountUnknown?'warn':amount<0?'bad':'good'}">${amountUnknown?'未定':`${amount>0?'+':''}${yen(amount)}`}</b></div>${pid?`<div class="v60-actions"><button class="btn secondary" data-v60-edit="${esc(pid)}">編集</button><button class="btn danger" data-v60-del="${esc(pid)}">削除</button></div>`:`<div class="tiny v60-generated">自動生成</div>`}</div>`;
    }).join(''):'<div class="muted">この期間の予定はありません。</div>';
    if(rows.length>shown.length)host.insertAdjacentHTML('beforeend',`<div class="tiny" style="margin-top:9px">表示を軽くするため先頭${shown.length}件を表示しています。</div>`);
    const sel=$('forecastHorizon');if(sel)sel.value=String(horizon);
  }

  function ensureEditor(){
    if($('futureEditorV60'))return;const m=document.createElement('div');m.id='futureEditorV60';m.className='hidden';m.innerHTML=`<div class="v60-bg" data-v60-close></div><div class="card v60-modal"><div class="title">将来イベントを編集</div><div class="form"><div class="field"><label>日付</label><input id="v60Date" type="date"></div><div class="field"><label>内容</label><input id="v60Name"></div><div class="field"><label>種類</label><select id="v60Kind"><option value="INCOME">収入</option><option value="NORMAL">通常費</option><option value="SPECIAL">特別費</option><option value="INVESTMENT">投資</option><option value="DEBT">負債返済</option><option value="TRANSFER">資金移動</option></select></div><div class="field"><label>金額</label><input id="v60Amount" type="number" min="0"></div><div class="field"><label>確度</label><select id="v60Cert"><option value="CONFIRMED">確定</option><option value="ESTIMATED">概算</option><option value="TBD">未定</option></select></div><div class="field"><label>繰り返し</label><select id="v60Recurring"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div></div><div class="controls" style="margin-top:12px"><button class="btn" id="v60Save">保存</button><button class="btn secondary" id="v60Cancel">キャンセル</button></div></div>`;document.body.appendChild(m);m.querySelector('[data-v60-close]').onclick=closeEditor;$('v60Cancel').onclick=closeEditor;$('v60Save').onclick=saveEditor;
  }
  function openEditor(id){ensureEditor();const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;editingId=String(e.id);$('v60Date').value=e.date||'';$('v60Name').value=e.name||'';$('v60Kind').value=kindOf(e);$('v60Amount').value=e.amount===null||e.amount===''?'':String(Math.abs(Number(e.amount)||0));$('v60Cert').value=String(e.certainty||'ESTIMATED').toUpperCase();$('v60Recurring').value=String(e.recurring||'NONE').toUpperCase();$('futureEditorV60').classList.remove('hidden')}
  function closeEditor(){$('futureEditorV60')?.classList.add('hidden');editingId=null}
  function saveState(st,msg){window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();setTimeout(render,40)}
  function saveEditor(){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(editingId));if(!e)return;const date=$('v60Date').value,name=$('v60Name').value.trim(),kind=$('v60Kind').value,raw=$('v60Amount').value,cert=$('v60Cert').value,rec=$('v60Recurring').value;if(!date||!name)return alert('日付と内容を確認してください。');const n=raw===''?null:Number(raw);if(n!==null&&!Number.isFinite(n))return alert('金額を確認してください。');Object.assign(e,{date,name,amount:n===null?null:(kind==='INCOME'?Math.abs(n):-Math.abs(n)),type:`FUTURE_${kind}`,future_kind:kind,expense_scope:kind==='INCOME'?null:kind,certainty:cert,estimated:cert!=='CONFIRMED',recurring:rec,updatedAt:new Date().toISOString()});saveState(st,'将来イベント保存');closeEditor()}
  function removeEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;if(!confirm(`「${e.name||'この予定'}」を削除しますか？`))return;st.events=st.events.filter(x=>String(x.id)!==String(id));saveState(st,'将来イベント削除')}

  function hideLegacyMobile(){if(!isMobile())return;const table=$('eventsBody')?.closest('.table');if(table)table.style.display='none';const old=$('mobileFutureV59');if(old)old.style.display='none'}
  function boot(){if(booted)return;booted=true;ensureEditor();ensureUi();hideLegacyMobile();render();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"]'))setTimeout(()=>{hideLegacyMobile();render()},80)});window.addEventListener('focus',()=>setTimeout(render,80));mobileMq.addEventListener?.('change',()=>{hideLegacyMobile();render()});window.renderMobileCashflowV60=render}
  function waitBoot(n=0){if(typeof forecast==='function'&&document.querySelector('#cashflow .grid'))return boot();if(n<40)setTimeout(()=>waitBoot(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>waitBoot(),{once:true});else waitBoot();
})();