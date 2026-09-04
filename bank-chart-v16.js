(() => {
  const PREF_KEY='householdTreasuryBankChartPrefs';
  const LABELS={total:'合計',rakuten:'楽天銀行',yucho:'ゆうちょ',other:'その他銀行'};
  const STYLES={
    total:{stroke:'#eef4ff',width:3.5,opacity:1},
    rakuten:{stroke:'#7dd3fc',width:2,opacity:.88},
    yucho:{stroke:'#6ee7b7',width:2,opacity:.88},
    other:{stroke:'#fbbf24',width:2,opacity:.82}
  };
  let prefs=loadPrefs();

  function loadPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem(PREF_KEY)||'null')||{};
      return {
        range:['30','90','365','all'].includes(String(p.range))?String(p.range):'90',
        visible:{total:p.visible?.total!==false,rakuten:p.visible?.rakuten!==false,yucho:p.visible?.yucho!==false,other:p.visible?.other!==false}
      };
    }catch{return{range:'90',visible:{total:true,rakuten:true,yucho:true,other:true}}}
  }
  function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
  const fmtYen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const fmtShort=n=>{
    const v=Math.abs(Number(n)||0),s=Number(n)<0?'-':'';
    if(v>=1000000)return `${s}${(v/1000000).toFixed(v>=10000000?0:1)}百万円`;
    if(v>=10000)return `${s}${(v/10000).toFixed(v>=100000?0:1)}万円`;
    return `${s}${Math.round(v).toLocaleString('ja-JP')}円`;
  };
  const finite=v=>v!==null&&v!==''&&Number.isFinite(Number(v));
  const parseDay=s=>{const d=new Date(`${s}T00:00:00`);return Number.isNaN(d.getTime())?null:d};
  const dateOnly=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  function seriesKey(source){
    if(source==='Rakuten Bank')return'rakuten';
    if(source==='Yucho')return'yucho';
    return'other';
  }
  function terminalBalance(dayItems){
    if(dayItems.length===1)return Number(dayItems[0].balance_after);
    const starts=new Set(dayItems.map(t=>Number(t.balance_after)-Number(t.amount||0)));
    const terminals=dayItems.filter(t=>!starts.has(Number(t.balance_after)));
    const pick=terminals.length===1?terminals[0]:dayItems[dayItems.length-1];
    return Number(pick.balance_after);
  }
  function buildInstitutionSeries(state){
    const groups={rakuten:new Map(),yucho:new Map(),other:new Map()};
    for(const t of state.cashTransactions||[]){
      if(!t?.date||!finite(t.balance_after))continue;
      const k=seriesKey(t.source),m=groups[k];
      if(!m.has(t.date))m.set(t.date,[]);
      m.get(t.date).push(t);
    }
    const out={rakuten:[],yucho:[],other:[]};
    for(const k of Object.keys(out)){
      out[k]=[...groups[k].entries()].map(([date,items])=>({date,value:terminalBalance(items)})).filter(x=>finite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));
    }

    // Legacy/current snapshots are used only when no balance-aware transaction history exists.
    if(!out.rakuten.length&&finite(state.sources?.rakutenBank?.latestBalance)&&state.sources?.rakutenBank?.sourceAsOf){
      out.rakuten.push({date:String(state.sources.rakutenBank.sourceAsOf),value:Number(state.sources.rakutenBank.latestBalance),snapshot:true});
    }
    if(!out.yucho.length&&finite(state.sources?.yucho?.latestBalance)&&state.sources?.yucho?.sourceAsOf){
      out.yucho.push({date:String(state.sources.yucho.sourceAsOf),value:Number(state.sources.yucho.latestBalance),snapshot:true});
    }
    return out;
  }
  function carryAt(series,date){
    let found=null;
    for(const p of series){if(p.date<=date)found=p;else break}
    return found?.value??null;
  }
  function buildTotal(inst){
    const active=Object.entries(inst).filter(([,s])=>s.length);
    if(!active.length)return[];
    const coverageStart=active.map(([,s])=>s[0].date).sort().at(-1);
    const dates=[...new Set(active.flatMap(([,s])=>s.map(p=>p.date)).filter(d=>d>=coverageStart))].sort();
    return dates.map(date=>{
      let total=0;
      for(const[,s]of active){const v=carryAt(s,date);if(!finite(v))return null;total+=Number(v)}
      return{date,value:total};
    }).filter(Boolean);
  }
  function dataModel(){
    const state=window.getTreasuryState?.()||{};
    const inst=buildInstitutionSeries(state);
    return{...inst,total:buildTotal(inst)};
  }
  function rangeStart(latestDate){
    if(prefs.range==='all')return null;
    const d=parseDay(latestDate);if(!d)return null;
    d.setDate(d.getDate()-(Number(prefs.range)-1));
    return dateOnly(d);
  }
  function filteredModel(model){
    const latest=[...model.total,...model.rakuten,...model.yucho,...model.other].map(x=>x.date).sort().at(-1);
    if(!latest)return{model:{total:[],rakuten:[],yucho:[],other:[]},latest:null,start:null};
    const start=rangeStart(latest);
    const m={};
    for(const k of['total','rakuten','yucho','other'])m[k]=model[k].filter(p=>!start||p.date>=start);
    return{model:m,latest,start};
  }

  function ensureUi(){
    if(document.getElementById('bankHistoryChartCard'))return;
    const grid=document.querySelector('#dashboard .grid');if(!grid)return;
    const card=document.createElement('div');
    card.className='card full';card.id='bankHistoryChartCard';
    card.innerHTML=`
      <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
        <div><div class="title" style="margin-bottom:3px">銀行残高推移</div><div class="tiny" id="bankChartCoverage">銀行CSVの取引後残高から日次終値を復元</div></div>
        <div class="controls" id="bankChartRanges" style="flex-wrap:wrap"></div>
      </div>
      <div class="controls" id="bankChartLegend" style="margin:10px 0 4px;flex-wrap:wrap"></div>
      <div id="bankChartPlot" style="position:relative;min-height:250px"></div>
      <div id="bankChartStats" class="form" style="margin-top:10px"></div>
      <div class="tiny" style="margin-top:8px">合計は、表示対象の金融機関すべてで残高履歴が揃う日以降だけ算出します。口座別には分割していません。</div>`;
    grid.insertBefore(card,grid.firstChild);
  }
  function renderControls(model){
    const ranges=document.getElementById('bankChartRanges'),legend=document.getElementById('bankChartLegend');if(!ranges||!legend)return;
    ranges.innerHTML=[['30','30日'],['90','90日'],['365','1年'],['all','全期間']].map(([v,l])=>`<button class="btn ${prefs.range===v?'':'secondary'}" data-bank-range="${v}">${l}</button>`).join('');
    ranges.querySelectorAll('[data-bank-range]').forEach(b=>b.onclick=()=>{prefs.range=b.dataset.bankRange;savePrefs();renderBankChart()});
    legend.innerHTML=['total','rakuten','yucho','other'].map(k=>{
      const has=model[k]?.length;
      return `<button class="btn ${prefs.visible[k]&&has?'':'secondary'}" data-bank-series="${k}" ${has?'':'disabled'} style="display:flex;align-items:center;gap:7px"><span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${STYLES[k].stroke};opacity:${has?1:.35}"></span>${LABELS[k]}</button>`;
    }).join('');
    legend.querySelectorAll('[data-bank-series]').forEach(b=>b.onclick=()=>{const k=b.dataset.bankSeries;prefs.visible[k]=!prefs.visible[k];savePrefs();renderBankChart()});
  }
  function closestOnOrBefore(series,targetDate){
    let p=null;for(const x of series){if(x.date<=targetDate)p=x;else break}return p;
  }
  function shiftDate(date,days){const d=parseDay(date);if(!d)return'';d.setDate(d.getDate()+days);return dateOnly(d)}
  function statDiff(series,days){
    if(!series.length)return null;const last=series.at(-1),old=closestOnOrBefore(series,shiftDate(last.date,-days));if(!old)return null;return last.value-old.value;
  }
  function renderStats(total){
    const box=document.getElementById('bankChartStats');if(!box)return;
    if(!total.length){box.innerHTML='<div class="muted">合計履歴がまだありません。</div>';return}
    const latest=total.at(-1),d7=statDiff(total,7),d30=statDiff(total,30),vals=total.map(x=>x.value),low=Math.min(...vals),high=Math.max(...vals);
    const item=(label,value,sub='',klass='')=>`<div><span class="muted">${label}</span><b class="${klass}" style="display:block;font-size:20px;margin-top:5px">${value}</b>${sub?`<div class="tiny">${sub}</div>`:''}</div>`;
    const diff=(d)=>d===null?'—':`${d>=0?'+':''}${fmtYen(d)}`;
    box.innerHTML=[
      item('最新合計',fmtYen(latest.value),`${latest.date} 時点`),
      item('7日前比',diff(d7),'取引日の直近値と比較',d7===null?'':d7>=0?'good':'bad'),
      item('30日前比',diff(d30),'取引日の直近値と比較',d30===null?'':d30>=0?'good':'bad'),
      item('期間内 底値 / 高値',`${fmtYen(low)} / ${fmtYen(high)}`)
    ].join('');
  }

  function renderSvg(m){
    const host=document.getElementById('bankChartPlot');if(!host)return;
    const visibleKeys=['total','rakuten','yucho','other'].filter(k=>prefs.visible[k]&&m[k]?.length);
    const points=visibleKeys.flatMap(k=>m[k]);
    if(!points.length){host.innerHTML='<div class="note">銀行残高履歴がまだありません。楽天銀行・ゆうちょCSVを取り込むとここに表示します。</div>';return}
    const dates=points.map(p=>p.date).sort(),minDate=dates[0],maxDate=dates.at(-1),minT=parseDay(minDate)?.getTime()||0,maxT=parseDay(maxDate)?.getTime()||minT+86400000;
    const vals=points.map(p=>Number(p.value)),rawMin=Math.min(...vals),rawMax=Math.max(...vals),span=Math.max(1,rawMax-rawMin),pad=span*.08,minV=Math.max(0,rawMin-pad),maxV=rawMax+pad;
    const W=1000,H=300,L=76,R=18,T=18,B=42,plotW=W-L-R,plotH=H-T-B;
    const x=p=>L+((parseDay(p.date)?.getTime()||minT)-minT)/Math.max(1,maxT-minT)*plotW;
    const y=v=>T+(maxV-Number(v))/Math.max(1,maxV-minV)*plotH;
    const pathFor=series=>series.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const grid=[];for(let i=0;i<=4;i++){const yy=T+plotH*i/4,val=maxV-(maxV-minV)*i/4;grid.push(`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#2b3b5d" stroke-width="1"/><text x="${L-8}" y="${yy+4}" fill="#9fb0cc" font-size="11" text-anchor="end">${fmtShort(val)}</text>`)}
    const xLabels=[minDate,maxDate===minDate?'':maxDate].filter(Boolean).map((d,i,a)=>`<text x="${i===0?L:W-R}" y="${H-12}" fill="#9fb0cc" font-size="11" text-anchor="${i===0?'start':'end'}">${d}</text>`).join('');
    const paths=visibleKeys.map(k=>{
      const s=m[k],st=STYLES[k];
      const dots=s.length===1?`<circle cx="${x(s[0])}" cy="${y(s[0].value)}" r="4" fill="${st.stroke}"/>`:'';
      return `<path d="${pathFor(s)}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}" opacity="${st.opacity}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    }).join('');
    host.innerHTML=`<svg id="bankChartSvg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;touch-action:none" aria-label="銀行残高推移グラフ">${grid.join('')}${paths}${xLabels}<line id="bankChartCrosshair" x1="0" y1="${T}" x2="0" y2="${H-B}" stroke="#eef4ff" stroke-width="1" opacity="0"/><circle id="bankChartPoint" cx="0" cy="0" r="4" fill="#eef4ff" opacity="0"/><rect x="${L}" y="${T}" width="${plotW}" height="${plotH}" fill="transparent" data-hit="1"/></svg><div id="bankChartTip" class="note hidden" style="position:absolute;pointer-events:none;z-index:3;padding:8px 10px;min-width:145px;box-shadow:0 6px 22px #0008"></div>`;
    const svg=document.getElementById('bankChartSvg'),tip=document.getElementById('bankChartTip'),cross=document.getElementById('bankChartCrosshair'),dot=document.getElementById('bankChartPoint');
    const allDates=[...new Set(visibleKeys.flatMap(k=>m[k].map(p=>p.date)))].sort();
    const nearestDate=targetT=>allDates.reduce((best,d)=>Math.abs((parseDay(d)?.getTime()||0)-targetT)<Math.abs((parseDay(best)?.getTime()||0)-targetT)?d:best,allDates[0]);
    const onMove=ev=>{
      const rect=svg.getBoundingClientRect(),px=(ev.clientX-rect.left)/rect.width*W,ratio=Math.max(0,Math.min(1,(px-L)/plotW)),targetT=minT+ratio*(maxT-minT),date=nearestDate(targetT),xx=x({date});
      const lines=[];let totalPoint=null;
      for(const k of visibleKeys){const p=closestOnOrBefore(m[k],date);if(!p)continue;lines.push(`<div style="display:flex;justify-content:space-between;gap:14px"><span>${LABELS[k]}</span><b>${fmtYen(p.value)}</b></div>`);if(k==='total')totalPoint=p}
      cross.setAttribute('x1',xx);cross.setAttribute('x2',xx);cross.setAttribute('opacity','1');
      if(totalPoint){dot.setAttribute('cx',xx);dot.setAttribute('cy',y(totalPoint.value));dot.setAttribute('opacity','1')}else dot.setAttribute('opacity','0');
      tip.innerHTML=`<b>${date}</b>${lines.join('')}`;tip.classList.remove('hidden');
      const hostRect=host.getBoundingClientRect(),screenX=xx/W*hostRect.width;tip.style.left=`${Math.min(hostRect.width-170,Math.max(4,screenX+8))}px`;tip.style.top='8px';
    };
    const onLeave=()=>{cross.setAttribute('opacity','0');dot.setAttribute('opacity','0');tip.classList.add('hidden')};
    svg.addEventListener('pointermove',onMove);svg.addEventListener('pointerdown',onMove);svg.addEventListener('pointerleave',onLeave);
  }

  function renderBankChart(){
    ensureUi();const full=dataModel(),f=filteredModel(full);renderControls(full);renderSvg(f.model);renderStats(f.model.total);
    const coverage=document.getElementById('bankChartCoverage');
    if(coverage){const active=['rakuten','yucho','other'].filter(k=>full[k].length).map(k=>LABELS[k]);coverage.textContent=active.length?`${active.join('・')}のCSV残高履歴から算出`:'銀行CSVを取り込むと履歴を表示します。'}
  }

  const previousRender=typeof render==='function'?render:null;
  if(previousRender){render=function renderWithBankChart(){previousRender();renderBankChart()}}
  window.renderBankChart=renderBankChart;
  try{renderBankChart()}catch(e){console.error('bank chart',e)}
})();