(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const isRakuten=s=>{const n=norm(s);return n.includes('RAKUTEN')||n.includes('楽天')};
  let busy=false,timer=null,observer=null;

  function scanRakuten(src,file){
    if(typeof parseCsv!=='function'||typeof findHeader!=='function'||typeof rowObj!=='function'||typeof number!=='function')return null;
    const rows=parseCsv(src.text),hi=findHeader(rows,['利用日','利用店名・商品名']);if(hi<0)return null;
    const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,''));
    const fm=String(file?.name||'').match(/enavi(\d{4})(\d{2})/i),billingMonth=fm?`${fm[1]}-${fm[2]}`:'';
    const payHeader=h.find(x=>/^\d{1,2}月支払金額$/.test(String(x).trim()));
    if(!billingMonth||!payHeader)return{billingMonth,payHeader:null,lines:[]};
    const counts=new Map(),lines=[];
    for(const r of rows.slice(hi+1)){
      const o=rowObj(h,r);if(!o['利用日'])continue;
      const merchant=String(o['利用店名・商品名']||''),amount=number(o['利用金額']);if(amount===null)continue;
      const billed=number(o[payHeader]);if(billed===null)continue;
      const payment=String(o['支払方法']||''),refi=/ﾍﾝｻｲﾍﾝｺｳ|返済方法変更ＷＥＢ|分割変更/i.test(`${merchant} ${payment}`);
      const date=typeof parseDate==='function'?parseDate(o['利用日']):String(o['利用日']||'');
      const merchantKey=norm(merchant),paymentKey=norm(payment),base=[billingMonth,date,merchantKey,Math.abs(Number(amount)||0),paymentKey,refi?'A':'P'].join('|');
      const occurrence=(counts.get(base)||0)+1;counts.set(base,occurrence);
      const rawKey=[base,occurrence].join('|');
      const id=`rakuten-bill:${billingMonth}:${typeof hash32==='function'?hash32(rawKey):rawKey}`;
      lines.push({billing_line_id:id,card:'Rakuten',billing_month:billingMonth,purchase_date:date,merchant_raw:merchant,merchant_normalized:merchantKey,original_amount:Math.abs(Number(amount)||0),billed_amount:Number(billed)||0,payment_method:payment,occurrence_index:occurrence,line_kind:refi?'ADJUSTMENT':'PURCHASE',source_files:[file.name],source_file:file.name,confidence:.99});
    }
    return{billingMonth,payHeader,lines};
  }

  function purchaseKey(p){
    if(!isRakuten(p?.card))return'';
    return [String(p.billing_month||''),String(p.purchase_id||''),Number(p.occurrence_index||1)].join('|');
  }
  function richness(o){return ['fixed_expense_master_id','category','subcategory','economic_type','spending_class','card_settlement_id','reviewed_at','merchantAliases'].reduce((n,k)=>n+(o?.[k]!=null?1:0),0)}
  function mergePurchase(a,b){
    const winner=richness(b)>richness(a)?b:a,other=winner===a?b:a;
    for(const [k,v] of Object.entries(other))if((winner[k]===undefined||winner[k]===null||winner[k]==='')&&v!==undefined)winner[k]=v;
    const files=new Set([...(winner.source_files||[]),...(other.source_files||[]),winner.source_file,other.source_file].filter(Boolean));winner.source_files=[...files];
    if(!winner.source_file)winner.source_file=winner.source_files[0]||null;
    return winner;
  }
  function dedupeRakutenPurchases(st){
    const arr=Array.isArray(st.purchaseEvents)?st.purchaseEvents:[],groups=new Map(),passthrough=[];
    for(const p of arr){const k=purchaseKey(p);if(!k||!String(p.billing_month||'')){passthrough.push(p);continue}if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
    let removed=0;const merged=[...passthrough];
    for(const group of groups.values()){
      let x=group[0];for(let i=1;i<group.length;i++){x=mergePurchase(x,group[i]);removed++}merged.push(x)
    }
    if(removed)st.purchaseEvents=merged;return removed;
  }

  function findPurchase(st,line){
    const c=(st.purchaseEvents||[]).filter(p=>isRakuten(p.card)&&String(p.billing_month||'')===String(line.billing_month)&&String(p.purchase_date||'')===String(line.purchase_date)&&norm(p.merchant_raw||p.merchant_normalized||'')===norm(line.merchant_raw)&&Math.abs(Number(p.original_amount)||0)===Math.abs(Number(line.original_amount)||0)&&Number(p.occurrence_index||1)===Number(line.occurrence_index||1));
    if(c.length===1)return c[0];
    const byPayment=c.filter(p=>norm(p.payment_method||'')===norm(line.payment_method||''));return byPayment.length===1?byPayment[0]:null;
  }
  function upsertBillingLines(st,scan){
    st.cardBillingLines=Array.isArray(st.cardBillingLines)?st.cardBillingLines:[];let added=0,updated=0;
    for(const line of scan?.lines||[]){
      if(line.line_kind==='PURCHASE'){
        const p=findPurchase(st,line);if(p){line.purchase_id=p.purchase_id||null;line.fixed_expense_master_id=p.fixed_expense_master_id||null;line.category=p.category||null;line.subcategory=p.subcategory||null}
      }
      const old=st.cardBillingLines.find(x=>String(x.billing_line_id)===String(line.billing_line_id));
      if(old){const files=new Set([...(old.source_files||[]),...(line.source_files||[]),old.source_file,line.source_file].filter(Boolean));Object.assign(old,line,{source_files:[...files],source_file:old.source_file||line.source_file});updated++}
      else{st.cardBillingLines.push(line);added++}
    }
    return{added,updated};
  }
  function dedupeBillingLines(st){
    const arr=Array.isArray(st.cardBillingLines)?st.cardBillingLines:[],map=new Map();let removed=0;
    for(const x of arr){const id=String(x.billing_line_id||'');if(!id){continue}if(!map.has(id)){map.set(id,x);continue}const a=map.get(id),files=new Set([...(a.source_files||[]),...(x.source_files||[]),a.source_file,x.source_file].filter(Boolean));Object.assign(a,x,{source_files:[...files],source_file:a.source_file||x.source_file});removed++}
    if(removed)st.cardBillingLines=[...map.values()];return removed;
  }

  function reconcileRakuten(st){
    let changed=false;
    for(const s of st.cardSettlements||[]){
      if(!isRakuten(s.card)||!s.due_date)continue;const month=String(s.due_date).slice(0,7),lines=(st.cardBillingLines||[]).filter(x=>isRakuten(x.card)&&String(x.billing_month||'')===month);
      if(!lines.length)continue;
      const ids=lines.map(x=>x.billing_line_id),total=Math.round(lines.reduce((a,x)=>a+Number(x.billed_amount||0),0)*100)/100,diff=Math.round((Math.abs(Number(s.amount)||0)-total)*100)/100;
      const set=(k,v)=>{if(JSON.stringify(s[k])!==JSON.stringify(v)){s[k]=v;changed=true}};
      set('billing_line_ids',ids);set('detail_count',lines.length);set('detail_payment_total',total);set('detail_difference',diff);set('detail_reconciled',lines.length>0&&Math.abs(diff)<=1);set('billing_model','CARD_BILLING_LINES_V56');
    }
    return changed;
  }

  function persist(st,msg){
    if(busy)return;busy=true;try{window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.()}finally{setTimeout(()=>busy=false,0)}
  }

  const previousParse=typeof parseRakutenCard==='function'?parseRakutenCard:null;
  if(previousParse){
    parseRakutenCard=function parseRakutenCardV56(src,file){
      const scan=scanRakuten(src,file),result=previousParse(src,file),st=(typeof state!=='undefined'?state:stateNow());
      const removed=dedupeRakutenPurchases(st),up=upsertBillingLines(st,scan),lineDup=dedupeBillingLines(st);reconcileRakuten(st);
      result.billingLines=(scan?.lines||[]).length;result.billingLineAdded=up.added;result.billingLineUpdated=up.updated;result.purchaseDuplicatesMerged=removed;result.billingDuplicatesMerged=lineDup;
      return result;
    };
  }

  function fallbackDetails(st,s){return (st.purchaseEvents||[]).filter(p=>String(p.card_settlement_id||'')===String(s.settlement_id||''))}
  function fallbackAmount(p){const v=p.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p.original_amount)||0)}
  function renderCenter(){
    const old=$('cardClaimsV46');if(old)old.style.display='none';const grid=document.querySelector('#cashflow .grid');if(!grid)return;
    let card=$('cardClaimsV56');if(!card){card=document.createElement('div');card.id='cardClaimsV56';card.className='card full';card.innerHTML='<div class="title">カード請求・内訳 <span class="tag">請求明細 v56</span></div><div class="tiny" style="margin-bottom:10px">購入額と当月請求額を分離して照合します。同じ請求CSVを別名で再読込しても二重計上しません。</div><div id="cardClaimsRowsV56"></div>';grid.prepend(card)}
    const st=stateNow(),all=[...(st.cardSettlements||[])].filter(s=>s.due_date).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date))).slice(0,24),host=$('cardClaimsRowsV56');if(!host)return;
    host.innerHTML=all.length?all.map(s=>{
      const month=String(s.due_date).slice(0,7),billing=isRakuten(s.card)?(st.cardBillingLines||[]).filter(x=>isRakuten(x.card)&&String(x.billing_month||'')===month):[];
      let total=0,count=0,rows='';
      if(billing.length){count=billing.length;total=Math.round(billing.reduce((a,x)=>a+Number(x.billed_amount||0),0)*100)/100;rows=billing.map(x=>{const p=(st.purchaseEvents||[]).find(p=>String(p.purchase_id||'')===String(x.purchase_id||''));const meta=x.line_kind==='ADJUSTMENT'?'請求調整':p?.is_fixed_expense?`固定費: ${p.fixed_expense_name||'リンク済み'}`:p?.category||x.category||'';return `<div class="row"><div style="min-width:0"><b>${esc(x.merchant_raw||'カード明細')}</b><div class="tiny">${esc(x.purchase_date||'')} · ${esc(meta)}</div></div><b class="amt ${Number(x.billed_amount)<0?'good':''}">${yen(x.billed_amount)}</b></div>`}).join('')}
      else{const ds=fallbackDetails(st,s);count=ds.length;total=ds.reduce((a,p)=>a+fallbackAmount(p),0);rows=ds.map(p=>`<div class="row"><div style="min-width:0"><b>${esc(p.merchant_raw||'カード利用')}</b><div class="tiny">${esc(p.purchase_date||'')}${p.category?` · ${esc(p.category)}`:''}</div></div><b class="amt">${yen(fallbackAmount(p))}</b></div>`).join('')}
      const diff=Math.round((Math.abs(Number(s.amount)||0)-total)*100)/100,ok=count>0&&Math.abs(diff)<=1;
      return `<details class="card" style="padding:12px;margin-top:8px"><summary style="cursor:pointer"><b>${esc(s.card||'カード')} · ${esc(s.due_date)}</b>　<span class="amt">${yen(s.amount)}</span>　<span class="tiny ${ok?'good':count?'warn':''}">${count?`内訳 ${count}件 / ${yen(total)}${ok?' ✓':` / 差 ${yen(diff)}`}`:'内訳未取得'}</span></summary><div style="margin-top:8px">${rows||'<div class="muted">請求内訳CSVを再取込すると照合できます。</div>'}</div></details>`
    }).join(''):'<div class="muted">カード請求はまだありません。</div>';
  }

  const previousImport=typeof importOne==='function'?importOne:null;
  if(previousImport){
    importOne=async function importOneV56(file){const result=await previousImport(file),st=stateNow();const removed=dedupeRakutenPurchases(st),lineDup=dedupeBillingLines(st),changed=reconcileRakuten(st);if(removed||lineDup||changed)persist(st,'カード請求照合更新');setTimeout(renderCenter,0);return result};
  }

  function repairExisting(){const st=stateNow(),removed=dedupeRakutenPurchases(st),lineDup=dedupeBillingLines(st),changed=reconcileRakuten(st);if(removed||lineDup||changed)persist(st,'楽天重複明細整理');setTimeout(()=>{renderCenter();window.reconcileCardDetailsV46?.()},0)}
  function queue(){clearTimeout(timer);timer=setTimeout(()=>{const st=stateNow();if(reconcileRakuten(st))persist(st,'カード請求照合更新');renderCenter()},100)}
  function boot(){repairExisting();renderCenter();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="imports"]'))setTimeout(renderCenter,0)});const host=$('importResults');if(host){observer=new MutationObserver(queue);observer.observe(host,{childList:true,subtree:true,characterData:true})}window.addEventListener('focus',queue);window.renderCardClaimsV56=renderCenter}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();