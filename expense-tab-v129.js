(() => {
  if (window.__expenseTabV129) return;
  window.__expenseTabV129 = true;

  const $ = id => document.getElementById(id);
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};

  let selectedMonth = '';

  function localMonth(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function validMonth(v){return /^\d{4}-\d{2}$/.test(String(v||''))}
  function addMonth(month,delta){
    if(!validMonth(month))return localMonth();
    const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+delta,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function monthLabel(month){
    if(!validMonth(month))return month;
    const [y,m]=month.split('-').map(Number);
    return y+'年'+m+'月';
  }
  function sourceMonths(st){
    const out=[];
    const add=d=>{const m=String(d||'').slice(0,7);if(validMonth(m))out.push(m)};
    (st.purchaseEvents||[]).forEach(x=>add(x.purchase_date));
    (st.cashTransactions||[]).forEach(x=>add(x.date));
    (st.cashExpenses||[]).forEach(x=>add(x.date));
    return out;
  }
  function availableMonths(st=stateNow()){
    const now=localMonth(),src=sourceMonths(st);
    let min=src.length?[...src].sort()[0]:now;
    let max=src.length?[...src].sort().at(-1):now;
    if(max<now)max=now;
    if(min>now)min=now;
    const months=[];
    for(let m=min,guard=0;m<=max&&guard<240;m=addMonth(m,1),guard++)months.push(m);
    return months.reverse();
  }
  function api(){
    return window.householdExpenseAnalyticsV106 || null;
  }
  function summarize(month){
    const a=api();
    return a?.summarize?.(stateNow(),month) || {month,rows:[],totals:{NORMAL:0,SPECIAL:0},normal:[],special:[]};
  }
  function totalOf(s){return Number(s?.totals?.NORMAL||0)+Number(s?.totals?.SPECIAL||0)}
  function pctText(delta,prev){
    if(!prev)return delta===0?'前月比 ±0円':'前月比 '+(delta>0?'+':'')+yen(delta);
    const pct=delta/prev*100;
    return '前月比 '+(delta>0?'+':'')+yen(delta)+' ('+(pct>0?'+':'')+pct.toFixed(1)+'%)';
  }
  function categorySection(scope,label,groups,total,rows){
    const blocks=(groups||[]).map(g=>{
      const key=scope+'|'+g.category;
      const detail=rows.filter(r=>r.scope===scope&&r.category===g.category);
      return '<div style="margin-top:7px">'+
        '<button type="button" class="btn secondary" data-expense-category-toggle="'+esc(key)+'" style="width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left">'+
          '<span><b>'+esc(g.label)+'</b><span class="tiny" style="margin-left:7px">'+g.count+'件</span></span><b>'+yen(g.amount)+'</b>'+
        '</button>'+
        '<div data-expense-category-detail="'+esc(key)+'" style="display:none;padding-left:10px">'+
          detail.map(r=>'<div class="row" style="align-items:flex-start;gap:10px"><div style="min-width:0;flex:1"><b>'+esc(r.name)+'</b><div class="tiny">'+esc(r.date)+' · '+esc(r.source)+'</div></div><b class="amt bad">-'+yen(r.amount)+'</b></div>').join('')+
        '</div>'+
      '</div>';
    }).join('');
    return '<div class="card half"><div class="title">'+esc(label)+'</div><div class="row"><span>合計</span><b class="amt">'+yen(total)+'</b></div>'+(blocks||'<div class="muted" style="padding:10px 0">該当支出なし</div>')+'</div>';
  }
  function rowsTable(rows){
    if(!rows.length)return '<div class="muted" style="padding:12px 0">この月の支出明細はありません。</div>';
    return '<div class="table"><table><thead><tr><th>日付</th><th>カテゴリー</th><th>内容</th><th>支払元</th><th>区分</th><th>金額</th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(api()?.categoryLabel?.(r.category)||r.category||'その他')+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.source)+'</td><td>'+esc(r.scope==='SPECIAL'?'特別費':'通常費')+'</td><td class="bad">-'+yen(r.amount)+'</td></tr>').join('')+
      '</tbody></table></div>';
  }
  function render(month=selectedMonth||localMonth()){
    const root=$('expenseTabRootV129');if(!root)return;
    const months=availableMonths();
    if(!validMonth(month)||!months.includes(month))month=months.includes(localMonth())?localMonth():(months[0]||localMonth());
    selectedMonth=month;

    const s=summarize(month),prevMonth=addMonth(month,-1),prev=summarize(prevMonth);
    const total=totalOf(s),prevTotal=totalOf(prev),delta=total-prevTotal;
    const monthOptions=months.map(m=>'<option value="'+m+'"'+(m===month?' selected':'')+'>'+monthLabel(m)+'</option>').join('');
    const currentIndex=months.indexOf(month);
    const newer=currentIndex>0?months[currentIndex-1]:'';
    const older=currentIndex>=0&&currentIndex<months.length-1?months[currentIndex+1]:'';

    root.innerHTML=
      '<div class="card full">'+
        '<div class="title">月別支出</div>'+
        '<div class="controls" style="flex-wrap:wrap">'+
          '<button class="btn secondary" id="expensePrevMonthV129"'+(older?'':' disabled')+'>← 前月</button>'+
          '<select id="expenseMonthSelectV129" style="min-width:150px">'+monthOptions+'</select>'+
          '<button class="btn secondary" id="expenseNextMonthV129"'+(newer?'':' disabled')+'>翌月 →</button>'+
          '<button class="btn secondary" id="expenseCurrentMonthV129">今月</button>'+
        '</div>'+
        '<div class="tiny" style="margin-top:8px">カード利用・銀行からの直接支出・現金支出を合算。カード引落、ATM引出、口座間振替は二重計上しません。</div>'+
      '</div>'+
      '<div class="card kpi"><span class="muted">'+monthLabel(month)+' 支出合計</span><b>'+yen(total)+'</b><div class="tiny">'+s.rows.length+'件</div></div>'+
      '<div class="card kpi"><span class="muted">通常費</span><b>'+yen(s.totals.NORMAL)+'</b><div class="tiny">'+s.rows.filter(r=>r.scope==='NORMAL').length+'件</div></div>'+
      '<div class="card kpi"><span class="muted">特別費</span><b>'+yen(s.totals.SPECIAL)+'</b><div class="tiny">'+s.rows.filter(r=>r.scope==='SPECIAL').length+'件</div></div>'+
      '<div class="card kpi"><span class="muted">'+monthLabel(prevMonth)+'との比較</span><b class="'+(delta>0?'bad':delta<0?'good':'')+'">'+(delta>0?'+':'')+yen(delta)+'</b><div class="tiny">'+pctText(delta,prevTotal)+'</div></div>'+
      categorySection('NORMAL','通常費・カテゴリー別',s.normal,s.totals.NORMAL,s.rows)+
      categorySection('SPECIAL','特別費・カテゴリー別',s.special,s.totals.SPECIAL,s.rows)+
      '<div class="card full"><div class="title">'+monthLabel(month)+' 支出明細</div>'+rowsTable(s.rows)+'</div>';

    $('expenseMonthSelectV129')?.addEventListener('change',e=>render(e.target.value));
    $('expensePrevMonthV129')?.addEventListener('click',()=>{if(older)render(older)});
    $('expenseNextMonthV129')?.addEventListener('click',()=>{if(newer)render(newer)});
    $('expenseCurrentMonthV129')?.addEventListener('click',()=>render(localMonth()));
    root.querySelectorAll('[data-expense-category-toggle]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const key=btn.dataset.expenseCategoryToggle;
        const detail=[...root.querySelectorAll('[data-expense-category-detail]')].find(x=>x.dataset.expenseCategoryDetail===key);
        if(detail)detail.style.display=detail.style.display==='none'?'block':'none';
      });
    });
  }
  function boot(){
    selectedMonth=localMonth();
    window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='expenses')render(selectedMonth)});
    window.addEventListener('pageshow',()=>{if($('expenses')?.classList.contains('active'))render(selectedMonth)});
    if($('expenses')?.classList.contains('active'))render(selectedMonth);
  }

  window.householdExpenseTabV129={render,availableMonths,addMonth,monthLabel};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();