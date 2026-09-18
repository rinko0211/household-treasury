(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  if (root.__assetChartV100) return;
  root.__assetChartV100 = true;

  const CARD_ID = 'assetHistoryChartV100';
  const finite = v => v !== null && v !== '' && Number.isFinite(Number(v));
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const short = n => {
    const v=Math.abs(Number(n)||0), s=Number(n)<0?'-':'';
    if(v>=1000000)return `${s}${(v/1000000).toFixed(v>=10000000?0:1)}百万円`;
    if(v>=10000)return `${s}${(v/10000).toFixed(v>=100000?0:1)}万円`;
    return `${s}${Math.round(v).toLocaleString('ja-JP')}円`;
  };

  function stateNow(){
    try { return (root.getTreasuryStateRaw || root.getTreasuryState)?.() || {}; }
    catch { return {}; }
  }

  function buildModel(inputState){
    const st = inputState || stateNow();
    const raw = Array.isArray(st.assetSnapshots) ? st.assetSnapshots : [];
    const byDate = new Map();

    raw.forEach((snap,index)=>{
      const date=String(snap?.snapshot_date||snap?.date||'').slice(0,10);
      const total=finite(snap?.market_value) ? Number(snap.market_value) : null;
      const holdings=finite(snap?.invested_market_value) ? Number(snap.invested_market_value) : null;
      const cash=finite(snap?.cash_balance) ? Number(snap.cash_balance) : null;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || (total===null && holdings===null && cash===null)) return;
      byDate.set(date,{
        date,
        total,
        holdings,
        cash,
        institution:String(snap?.institution||''),
        sourceFile:String(snap?.source_file||''),
        parserVersion:Number(snap?.parser_version)||0,
        __index:index
      });
    });

    const points=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.__index-b.__index);
    const latest=points.at(-1)||null;
    const first=points[0]||null;
    return {
      points,
      latest,
      first,
      totalChange: latest&&first&&finite(latest.total)&&finite(first.total) ? latest.total-first.total : null
    };
  }

  function ensureUi(){
    if(typeof document==='undefined') return null;
    let card=document.getElementById(CARD_ID);
    if(card) return card;
    const wealth=document.getElementById('wealth');
    if(!wealth) return null;
    card=document.createElement('div');
    card.id=CARD_ID;
    card.className='card';
    card.style.marginBottom='12px';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div class="title" style="margin-bottom:3px">投資資産推移 <span class="tag">v100</span></div>
          <div class="tiny">楽天証券の資産残高CSVを読み込むと自動で履歴化します。手動スナップショットは不要です。</div>
        </div>
      </div>
      <div id="assetChartSummaryV100" class="form" style="margin-top:12px"></div>
      <div id="assetChartLegendV100" class="controls" style="margin:10px 0 4px;flex-wrap:wrap"></div>
      <div id="assetChartPlotV100" style="position:relative;min-height:270px"></div>
      <div id="assetChartCoverageV100" class="tiny" style="margin-top:8px"></div>`;
    wealth.prepend(card);
    return card;
  }

  function renderSummary(model){
    const host=document.getElementById('assetChartSummaryV100');
    if(!host) return;
    if(!model.latest){
      host.innerHTML='';
      return;
    }
    const latest=model.latest;
    const change=model.totalChange;
    const cell=(label,value,cls='')=>`<div><span class="muted">${label}</span><b class="${cls}" style="display:block;font-size:20px;margin-top:5px">${value}</b></div>`;
    host.innerHTML=[
      cell('最新 資産合計',finite(latest.total)?yen(latest.total):'—'),
      cell('保有商品',finite(latest.holdings)?yen(latest.holdings):'—'),
      cell('預り金',finite(latest.cash)?yen(latest.cash):'—'),
      cell('初回比',change===null?'—':`${change>=0?'+':''}${yen(change)}`,change===null?'':change>=0?'good':'bad')
    ].join('');
  }

  function renderLegend(model){
    const host=document.getElementById('assetChartLegendV100');
    if(!host) return;
    const hasTotal=model.points.some(p=>finite(p.total));
    const hasHoldings=model.points.some(p=>finite(p.holdings));
    const hasCash=model.points.some(p=>finite(p.cash));
    const item=(label,stroke,enabled)=>enabled?`<span class="pill" style="padding:5px 9px"><span style="display:inline-block;width:18px;height:3px;background:${stroke};vertical-align:middle;margin-right:6px"></span>${label}</span>`:'';
    host.innerHTML=[
      item('資産合計','#eef4ff',hasTotal),
      item('保有商品','#7dd3fc',hasHoldings),
      item('預り金','#6ee7b7',hasCash)
    ].join('');
  }

  function renderPlot(model){
    const host=document.getElementById('assetChartPlotV100');
    if(!host) return;
    if(!model.points.length){
      host.innerHTML='<div class="muted" style="padding:22px 0">資産残高CSVを読み込むと、ここに資産推移が表示されます。</div>';
      return;
    }

    const W=1000,H=310,L=76,R=18,T=18,B=48,pw=W-L-R,ph=H-T-B;
    const series=[
      {key:'total',stroke:'#eef4ff',width:3.5},
      {key:'holdings',stroke:'#7dd3fc',width:2.2},
      {key:'cash',stroke:'#6ee7b7',width:2.2}
    ].map(s=>({...s,points:model.points.map((p,index)=>({index,date:p.date,value:p[s.key]})).filter(p=>finite(p.value))}))
      .filter(s=>s.points.length);

    const values=series.flatMap(s=>s.points.map(p=>Number(p.value)));
    if(!values.length){
      host.innerHTML='<div class="muted">表示できる資産値がありません。</div>';
      return;
    }

    const lo=Math.min(...values),hi=Math.max(...values);
    const span=Math.max(1,hi-lo);
    const pad=Math.max(span*0.12,Math.abs(hi)*0.03,1000);
    const minV=Math.max(0,lo-pad),maxV=Math.max(minV+1,hi+pad);
    const maxIndex=Math.max(1,model.points.length-1);
    const x=i=>L+(i/maxIndex)*pw;
    const y=v=>T+((maxV-Number(v))/Math.max(1,maxV-minV))*ph;
    const grid=[];
    for(let i=0;i<=4;i++){
      const yy=T+ph*i/4,val=maxV-(maxV-minV)*i/4;
      grid.push(`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#2b3b5d"/><text x="${L-8}" y="${yy+4}" fill="#9fb0cc" font-size="11" text-anchor="end">${short(val)}</text>`);
    }
    const paths=series.map(s=>{
      if(s.points.length===1){
        const p=s.points[0];
        return `<circle cx="${x(p.index)}" cy="${y(p.value)}" r="5" fill="${s.stroke}"><title>${p.date} ${yen(p.value)}</title></circle>`;
      }
      const d=s.points.map((p,i)=>`${i?'L':'M'}${x(p.index).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
      const dots=s.points.map(p=>`<circle cx="${x(p.index)}" cy="${y(p.value)}" r="3.3" fill="${s.stroke}"><title>${p.date} ${yen(p.value)}</title></circle>`).join('');
      return `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    }).join('');

    const first=model.points[0],last=model.points.at(-1);
    host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid.join('')}${paths}<text x="${L}" y="${H-15}" fill="#9fb0cc" font-size="11">${first.date}</text><text x="${W-R}" y="${H-15}" fill="#9fb0cc" font-size="11" text-anchor="end">${last.date}</text></svg>`;
  }

  function renderAssetChart(){
    if(typeof document==='undefined') return buildModel();
    ensureUi();
    const model=buildModel();
    renderSummary(model);
    renderLegend(model);
    renderPlot(model);
    const coverage=document.getElementById('assetChartCoverageV100');
    if(coverage){
      coverage.textContent=model.points.length
        ? `${model.points.length}日分の資産スナップショット · 最新 ${model.latest.date}`
        : '楽天証券 assetbalance(all) CSV の取込履歴を表示します。';
    }
    return model;
  }

  root.householdAssetChartV100={buildModel,render:renderAssetChart};

  if(typeof module!=='undefined' && module.exports) module.exports={buildModel};

  if(typeof document!=='undefined'){
    const prev=typeof root.render==='function' ? root.render : (typeof render==='function'?render:null);
    if(prev && !root.__assetChartRenderWrapV100){
      root.__assetChartRenderWrapV100=true;
      root.render=function renderWithAssetChartV100(){
        const out=prev.apply(this,arguments);
        try{renderAssetChart()}catch(e){console.error('asset chart v100',e)}
        return out;
      };
      try{render= root.render}catch{}
    }
    const boot=()=>{try{renderAssetChart()}catch(e){console.error('asset chart v100',e)}};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
    else setTimeout(boot,0);
    root.addEventListener?.('treasury:pagechange',e=>{if(e?.detail?.page==='wealth')boot()});
    root.addEventListener?.('pageshow',boot);
  }
})();