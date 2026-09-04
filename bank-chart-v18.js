(() => {
  const PREF_KEY='householdTreasuryBankChartPrefsV18';
  const LABELS={total:'合計',rakuten:'楽天銀行',yucho:'ゆうちょ',other:'その他銀行'};
  const STYLES={
    total:{stroke:'#eef4ff',width:3.5,opacity:1},
    rakuten:{stroke:'#7dd3fc',width:2,opacity:.9},
    yucho:{stroke:'#6ee7b7',width:2,opacity:.9},
    other:{stroke:'#fbbf24',width:2,opacity:.85}
  };
  let prefs=loadPrefs();

  function loadPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem(PREF_KEY)||'null')||{};
      return{
        count:['30','90','200','all'].includes(String(p.count))?String(p.count):'90',
        visible:{total:p.visible?.total!==false,rakuten:p.visible?.rakuten!==false,yucho:p.visible?.yucho!==false,other:p.visible?.other!==false}
      };
    }catch{return{count:'90',visible:{total:true,rakuten:true,yucho:true,other:true}}}
  }
  function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
  const finite=v=>v!==null&&v!==''&&Number.isFinite(Number(v));
  const fmtYen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const fmtSigned=n=>`${Number(n)>=0?'+':''}${fmtYen(n)}`;
  const fmtShort=n=>{const v=Math.abs(Number(n)||0),s=Number(n)<0?'-':'';if(v>=1000000)return`${s}${(v/1000000).toFixed(v>=10000000?0:1)}百万円`;if(v>=10000)return`${s}${(v/10000).toFixed(v>=100000?0:1)}万円`;return`${s}${Math.round(v).toLocaleString('ja-JP')}円`};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function institutionKey(source){
    const s=norm(source);
    if(!s)return null;
    if(s.includes('RAKUTENBANK')||s.includes('楽天銀行'))return'rakuten';
    if(s.includes('YUCHO')||s.includes('ゆうちょ')||s.includes('郵貯'))return'yucho';
    if(s.includes('SECURITIES')||s.includes('証券'))return null;
    if(s.includes('BANK')||s.includes('銀行'))return'other';
    return null;
  }
  function txSignature(t,k){return[k,t.date,Number(t.amount)||0,norm(t.description_raw||t.description||''),Number(t.balance_after)].join('|')}

  function orderDayEvents(items){
    if(items.length<=1)return items.slice();
    const remaining=items.slice();
    const afterSet=new Set(remaining.map(x=>Number(x.balance_after)));
    let startIndex=remaining.findIndex(x=>!afterSet.has(Number(x.balance_after)-Number(x.amount||0)));
    if(startIndex<0)startIndex=0;
    const ordered=[remaining.splice(startIndex,1)[0]];
    while(remaining.length){
      const bal=Number(ordered.at(-1).balance_after);
      const nextIndex=remaining.findIndex(x=>Number(x.balance_after)-Number(x.amount||0)===bal);
      if(nextIndex<0){remaining.sort((a,b)=>(a.__index??0)-(b.__index??0));ordered.push(...remaining.splice(0));break}
      ordered.push(remaining.splice(nextIndex,1)[0]);
    }
    return ordered;
  }

  function buildEventLedger(){
    const state=window.getTreasuryState?.()||{};
    const seen=new Set(),aliases={rakuten:new Set(),yucho:new Set(),other:new Set()};
    const byInstitution={rakuten:[],yucho:[],other:[]};
    let duplicates=0,ignored=0;
    (state.cashTransactions||[]).forEach((raw,index)=>{
      if(!raw?.date||!finite(raw.balance_after))return;
      const k=institutionKey(raw.source);if(!k){ignored++;return}
      aliases[k].add(String(raw.source||''));
      const sig=txSignature(raw,k);if(seen.has(sig)){duplicates++;return}seen.add(sig);
      byInstitution[k].push({...raw,__index:index,__institution:k});
    });

    for(const k of Object.keys(byInstitution)){
      const days=new Map();
      for(const e of byInstitution[k]){if(!days.has(e.date))days.set(e.date,[]);days.get(e.date).push(e)}
      byInstitution[k]=[...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).flatMap(([,items])=>orderDayEvents(items));
    }

    const active=Object.entries(byInstitution).filter(([,arr])=>arr.length);
    if(!active.length)return{state,events:[],series:{total:[],rakuten:[],yucho:[],other:[]},duplicates,ignored,aliases,coverageStart:null};
    const coverageStart=active.map(([,arr])=>arr[0].date).sort().at(-1);

    const balances={rakuten:null,yucho:null,other:null};
    for(const [k,arr] of active){
      const before=arr.filter(e=>e.date<coverageStart).at(-1);
      if(before)balances[k]=Number(before.balance_after);
      else{
        const first=arr.find(e=>e.date>=coverageStart);
        if(first)balances[k]=Number(first.balance_after)-Number(first.amount||0);
      }
    }

    const rank={rakuten:0,yucho:1,other:2};
    const ledger=[];
    for(const [k,arr] of active){
      let localOrder=0;
      for(const e of arr){
        if(e.date<coverageStart)continue;
        ledger.push({...e,__institution:k,__localOrder:localOrder++});
      }
    }
    ledger.sort((a,b)=>a.date.localeCompare(b.date)||rank[a.__institution]-rank[b.__institution]||a.__localOrder-b.__localOrder||a.__index-b.__index);

    const series={total:[],rakuten:[],yucho:[],other:[]};
    const events=[];
    ledger.forEach((e,i)=>{
      const k=e.__institution;
      balances[k]=Number(e.balance_after);
      const index=i+1;
      const total=Object.entries(balances).filter(([key,v])=>byInstitution[key].length&&finite(v)).reduce((s,[,v])=>s+Number(v),0);
      const point={index,date:e.date,value:total,event:e};
      series.total.push(point);
      for(const key of['rakuten','yucho','other'])if(byInstitution[key].length&&finite(balances[key]))series[key].push({index,date:e.date,value:Number(balances[key]),event:e});
      events.push({index,date:e.date,institution:k,amount:Number(e.amount)||0,balanceAfter:Number(e.balance_after),totalAfter:total,description:e.description_raw||e.description||'',source:e.source||'',sourceFile:e.source_file||''});
    });

    return{state,events,series,duplicates,ignored,aliases,coverageStart};
  }

  function sliced(model){
    const n=prefs.count==='all'?model.events.length:Number(prefs.count)||90;
    const start=Math.max(0,model.events.length-n);
    const minIndex=model.events[start]?.index||1;
    const series={};
    for(const k of['total','rakuten','yucho','other'])series[k]=model.series[k].filter(p=>p.index>=minIndex);
    return{events:model.events.slice(start),series,minIndex};
  }

  function ensureUi(){
    document.getElementById('bankHistoryChartCardV17')?.remove();
    document.getElementById('bankHistoryChartCard')?.remove();
    if(document.getElementById('bankHistoryChartCardV18'))return;
    const grid=document.querySelector('#dashboard .grid');if(!grid)return;
    const card=document.createElement('div');card.className='card full';card.id='bankHistoryChartCardV18';
    card.innerHTML=`
      <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
        <div><div class="title" style="margin-bottom:3px">銀行残高推移</div><div class="tiny" id="bankChartCoverageV18">取引イベント順で表示</div></div>
        <div class="controls" id="bankChartRangesV18" style="flex-wrap:wrap"></div>
      </div>
      <div class="controls" id="bankChartLegendV18" style="margin:10px 0 4px;flex-wrap:wrap"></div>
      <div id="bankChartAuditV18" class="note" style="margin:8px 0"></div>
      <div id="bankChartPlotV18" style="position:relative;min-height:270px"></div>
      <div id="bankChartStatsV18" class="form" style="margin-top:10px"></div>
      <div class="tiny" style="margin-top:8px">横軸は日付ではなく取引イベント数です。同日内でも1取引ごとに横へ進みます。同日の別銀行間はCSVに時刻がないため、楽天→ゆうちょ→その他の順で表示します。</div>`;
    grid.insertBefore(card,grid.firstChild);
  }

  function renderControls(model){
    const r=document.getElementById('bankChartRangesV18'),l=document.getElementById('bankChartLegendV18');if(!r||!l)return;
    r.innerHTML=[['30','30件'],['90','90件'],['200','200件'],['all','全件']].map(([v,n])=>`<button class="btn ${prefs.count===v?'':'secondary'}" data-count="${v}">${n}</button>`).join('');
    r.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>{prefs.count=b.dataset.count;savePrefs();renderChart()});
    l.innerHTML=['total','rakuten','yucho','other'].map(k=>`<button class="btn ${prefs.visible[k]&&model.series[k].length?'':'secondary'}" data-series="${k}" ${model.series[k].length?'':'disabled'}><span style="display:inline-block;width:18px;height:3px;background:${STYLES[k].stroke};vertical-align:middle;margin-right:6px"></span>${LABELS[k]}</button>`).join('');
    l.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{const k=b.dataset.series;prefs.visible[k]=!prefs.visible[k];savePrefs();renderChart()});
  }

  function latestBreakdown(model){
    if(!model.events.length)return null;
    const idx=model.events.at(-1).index,parts=[];
    for(const k of['rakuten','yucho','other']){
      const p=model.series[k].findLast(x=>x.index<=idx);if(p)parts.push({k,value:p.value});
    }
    return{event:model.events.at(-1),parts,total:model.series.total.at(-1)?.value||0};
  }

  function renderAudit(model){
    const box=document.getElementById('bankChartAuditV18');if(!box)return;const b=latestBreakdown(model);
    if(!b){box.innerHTML='銀行残高履歴がまだありません。';return}
    const formula=b.parts.map(p=>`${LABELS[p.k]} ${fmtYen(p.value)}`).join(' + ');
    const dashboard=Number(model.state?.settings?.cash)||0,diff=Number(b.total)-dashboard;
    const aliasNotes=['rakuten','yucho','other'].flatMap(k=>model.aliases[k].size>1?[`${LABELS[k]}表記: ${[...model.aliases[k]].join(' / ')}`]:[]);
    box.innerHTML=`<b>最新合計の内訳</b><br>${fmtYen(b.total)} = ${formula}<div class="tiny" style="margin-top:5px">最新イベント ${b.event.date} · #${b.event.index}${model.duplicates?` · 完全一致重複 ${model.duplicates}件をグラフ上で除外`:''}</div>${Math.abs(diff)>1?`<div class="warn" style="margin-top:6px">Dashboardの銀行合計 ${fmtYen(dashboard)} と ${fmtYen(diff)} ずれています。</div>`:''}${aliasNotes.length?`<div class="warn" style="margin-top:6px">旧表記を検出: ${aliasNotes.join(' / ')}</div>`:''}`;
  }

  function renderStats(view){
    const box=document.getElementById('bankChartStatsV18');if(!box)return;
    const s=view.series.total;if(!s.length){box.innerHTML='';return}
    const last=s.at(-1),event30=s.length>30?s.at(-31):null,event90=s.length>90?s.at(-91):null,vals=s.map(x=>x.value),low=Math.min(...vals),high=Math.max(...vals);
    const item=(n,v,c='')=>`<div><span class="muted">${n}</span><b class="${c}" style="display:block;font-size:20px;margin-top:5px">${v}</b></div>`;
    const fd=(p)=>p?fmtSigned(last.value-p.value):'—';
    box.innerHTML=[item('最新合計',fmtYen(last.value)),item('30イベント前比',fd(event30),event30?(last.value-event30.value>=0?'good':'bad'):''),item('90イベント前比',fd(event90),event90?(last.value-event90.value>=0?'good':'bad'):''),item('表示範囲 底値 / 高値',`${fmtYen(low)} / ${fmtYen(high)}`)].join('');
  }

  function renderSvg(view){
    const host=document.getElementById('bankChartPlotV18');if(!host)return;
    const keys=['total','rakuten','yucho','other'].filter(k=>prefs.visible[k]&&view.series[k].length);
    const all=keys.flatMap(k=>view.series[k]);
    if(!all.length){host.innerHTML='<div class="muted">表示する履歴がありません。</div>';return}
    const minI=Math.min(...all.map(p=>p.index)),maxI=Math.max(...all.map(p=>p.index));
    const vals=all.map(p=>Number(p.value)),rawMin=Math.min(...vals),rawMax=Math.max(...vals),span=Math.max(1,rawMax-rawMin),minV=Math.max(0,rawMin-span*.08),maxV=rawMax+span*.08;
    const W=1000,H=310,L=76,R=18,T=18,B=48,pw=W-L-R,ph=H-T-B;
    const x=i=>L+((Number(i)-minI)/Math.max(1,maxI-minI))*pw;
    const y=v=>T+((maxV-Number(v))/Math.max(1,maxV-minV))*ph;
    const linePath=s=>s.map((p,i)=>`${i?'L':'M'}${x(p.index).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const grid=[];for(let i=0;i<=4;i++){const yy=T+ph*i/4,val=maxV-(maxV-minV)*i/4;grid.push(`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#2b3b5d"/><text x="${L-8}" y="${yy+4}" fill="#9fb0cc" font-size="11" text-anchor="end">${fmtShort(val)}</text>`)}
    const paths=keys.map(k=>`<path d="${linePath(view.series[k])}" fill="none" stroke="${STYLES[k].stroke}" stroke-width="${STYLES[k].width}" opacity="${STYLES[k].opacity}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    const startEvent=view.events[0],endEvent=view.events.at(-1);
    host.innerHTML=`<svg id="bankChartSvgV18" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;touch-action:none" aria-label="銀行残高イベント推移グラフ">${grid.join('')}${paths}<text x="${L}" y="${H-15}" fill="#9fb0cc" font-size="11">#${startEvent?.index||minI} · ${startEvent?.date||''}</text><text x="${W-R}" y="${H-15}" fill="#9fb0cc" font-size="11" text-anchor="end">#${endEvent?.index||maxI} · ${endEvent?.date||''}</text><line id="bankChartCrossV18" x1="0" y1="${T}" x2="0" y2="${H-B}" stroke="#eef4ff" stroke-width="1" opacity="0"/><circle id="bankChartDotV18" cx="0" cy="0" r="4.5" fill="#eef4ff" opacity="0"/><rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg><div id="bankChartTipV18" class="note hidden" style="position:absolute;pointer-events:none;z-index:5;padding:9px 11px;min-width:210px;max-width:300px;box-shadow:0 6px 22px #0008"></div>`;
    const svg=document.getElementById('bankChartSvgV18'),tip=document.getElementById('bankChartTipV18'),cross=document.getElementById('bankChartCrossV18'),dot=document.getElementById('bankChartDotV18');
    const eventByIndex=new Map(view.events.map(e=>[e.index,e]));
    const pointAt=(series,index)=>series.findLast(p=>p.index<=index)||null;
    const onMove=ev=>{
      const rect=svg.getBoundingClientRect(),px=(ev.clientX-rect.left)/rect.width*W,ratio=Math.max(0,Math.min(1,(px-L)/pw)),target=Math.round(minI+ratio*(maxI-minI));
      const event=eventByIndex.get(target)||view.events.reduce((best,e)=>Math.abs(e.index-target)<Math.abs(best.index-target)?e:best,view.events[0]);if(!event)return;
      const xx=x(event.index),totalPoint=pointAt(view.series.total,event.index);
      cross.setAttribute('x1',xx);cross.setAttribute('x2',xx);cross.setAttribute('opacity','1');
      if(totalPoint){dot.setAttribute('cx',xx);dot.setAttribute('cy',y(totalPoint.value));dot.setAttribute('opacity','1')}else dot.setAttribute('opacity','0');
      const balances=['total','rakuten','yucho','other'].filter(k=>prefs.visible[k]).map(k=>{const p=pointAt(view.series[k],event.index);return p?`<div style="display:flex;justify-content:space-between;gap:16px"><span>${LABELS[k]}</span><b>${fmtYen(p.value)}</b></div>`:''}).join('');
      tip.innerHTML=`<b>${esc(event.date)} · イベント #${event.index}</b><div style="margin-top:5px"><b>${LABELS[event.institution]}</b> ${event.amount>=0?'<span class="good">':'<span class="bad">'}${fmtSigned(event.amount)}</span></div><div class="tiny" style="margin:3px 0 7px">${esc(event.description||'内容なし')}</div><div style="display:flex;justify-content:space-between;gap:16px"><span>取引後残高</span><b>${fmtYen(event.balanceAfter)}</b></div>${balances}`;
      tip.classList.remove('hidden');
      const hr=host.getBoundingClientRect(),screenX=xx/W*hr.width;tip.style.left=`${Math.min(Math.max(4,screenX+8),Math.max(4,hr.width-310))}px`;tip.style.top='8px';
    };
    const hide=()=>{cross.setAttribute('opacity','0');dot.setAttribute('opacity','0');tip.classList.add('hidden')};
    svg.addEventListener('pointermove',onMove);svg.addEventListener('pointerdown',onMove);svg.addEventListener('pointerleave',hide);
  }

  function renderChart(){
    ensureUi();const model=buildEventLedger(),view=sliced(model);renderControls(model);renderAudit(model);renderSvg(view);renderStats(view);
    const c=document.getElementById('bankChartCoverageV18');if(c){const active=['rakuten','yucho','other'].filter(k=>model.series[k].length).map(k=>LABELS[k]);c.textContent=active.length?`${active.join('・')} · ${model.events.length}イベントを取引順で表示`:'銀行CSVを取り込むと履歴を表示します。'}
  }

  const prev=typeof render==='function'?render:null;
  if(prev)render=function renderV18(){prev();renderChart()};
  window.renderBankChart=renderChart;
  try{renderChart()}catch(e){console.error('bank chart v18',e)}
})();