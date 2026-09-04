(() => {
  const PREF_KEY='householdTreasuryBankChartPrefsV17';
  const LABELS={total:'合計',rakuten:'楽天銀行',yucho:'ゆうちょ',other:'その他銀行'};
  const STYLES={
    total:{stroke:'#eef4ff',width:3.5,opacity:1},
    rakuten:{stroke:'#7dd3fc',width:2,opacity:.9},
    yucho:{stroke:'#6ee7b7',width:2,opacity:.9},
    other:{stroke:'#fbbf24',width:2,opacity:.85}
  };
  let prefs=loadPrefs();

  function loadPrefs(){
    try{const p=JSON.parse(localStorage.getItem(PREF_KEY)||'null')||{};return{range:['30','90','365','all'].includes(String(p.range))?String(p.range):'90',visible:{total:p.visible?.total!==false,rakuten:p.visible?.rakuten!==false,yucho:p.visible?.yucho!==false,other:p.visible?.other!==false}}}catch{return{range:'90',visible:{total:true,rakuten:true,yucho:true,other:true}}}
  }
  function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
  const finite=v=>v!==null&&v!==''&&Number.isFinite(Number(v));
  const fmtYen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const fmtShort=n=>{const v=Math.abs(Number(n)||0),s=Number(n)<0?'-':'';if(v>=1000000)return`${s}${(v/1000000).toFixed(v>=10000000?0:1)}百万円`;if(v>=10000)return`${s}${(v/10000).toFixed(v>=100000?0:1)}万円`;return`${s}${Math.round(v).toLocaleString('ja-JP')}円`};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
  const parseDay=s=>{const d=new Date(`${s}T00:00:00`);return Number.isNaN(d.getTime())?null:d};
  const dateOnly=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

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
  function terminalBalance(items){
    if(items.length===1)return Number(items[0].balance_after);
    const starts=new Set(items.map(t=>Number(t.balance_after)-Number(t.amount||0)));
    const terminals=items.filter(t=>!starts.has(Number(t.balance_after)));
    const pick=terminals.length===1?terminals[0]:items[items.length-1];
    return Number(pick.balance_after);
  }
  function buildModel(){
    const state=window.getTreasuryState?.()||{};
    const groups={rakuten:new Map(),yucho:new Map(),other:new Map()};
    const seen=new Set(),aliases={rakuten:new Set(),yucho:new Set(),other:new Set()};
    let duplicates=0,ignored=0;
    for(const t of state.cashTransactions||[]){
      if(!t?.date||!finite(t.balance_after))continue;
      const k=institutionKey(t.source);if(!k){ignored++;continue}
      aliases[k].add(String(t.source||''));
      const sig=txSignature(t,k);if(seen.has(sig)){duplicates++;continue}seen.add(sig);
      if(!groups[k].has(t.date))groups[k].set(t.date,[]);groups[k].get(t.date).push(t);
    }
    const inst={rakuten:[],yucho:[],other:[]};
    for(const k of Object.keys(inst))inst[k]=[...groups[k].entries()].map(([date,items])=>({date,value:terminalBalance(items)})).filter(x=>finite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));
    if(!inst.rakuten.length&&finite(state.sources?.rakutenBank?.latestBalance)&&state.sources?.rakutenBank?.sourceAsOf)inst.rakuten.push({date:String(state.sources.rakutenBank.sourceAsOf),value:Number(state.sources.rakutenBank.latestBalance),snapshot:true});
    if(!inst.yucho.length&&finite(state.sources?.yucho?.latestBalance)&&state.sources?.yucho?.sourceAsOf)inst.yucho.push({date:String(state.sources.yucho.sourceAsOf),value:Number(state.sources.yucho.latestBalance),snapshot:true});
    const active=Object.entries(inst).filter(([,s])=>s.length);
    let total=[];
    if(active.length){
      const coverageStart=active.map(([,s])=>s[0].date).sort().at(-1);
      const dates=[...new Set(active.flatMap(([,s])=>s.map(p=>p.date)).filter(d=>d>=coverageStart))].sort();
      total=dates.map(date=>{let value=0;for(const[,s]of active){const p=carryAt(s,date);if(!p)return null;value+=Number(p.value)}return{date,value}}).filter(Boolean);
    }
    return{state,...inst,total,duplicates,ignored,aliases};
  }
  function carryAt(series,date){let p=null;for(const x of series){if(x.date<=date)p=x;else break}return p}
  function latestBreakdown(model){
    if(!model.total.length)return null;const date=model.total.at(-1).date,parts=[];let sum=0;
    for(const k of['rakuten','yucho','other']){const p=carryAt(model[k],date);if(!p)continue;parts.push({k,value:Number(p.value),date:p.date});sum+=Number(p.value)}
    return{date,sum,parts,total:Number(model.total.at(-1).value)};
  }
  function rangeStart(latest){if(prefs.range==='all')return null;const d=parseDay(latest);if(!d)return null;d.setDate(d.getDate()-(Number(prefs.range)-1));return dateOnly(d)}
  function filtered(model){const latest=[...model.total,...model.rakuten,...model.yucho,...model.other].map(x=>x.date).sort().at(-1);if(!latest)return{total:[],rakuten:[],yucho:[],other:[]};const start=rangeStart(latest),out={};for(const k of['total','rakuten','yucho','other'])out[k]=model[k].filter(p=>!start||p.date>=start);return out}

  function ensureUi(){
    const old=document.getElementById('bankHistoryChartCard');if(old)old.remove();
    if(document.getElementById('bankHistoryChartCardV17'))return;
    const grid=document.querySelector('#dashboard .grid');if(!grid)return;
    const card=document.createElement('div');card.className='card full';card.id='bankHistoryChartCardV17';
    card.innerHTML=`<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">銀行残高推移</div><div class="tiny" id="bankChartCoverageV17"></div></div><div class="controls" id="bankChartRangesV17" style="flex-wrap:wrap"></div></div><div class="controls" id="bankChartLegendV17" style="margin:10px 0 4px;flex-wrap:wrap"></div><div id="bankChartAuditV17" class="note" style="margin:8px 0"></div><div id="bankChartPlotV17" style="position:relative;min-height:250px"></div><div id="bankChartStatsV17" class="form" style="margin-top:10px"></div><div class="tiny" style="margin-top:8px">白線は合計です。合計は各金融機関の履歴が揃う日以降だけ算出します。口座別には分割していません。</div>`;
    grid.insertBefore(card,grid.firstChild);
  }
  function renderControls(model){
    const r=document.getElementById('bankChartRangesV17'),l=document.getElementById('bankChartLegendV17');if(!r||!l)return;
    r.innerHTML=[['30','30日'],['90','90日'],['365','1年'],['all','全期間']].map(([v,n])=>`<button class="btn ${prefs.range===v?'':'secondary'}" data-range="${v}">${n}</button>`).join('');r.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{prefs.range=b.dataset.range;savePrefs();renderChart()});
    l.innerHTML=['total','rakuten','yucho','other'].map(k=>`<button class="btn ${prefs.visible[k]&&model[k].length?'':'secondary'}" data-series="${k}" ${model[k].length?'':'disabled'}><span style="display:inline-block;width:18px;height:3px;background:${STYLES[k].stroke};vertical-align:middle;margin-right:6px"></span>${LABELS[k]}</button>`).join('');l.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{const k=b.dataset.series;prefs.visible[k]=!prefs.visible[k];savePrefs();renderChart()});
  }
  function renderAudit(model){
    const box=document.getElementById('bankChartAuditV17');if(!box)return;const b=latestBreakdown(model);
    if(!b){box.innerHTML='銀行残高履歴がまだありません。';return}
    const formula=b.parts.map(p=>`${LABELS[p.k]} ${fmtYen(p.value)}`).join(' + ');
    const dashboard=Number(model.state?.settings?.cash)||0,diff=b.total-dashboard;
    const aliasNotes=['rakuten','yucho','other'].flatMap(k=>model.aliases[k].size>1?[`${LABELS[k]}表記: ${[...model.aliases[k]].join(' / ')}`]:[]);
    box.innerHTML=`<b>最新合計の内訳</b><br>${fmtYen(b.total)} = ${formula}<div class="tiny" style="margin-top:5px">${b.date} 時点${model.duplicates?` · 完全一致の重複候補 ${model.duplicates}件をグラフ上で除外`:''}</div>${Math.abs(diff)>1?`<div class="warn" style="margin-top:6px">Dashboardの銀行合計 ${fmtYen(dashboard)} と ${fmtYen(diff)} ずれています。元データは削除せず監査中です。</div>`:''}${aliasNotes.length?`<div class="warn" style="margin-top:6px">旧表記を検出: ${aliasNotes.join(' / ')}</div>`:''}`;
  }
  function shiftDate(date,days){const d=parseDay(date);if(!d)return'';d.setDate(d.getDate()+days);return dateOnly(d)}
  function diffAt(series,days){if(!series.length)return null;const last=series.at(-1),old=carryAt(series,shiftDate(last.date,-days));return old?last.value-old.value:null}
  function renderStats(total){const box=document.getElementById('bankChartStatsV17');if(!box)return;if(!total.length){box.innerHTML='';return}const last=total.at(-1),d7=diffAt(total,7),d30=diffAt(total,30),vals=total.map(x=>x.value),low=Math.min(...vals),high=Math.max(...vals),item=(n,v,c='')=>`<div><span class="muted">${n}</span><b class="${c}" style="display:block;font-size:20px;margin-top:5px">${v}</b></div>`,fd=d=>d===null?'—':`${d>=0?'+':''}${fmtYen(d)}`;box.innerHTML=[item('最新合計',fmtYen(last.value)),item('7日前比',fd(d7),d7===null?'':d7>=0?'good':'bad'),item('30日前比',fd(d30),d30===null?'':d30>=0?'good':'bad'),item('期間内 底値 / 高値',`${fmtYen(low)} / ${fmtYen(high)}`)].join('')}
  function renderSvg(m){
    const host=document.getElementById('bankChartPlotV17');if(!host)return;const keys=['total','rakuten','yucho','other'].filter(k=>prefs.visible[k]&&m[k].length),all=keys.flatMap(k=>m[k]);if(!all.length){host.innerHTML='<div class="muted">表示する履歴がありません。</div>';return}
    const dates=all.map(p=>p.date).sort(),minDate=dates[0],maxDate=dates.at(-1),minT=parseDay(minDate).getTime(),maxT=parseDay(maxDate).getTime(),vals=all.map(p=>Number(p.value)),rawMin=Math.min(...vals),rawMax=Math.max(...vals),span=Math.max(1,rawMax-rawMin),minV=Math.max(0,rawMin-span*.08),maxV=rawMax+span*.08;
    const W=1000,H=300,L=76,R=18,T=18,B=42,pw=W-L-R,ph=H-T-B,x=p=>L+((parseDay(p.date).getTime()-minT)/Math.max(1,maxT-minT))*pw,y=v=>T+((maxV-Number(v))/Math.max(1,maxV-minV))*ph;
    const stepPath=s=>{if(!s.length)return'';let d=`M${x(s[0]).toFixed(1)},${y(s[0].value).toFixed(1)}`;for(let i=1;i<s.length;i++){d+=` H${x(s[i]).toFixed(1)} V${y(s[i].value).toFixed(1)}`}return d};
    const grid=[];for(let i=0;i<=4;i++){const yy=T+ph*i/4,val=maxV-(maxV-minV)*i/4;grid.push(`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#2b3b5d"/><text x="${L-8}" y="${yy+4}" fill="#9fb0cc" font-size="11" text-anchor="end">${fmtShort(val)}</text>`)}
    const paths=keys.map(k=>`<path d="${stepPath(m[k])}" fill="none" stroke="${STYLES[k].stroke}" stroke-width="${STYLES[k].width}" opacity="${STYLES[k].opacity}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`).join('');
    host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid.join('')}${paths}<text x="${L}" y="${H-12}" fill="#9fb0cc" font-size="11">${minDate}</text><text x="${W-R}" y="${H-12}" fill="#9fb0cc" font-size="11" text-anchor="end">${maxDate}</text></svg>`;
  }
  function renderChart(){ensureUi();const model=buildModel(),m=filtered(model);renderControls(model);renderAudit(model);renderSvg(m);renderStats(m.total);const c=document.getElementById('bankChartCoverageV17');if(c){const active=['rakuten','yucho','other'].filter(k=>model[k].length).map(k=>LABELS[k]);c.textContent=active.length?`${active.join('・')}の残高履歴から算出`:'銀行CSVを取り込むと履歴を表示します。'}}

  const prev=typeof render==='function'?render:null;if(prev)render=function renderV17(){prev();renderChart()};window.renderBankChart=renderChart;try{renderChart()}catch(e){console.error('bank chart v17',e)}
})();