(() => {
'use strict';
function monthlyTreasuryCalculate(st,selectedMonth,basis,referenceDate){
  const validMonth=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s||''));
  const addMonth=(m,n)=>{const a=String(m).split('-').map(Number),d=new Date(a[0],a[1]-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
  const lastDay=m=>{const a=String(m).split('-').map(Number);return new Date(a[0],a[1],0).getDate()};
  const dateOf=(m,day)=>m+'-'+String(Math.min(lastDay(m),Math.max(1,Number(day)||1))).padStart(2,'0');
  const dayDiff=(a,b)=>Math.abs(Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/86400000));
  const ref=String(referenceDate||'').slice(0,10);
  const month=validMonth(selectedMonth)?selectedMonth:ref.slice(0,7);
  const salaryDay=Math.max(1,Math.min(28,Number(st?.settings?.salaryDay)||18));
  const start=basis==='calendar'?month+'-01':dateOf(month,salaryDay);
  const end=basis==='calendar'?dateOf(month,31):dateOf(addMonth(month,1),salaryDay-1);
  const within=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&d>=start&&d<=end;
  const tidy=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）\-_/・.]/g,'').toUpperCase();
  const cashType=t=>String(t?.cashflow_type||t?.category||'').normalize('NFKC').toUpperCase();
  const econType=t=>String(t?.economic_type||'').toUpperCase();
  const transfer=t=>{
    const cf=cashType(t);
    if(['CARD_SETTLEMENT','DEBT_PRINCIPAL','DEBT_INTEREST','DEBT_PAYMENT','INVESTMENT_CONTRIBUTION'].includes(cf))return false;
    return t?.is_transfer===true||econType(t)==='TRANSFER'||['TRANSFER','INTERNAL_TRANSFER','CASH_WITHDRAWAL','CASH_WITHDRAWAL_UNCLASSIFIED','ATM_WITHDRAWAL','BROKER_TRANSFER'].includes(cf);
  };
  const isSalary=t=>/^(INCOME_SALARY|SALARY)$/.test(cashType(t))||/給与|俸給|SALARY/i.test(String(t?.description_raw||t?.description||''));
  const isBonus=t=>/^(INCOME_BONUS|BONUS)$/.test(cashType(t))||/賞与|ボーナス|期末勤勉/.test(String(t?.description_raw||t?.description||''));
  const actual=[],pending=[],warnings=[],bankInRange=[];
  const add=(list,date,label,amount,kind,source)=>{if(!within(date)||!Number.isFinite(Number(amount))||Number(amount)===0)return;list.push({date,label:String(label||'未分類'),amount:Number(amount),kind,source:source||''})};
  for(const t of st?.cashTransactions||[]){
    const d=String(t?.date||''),v=Number(t?.amount);
    if(!within(d)||!Number.isFinite(v)||v===0||transfer(t))continue;
    const cf=cashType(t),name=String(t.description_raw||t.description||'銀行取引');
    if(v>0){add(actual,d,name,v,isSalary(t)?'salary':isBonus(t)?'bonus':'income',String(t.source||'銀行'));continue}
    bankInRange.push(t);
    const ord=String(t.ordinary_or_special||'').toUpperCase();
    let kind='living';
    if(cf==='CARD_SETTLEMENT'||cf==='CARD_PAYMENT')kind='card';
    else if(['DEBT_PRINCIPAL','DEBT_INTEREST','DEBT_PAYMENT','CAR_LOAN'].includes(cf)||/ローン|借入|返済|リボ払い/.test(name))kind='debt';
    else if(cf==='INVESTMENT_CONTRIBUTION'||ord==='INVESTMENT'||/ＩＤＥＣＯ|IDECO|積立NISA|つみたてNISA/i.test(name))kind='investment';
    else if(ord==='SPECIAL')kind='special';
    else if(/^(UTILITY|INSURANCE|COMMUNICATION|HOUSING|CHILDCARE|FIXED|HOUSEHOLD_STANDARD)/.test(cf)||/電気|水道|ガス|携帯|通信|保険料|家賃/.test(name))kind='fixed';
    add(actual,d,name,v,kind,String(t.source||'銀行'));
  }
  const seenCash=new Set();
  for(const c of st?.cashExpenses||[]){
    const d=String(c?.date||''),v=Math.abs(Number(c?.amount)||0),name=String(c?.description||c?.description_raw||'現金支出');
    if(!within(d)||!v||String(c?.economic_type||'EXPENSE').toUpperCase()!=='EXPENSE')continue;
    const k=d+'|'+v+'|'+tidy(name);
    if(seenCash.has(k))continue;
    seenCash.add(k);
    const duplicate=bankInRange.some(t=>String(t.date)===d&&Math.abs(Number(t.amount)||0)===v&&tidy(t.description_raw||t.description)===tidy(name));
    if(duplicate){warnings.push('銀行支出と同内容の現金明細を重複候補として除外しました');continue}
    add(actual,d,name,-v,String(c.ordinary_or_special||c.expense_scope||'').toUpperCase()==='SPECIAL'?'special':'cash','現金');
  }
  const usedSettlement=new Set();
  for(const [i,s] of (st?.cardSettlements||[]).entries()){
    const d=String(s?.due_date||''),v=Math.abs(Number(s?.amount)||0);
    if(!within(d)||!v)continue;
    const matches=bankInRange.filter(t=>Math.abs(Math.abs(Number(t.amount)||0)-v)<=1&&dayDiff(String(t.date),d)<=3);
    if(matches.length){
      for(const row of actual)if(row.amount<0&&matches.some(t=>String(t.date)===row.date&&Number(t.amount)===row.amount))row.kind='card';
      continue;
    }
    const key=String(s.settlement_id||s.id||s.card+'|'+d+'|'+v);
    if(usedSettlement.has(key))continue;
    usedSettlement.add(key);
    add(pending,d,String(s.card||'カード')+' 引落（銀行未照合）',-v,'card','請求記録');
  }
  const seenFixed=new Set(),firstMonth=start.slice(0,7),nextMonth=addMonth(firstMonth,1);
  for(const master of st?.masters?.fixedExpenses||[]){
    if(master?.active===false||master?.forecastEnabled===false)continue;
    const route=String(master.paymentRoute||master.payment_route||'DIRECT').toUpperCase();
    if(route!=='DIRECT')continue;
    const cadence=String(master.cadence||'MONTHLY').toUpperCase();
    if(!['MONTHLY','SEMI_FIXED'].includes(cadence))continue;
    const v=Math.abs(Number(master.amount)||0);
    if(!v)continue;
    const name=String(master.name||'固定費'),payday=Number(master.dueDay||master.paymentDay||master.day||1);
    for(const m of [firstMonth,nextMonth]){
      if(cadence==='SEMI_FIXED'&&!(master.activeMonths||master.months||[]).map(Number).includes(Number(m.slice(5,7))))continue;
      const d=dateOf(m,payday);if(!within(d))continue;
      const key=String(master.id||tidy(name))+'|'+d;
      if(seenFixed.has(key))continue;seenFixed.add(key);
      const confirmed=bankInRange.some(t=>Math.abs(Math.abs(Number(t.amount)||0)-v)<=1&&dayDiff(String(t.date),d)<=4&&
        (tidy(name).includes(tidy(t.description_raw||t.description))||tidy(t.description_raw||t.description).includes(tidy(name))||cashType(t)==='DEBT_PRINCIPAL'));
      if(confirmed)continue;
      const cashPaid=actual.some(t=>t.source==='現金'&&t.amount===-v&&dayDiff(t.date,d)<=4&&tidy(t.label)===tidy(name));
      if(cashPaid)continue;
      const kind=/ローン|返済|借入/.test(name)||/DEBT|LOAN/.test(String(master.category||''))?'debt':
        /IDECO|NISA|積立|投資/.test(name)?'investment':'fixed';
      add(pending,d,name+'（支払未照合）',-v,kind,'固定費マスター');
    }
  }
  const recordedSalary=actual.some(t=>t.kind==='salary');
  const salarySetting=Math.max(0,Number(st?.settings?.salary)||0);
  if(!recordedSalary&&salarySetting){
    for(const m of [firstMonth,nextMonth]){
      const d=dateOf(m,salaryDay);
      if(within(d)){add(pending,d,'給与（設定額・入金未確認）',salarySetting,'salary','設定');break}
    }
  }
  const cardPurchase=(st?.purchaseEvents||[]).reduce((n,p)=>{
    const d=String(p?.purchase_date||''),t=String(p?.economic_type||'EXPENSE').toUpperCase(),v=Math.abs(Number(p?.original_amount)||0);
    return n+(within(d)&&t==='EXPENSE'&&!p?.is_refinance_adjustment?v:0);
  },0);
  const sum=(arr,pred)=>arr.filter(pred).reduce((n,x)=>n+Math.abs(x.amount),0);
  const incomeActual=actual.filter(x=>x.amount>0).reduce((n,x)=>n+x.amount,0);
  const incomePending=pending.filter(x=>x.amount>0).reduce((n,x)=>n+x.amount,0);
  const outActual=actual.filter(x=>x.amount<0).reduce((n,x)=>n-x.amount,0);
  const outPending=pending.filter(x=>x.amount<0).reduce((n,x)=>n-x.amount,0);
  const groups=['living','fixed','cash','card','debt','investment','special'].map(kind=>({
    kind,actual:sum(actual,x=>x.kind===kind&&x.amount<0),pending:sum(pending,x=>x.kind===kind&&x.amount<0)
  }));
  if(!bankInRange.length)warnings.push('この期間の銀行出金明細がありません。支出・返済の確認が不十分です');
  if(!recordedSalary&&salarySetting)warnings.push('給与は設定額による推計です。実入金ではありません');
  if(pending.some(x=>x.kind==='card'))warnings.push('カード請求は銀行引落と未照合です。実際の引落を確認してください');
  if(pending.some(x=>x.source==='固定費マスター'))warnings.push('固定費・ローンの支払未照合予定を含みます。実績支出と区別してください');
  if(end>ref)warnings.push('未到来の日付を含むため、この期間の実績は途中経過です');
  const rows=[...actual.map(x=>({...x,status:'確認済'})),...pending.map(x=>({...x,status:'未確認・予定'}))].sort((a,b)=>b.date.localeCompare(a.date)||a.label.localeCompare(b.label,'ja'));
  return {month,start,end,basis,incomeActual,incomePending,outActual,outPending,
    incomeTotal:incomeActual+incomePending,outTotal:outActual+outPending,
    remainder:incomeActual+incomePending-outActual-outPending,cardPurchase,groups,rows,
    warnings:[...new Set(warnings)],counts:{bank:bankInRange.length,cash:actual.filter(x=>x.source==='現金').length,
      card:usedSettlement.size,salaryVerified:recordedSalary}};
}

  if(window.__householdMonthlyTreasuryV142)return;
  window.__householdMonthlyTreasuryV142=true;
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const localDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const plusMonth=(m,n)=>{const a=m.split('-').map(Number),d=new Date(a[0],a[1]-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
  const getState=()=>{try{return (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return {}}};
  const labels={living:'生活費・その他',fixed:'固定費',cash:'現金支出',card:'カード引落',debt:'ローン・返済',investment:'投資・積立',special:'特別費'};
  let basis='payday',selected='';
  const todayPeriod=()=>{const t=localDate(),st=getState(),day=Math.max(1,Math.min(28,Number(st.settings?.salaryDay)||18));return basis==='payday'&&Number(t.slice(8))<day?plusMonth(t.slice(0,7),-1):t.slice(0,7)};
  function ensure(){
    let tab=document.getElementById('monthlyTreasuryTabV142');
    if(!tab){
      const nav=document.querySelector('nav.tabs');if(!nav)return false;
      tab=document.createElement('button');tab.className='tab';tab.dataset.page='monthlyTreasuryPageV142';
      tab.id='monthlyTreasuryTabV142';tab.type='button';tab.textContent='月次収支';
      const next=nav.querySelector('[data-page="expenses"]');nav.insertBefore(tab,next||null);
      tab.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));tab.classList.add('active');document.getElementById('monthlyTreasuryPageV142')?.classList.add('active');window.dispatchEvent(new CustomEvent('treasury:pagechange',{detail:{page:'monthlyTreasuryPageV142'}}));render()};
    }
    if(!document.getElementById('monthlyTreasuryPageV142')){
      const page=document.createElement('section');page.className='page';page.id='monthlyTreasuryPageV142';
      page.innerHTML='<div class="card" style="margin-bottom:12px"><div class="title">月次収支モニター</div>'+
        '<div class="controls" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'+
          '<label for="monthlyBasisV142">集計期間</label><select id="monthlyBasisV142"><option value="payday">給与サイクル</option><option value="calendar">暦月</option></select>'+
          '<button type="button" class="btn secondary" id="monthlyPrevV142" aria-label="前の月">◀</button>'+
          '<input id="monthlyMonthV142" type="month" aria-label="対象月" style="max-width:190px">'+
          '<button type="button" class="btn secondary" id="monthlyNextV142" aria-label="次の月">▶</button>'+
        '</div><div class="tiny" id="monthlyPeriodV142" style="margin-top:10px"></div></div>'+
        '<div class="grid" id="monthlyOverviewV142"></div>'+
        '<div class="card" style="margin-top:12px"><div class="title">直近12期間の推移</div><div id="monthlyTrendV142" class="table"></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="title">入出金内訳</div><div id="monthlyDetailV142" class="table"></div></div>';
      const before=document.getElementById('expenses');before?.parentNode?.insertBefore(page,before);
      document.getElementById('monthlyBasisV142').onchange=e=>{basis=e.target.value;selected=todayPeriod();render()};
      document.getElementById('monthlyMonthV142').onchange=e=>{selected=e.target.value;render()};
      document.getElementById('monthlyPrevV142').onclick=()=>{selected=plusMonth(selected||todayPeriod(),-1);render()};
      document.getElementById('monthlyNextV142').onclick=()=>{selected=plusMonth(selected||todayPeriod(),1);render()};
    }
    return true;
  }
  function render(){
    if(!ensure())return;
    if(!selected)selected=todayPeriod();
    const st=getState(),v=monthlyTreasuryCalculate(st,selected,basis,localDate());
    document.getElementById('monthlyBasisV142').value=basis;
    document.getElementById('monthlyMonthV142').value=selected;
    const salaryDay=Math.max(1,Math.min(28,Number(st.settings?.salaryDay)||18));
    document.getElementById('monthlyPeriodV142').textContent=v.start+' 〜 '+v.end+
      (basis==='payday'?'（毎月'+salaryDay+'日〜翌'+(salaryDay-1)+'日）':'（1日〜月末）')+' | 実績と未照合予定を分離して表示';
    const grid=document.getElementById('monthlyOverviewV142');
    const kpi=(name,value,sub,color)=>'<div class="card kpi"><div class="muted">'+name+'</div><b class="'+(color||'')+'">'+yen(value)+'</b><div class="tiny">'+sub+'</div></div>';
    let html=kpi('収入 合計',v.incomeTotal,'入金確認 '+yen(v.incomeActual)+' ／ 未確認 '+yen(v.incomePending))+
      kpi('流出 合計',v.outTotal,'支払確認 '+yen(v.outActual)+' ／ 未照合 '+yen(v.outPending))+
      kpi('差引参考残額',v.remainder,'収入－支出・返済・投資。口座残高とは異なります',v.remainder<0?'bad':'good')+
      kpi('うち未照合の出金',v.outPending,'請求記録・固定費予定に基づく金額',v.outPending?'warn':'');
    html+='<div class="card half"><div class="title">用途別の流出（引落・支払基準）</div>';
    for(const g of v.groups)html+='<div class="row"><span>'+labels[g.kind]+'</span><div class="amt">'+yen(g.actual+g.pending)+
      (g.pending?'<div class="tiny" style="text-align:right">うち未照合 '+yen(g.pending)+'</div>':'')+'</div></div>';
    html+='</div><div class="card half"><div class="title">集計品質と補足</div>'+
      '<div class="row"><span>利用日基準のカード消費（参考）</span><b>'+yen(v.cardPurchase)+'</b></div>'+
      '<div class="tiny" style="margin:8px 0 12px">カード利用は引落と二重計上しません。ATM出金・口座間振替・電子マネーチャージは資金移動として対象外です。</div>';
    if(v.warnings.length)for(const w of v.warnings)html+='<div class="note" style="margin:6px 0">'+esc(w)+'</div>';
    else html+='<div class="tiny">追加の品質警告はありません。</div>';
    html+='<div class="tiny" style="margin-top:10px">給与・ボーナス等の未入金予測は、確定収入とは区別します。単発費・年次予測・古い派生イベントは自動計上しません。</div></div>';
    grid.innerHTML=html;
    let trend='<table><thead><tr><th>期間</th><th>収入</th><th>流出</th><th>差引参考</th><th>未照合出金</th></tr></thead><tbody>';
    for(let i=0;i<12;i++){
      const m=plusMonth(selected,-i),s=monthlyTreasuryCalculate(st,m,basis,localDate());
      trend+='<tr><td><button class="btn secondary" type="button" data-month-v142="'+esc(m)+'">'+esc(m)+'</button></td>'+
        '<td>'+yen(s.incomeTotal)+'</td><td>'+yen(s.outTotal)+'</td><td class="'+(s.remainder<0?'bad':'good')+'">'+yen(s.remainder)+'</td><td>'+yen(s.outPending)+'</td></tr>';
    }
    document.getElementById('monthlyTrendV142').innerHTML=trend+'</tbody></table>';
    const details=v.rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.label)+'</td><td>'+esc(labels[r.kind]||r.kind)+'</td>'+
      '<td>'+esc(r.status)+'</td><td>'+esc(r.source)+'</td><td class="'+(r.amount<0?'bad':'good')+'">'+(r.amount>0?'+':'')+yen(r.amount)+'</td></tr>').join('');
    document.getElementById('monthlyDetailV142').innerHTML='<table><thead><tr><th>日付</th><th>内容</th><th>区分</th><th>確認状態</th><th>根拠</th><th>金額</th></tr></thead><tbody>'+
      (details||'<tr><td colspan="6">該当データがありません。</td></tr>')+'</tbody></table>';
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-month-v142]');if(b){selected=b.dataset.monthV142;render()}
  });
  window.addEventListener('treasury:pagechange',e=>{if(e.detail?.page==='monthlyTreasuryPageV142')render()});
  window.addEventListener('focus',()=>{if(document.getElementById('monthlyTreasuryPageV142')?.classList.contains('active'))render()});
  window.addEventListener('pageshow',()=>ensure());
  window.householdMonthlySummaryV142=monthlyTreasuryCalculate;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});
  else ensure();

})();
