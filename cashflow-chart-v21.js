(() => {
  const fmtYen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const fmtSigned = n => `${Number(n)>=0?'+':''}${fmtYen(n)}`;
  const fmtShort = n => {
    const v=Math.abs(Number(n)||0),s=Number(n)<0?'-':'';
    if(v>=1000000)return `${s}${(v/1000000).toFixed(v>=10000000?0:1)}百万円`;
    if(v>=10000)return `${s}${(v/10000).toFixed(v>=100000?0:1)}万円`;
    return `${s}${Math.round(v).toLocaleString('ja-JP')}円`;
  };
  const esc21 = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function ensureCashflowChart(){
    if(document.getElementById('cashflowForecastChartV21')) return;
    const grid=document.querySelector('#cashflow .grid');
    if(!grid) return;
    const card=document.createElement('div');
    card.id='cashflowForecastChartV21';
    card.className='card full';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div class="title" style="margin-bottom:3px">資金繰り予測</div>
          <div class="tiny" id="cashflowChartCaptionV21">予定イベントを順に反映した残高予測</div>
        </div>
        <span class="tag" id="cashflowChartHorizonV21">—</span>
      </div>
      <div id="cashflowChartPlotV21" style="position:relative;min-height:270px;margin-top:8px"></div>
      <div id="cashflowChartStatsV21" class="form" style="margin-top:10px"></div>
      <div class="tiny" style="margin-top:8px">横軸は予定イベント順です。同日に複数予定があっても1イベントずつ横へ進みます。点をタップすると日付・内容・増減額・イベント後残高を確認できます。</div>`;
    grid.insertBefore(card,grid.firstChild);
  }

  function buildModel(){
    const horizon=Number(document.getElementById('forecastHorizon')?.value)||90;
    const f=forecast(horizon);
    const current=Number(state.settings?.cash)||0;
    const points=[{index:0,date:today(),name:'現在残高',amount:0,balance:current,type:'CURRENT'}];
    f.rows.forEach((e,i)=>points.push({index:i+1,date:e.date,name:e.name||'',amount:Number(e.amount)||0,balance:Number(e.balance)||0,type:e.type||'',source:e.source||''}));
    return{horizon,f,current,points,reserve:Number(state.settings?.reserve)||0};
  }

  function renderStats(model){
    const box=document.getElementById('cashflowChartStatsV21');if(!box)return;
    const last=model.points.at(-1),reserve=model.reserve,margin=Number(model.f.low)-reserve;
    const item=(label,value,sub='',klass='')=>`<div><span class="muted">${label}</span><b class="${klass}" style="display:block;font-size:20px;margin-top:5px">${value}</b>${sub?`<div class="tiny">${sub}</div>`:''}</div>`;
    box.innerHTML=[
      item('現在残高',fmtYen(model.current)),
      item(`${model.horizon}日後`,fmtYen(last?.balance??model.current),last?.date||''),
      item('期間内最低',fmtYen(model.f.low),model.f.lowDate,model.f.low<reserve?'bad':''),
      item('安全資金との差',`${margin>=0?'+':''}${fmtYen(margin)}`,`安全資金 ${fmtYen(reserve)}`,margin>=0?'good':'bad')
    ].join('');
  }

  function renderSvg(model){
    const host=document.getElementById('cashflowChartPlotV21');if(!host)return;
    const pts=model.points;
    if(!pts.length){host.innerHTML='<div class="muted">予測データがありません。</div>';return}

    const vals=pts.map(p=>Number(p.balance));
    vals.push(model.reserve);
    let rawMin=Math.min(...vals),rawMax=Math.max(...vals),span=Math.max(1,rawMax-rawMin);
    const pad=Math.max(span*.10,5000),minV=Math.max(0,rawMin-pad),maxV=rawMax+pad;
    const W=1000,H=315,L=78,R=20,T=18,B=50,pw=W-L-R,ph=H-T-B;
    const maxI=Math.max(1,pts.at(-1)?.index||1);
    const x=i=>L+(Number(i)/maxI)*pw;
    const y=v=>T+((maxV-Number(v))/Math.max(1,maxV-minV))*ph;
    const path=pts.map((p,i)=>`${i?'L':'M'}${x(p.index).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    const grid=[];
    for(let i=0;i<=4;i++){
      const yy=T+ph*i/4,val=maxV-(maxV-minV)*i/4;
      grid.push(`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#2b3b5d"/><text x="${L-8}" y="${yy+4}" fill="#9fb0cc" font-size="11" text-anchor="end">${fmtShort(val)}</text>`);
    }
    const reserveY=y(model.reserve);
    const circles=pts.length<=35?pts.map(p=>`<circle cx="${x(p.index)}" cy="${y(p.balance)}" r="3.2" fill="#7dd3fc" opacity=".9"/>`).join(''):'';
    const start=pts[0],end=pts.at(-1);
    host.innerHTML=`
      <svg id="cashflowChartSvgV21" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;touch-action:none" aria-label="資金繰り予測グラフ">
        ${grid.join('')}
        <line x1="${L}" y1="${reserveY}" x2="${W-R}" y2="${reserveY}" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="7 6" opacity=".9"/>
        <text x="${W-R}" y="${reserveY-6}" fill="#fbbf24" font-size="11" text-anchor="end">安全資金 ${fmtShort(model.reserve)}</text>
        <path d="${path}" fill="none" stroke="#7dd3fc" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
        ${circles}
        <text x="${L}" y="${H-15}" fill="#9fb0cc" font-size="11">現在 · ${start.date}</text>
        <text x="${W-R}" y="${H-15}" fill="#9fb0cc" font-size="11" text-anchor="end">#${end.index} · ${end.date}</text>
        <line id="cashflowCrossV21" x1="0" y1="${T}" x2="0" y2="${H-B}" stroke="#eef4ff" stroke-width="1" opacity="0"/>
        <circle id="cashflowDotV21" cx="0" cy="0" r="4.5" fill="#eef4ff" opacity="0"/>
        <rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>
      </svg>
      <div id="cashflowTipV21" class="note hidden" style="position:absolute;pointer-events:none;z-index:5;padding:9px 11px;min-width:220px;max-width:310px;box-shadow:0 6px 22px #0008"></div>`;

    const svg=document.getElementById('cashflowChartSvgV21'),tip=document.getElementById('cashflowTipV21'),cross=document.getElementById('cashflowCrossV21'),dot=document.getElementById('cashflowDotV21');
    const onMove=ev=>{
      const rect=svg.getBoundingClientRect(),px=(ev.clientX-rect.left)/rect.width*W,ratio=Math.max(0,Math.min(1,(px-L)/pw));
      const target=Math.round(ratio*maxI),p=pts.reduce((best,v)=>Math.abs(v.index-target)<Math.abs(best.index-target)?v:best,pts[0]);
      const xx=x(p.index),yy=y(p.balance);
      cross.setAttribute('x1',xx);cross.setAttribute('x2',xx);cross.setAttribute('opacity','1');dot.setAttribute('cx',xx);dot.setAttribute('cy',yy);dot.setAttribute('opacity','1');
      const change=p.index===0?'<span class="muted">開始点</span>':`${p.amount>=0?'<span class="good">':'<span class="bad">'}${fmtSigned(p.amount)}</span>`;
      tip.innerHTML=`<b>${esc21(p.date)} · ${p.index===0?'現在':`イベント #${p.index}`}</b><div style="margin-top:5px">${esc21(p.name)} · ${change}</div>${p.type&&p.index!==0?`<div class="tiny" style="margin-top:3px">${esc21(p.type)}</div>`:''}<div style="display:flex;justify-content:space-between;gap:16px;margin-top:7px"><span>イベント後残高</span><b>${fmtYen(p.balance)}</b></div>`;
      tip.classList.remove('hidden');
      const hr=host.getBoundingClientRect(),screenX=xx/W*hr.width;tip.style.left=`${Math.min(Math.max(4,screenX+8),Math.max(4,hr.width-320))}px`;tip.style.top='8px';
    };
    const hide=()=>{cross.setAttribute('opacity','0');dot.setAttribute('opacity','0');tip.classList.add('hidden')};
    svg.addEventListener('pointermove',onMove);svg.addEventListener('pointerdown',onMove);svg.addEventListener('pointerleave',hide);
  }

  function renderCashflowChart(){
    ensureCashflowChart();
    const model=buildModel();
    const tag=document.getElementById('cashflowChartHorizonV21');if(tag)tag.textContent=`${model.horizon}日予測`;
    const cap=document.getElementById('cashflowChartCaptionV21');if(cap)cap.textContent=`現在＋${model.f.rows.length}予定イベント`;
    renderSvg(model);renderStats(model);
  }

  const previousRender=typeof render==='function'?render:null;
  if(previousRender){
    render=function renderV21(){
      previousRender();
      renderCashflowChart();
    };
  }
  window.renderCashflowChartV21=renderCashflowChart;
  try{renderCashflowChart()}catch(e){console.error('cashflow chart v21',e)}
})();