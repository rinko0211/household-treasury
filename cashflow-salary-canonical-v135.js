(() => {
  if (window.__cashflowSalaryCanonicalV135) return;
  window.__cashflowSalaryCanonicalV135 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const iso = d => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? '' : x.getFullYear() + '-' +
      String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0');
  };
  const addDays = (date,n) => {
    const d = new Date(date+'T12:00:00');
    d.setDate(d.getDate()+n);
    return iso(d);
  };
  const dateFor = (ym,day) => {
    const [y,m] = ym.split('-').map(Number);
    return ym+'-'+String(Math.min(Math.max(1,day),new Date(y,m,0).getDate())).padStart(2,'0');
  };
  const previousBankingDay = date => {
    const d=new Date(date+'T12:00:00'),w=d.getDay();
    if(w===0)d.setDate(d.getDate()-2);
    else if(w===6)d.setDate(d.getDate()-1);
    return iso(d);
  };
  const distance = (a,b) => {
    const x = new Date(a+'T12:00:00'),y = new Date(b+'T12:00:00');
    return Math.abs(Math.round((x-y)/86400000));
  };
  const salaryLike = e => Number(e?.amount)>0 &&
    (String(e?.type||'').toUpperCase().includes('SALARY') ||
     String(e?.source||'').toLowerCase().includes('salary') ||
     /給与|俸給/i.test(String(e?.name||'')));
  const isRegular = (e,planned,expected) =>
    salaryLike(e) && Number(e.amount)>=expected*0.5 && distance(String(e.date||''),planned)<=7;
  const isBankSalary = t => {
    const k = String(t?.cashflow_type||t?.category||'').toUpperCase();
    const n = String(t?.description_raw||t?.description||'').normalize('NFKC');
    return k==='INCOME_SALARY' || /給与|俸給|SALARY/i.test(n);
  };
  function actualPaid(st,ym,planned,expected) {
    if(!(expected>0))return false;
    const main = (st.cashTransactions||[]).filter(t=>
      (t.account==='main'||(!t.account&&/楽天銀行|Rakuten Bank/i.test(String(t.source||'')))) &&
      t.balance_after!==null && t.balance_after!=='' && Number.isFinite(Number(t.balance_after)));
    const latestMain = main.reduce((v,t)=>String(t.date||'')>v?String(t.date):v,'');
    const asOf = [String(st.settings?.cashAsOf||''),latestMain].sort().at(-1).slice(0,10);
    if(!asOf)return false;
    return main.some(t=>
      String(t.date||'').slice(0,7)===ym &&
      String(t.date||'')<=asOf && isBankSalary(t) &&
      Number(t.amount)>=expected*0.5 &&
      distance(String(t.date||''),planned)<=7);
  }
  function normalize(input,st=stateNow(),from=iso(new Date()),days=90) {
    const expected=Math.max(0,Number(st.settings?.salary)||0);
    const rows=Array.isArray(input)?[...input]:[];
    if(!expected)return rows;
    const day=Math.min(31,Math.max(1,Number(st.settings?.salaryDay)||18));
    const to=addDays(from,Math.max(0,Number(days)||0));
    const begin=new Date(from.slice(0,7)+'-01T12:00:00'),end=new Date(to.slice(0,7)+'-01T12:00:00');
    for(let d=begin;d<=end;d.setMonth(d.getMonth()+1)){
      const ym=iso(d).slice(0,7),nominal=dateFor(ym,day),planned=previousBankingDay(nominal);
      const candidates=rows.map((row,index)=>({row,index})).filter(({row})=>
        String(row.date||'').slice(0,7)===ym && 
        (isRegular(row,planned,expected)||isRegular(row,nominal,expected)));
      // Friday payday for Sunday 2026-10-18 is 2026-10-16. A prediction on
      // the 18th must not re-add pay after the bank's payday has passed.
      const verified=actualPaid(st,ym,planned,expected);
      const stale=planned<from || verified;
      if(stale) {
        for(let i=candidates.length-1;i>=0;i--)rows.splice(candidates[i].index,1);
        continue;
      }
      if(planned>to)continue;
      if(!candidates.length) {
        rows.push({id:'salary:canonical:'+ym,date:planned,name:'給与',
          amount:expected,type:'SALARY',future_kind:'INCOME',economic_type:'INCOME',
          generated:true,source:'salary_canonical_v135'});
        continue;
      }
      // Normalize stale nominal-day estimates to the banking-day date.
      const candidate=candidates[0];
      if(candidate?.row?.generated && candidate.row.date!==planned)
        rows[candidate.index]={...candidate.row,date:planned};
      if(candidates.length>1) {
        const priority=e=>e.source==='rule'?4:!e.generated?3:e.source==='settings_salary'?2:1;
        candidates.sort((a,b)=>priority(b.row)-priority(a.row)||a.index-b.index);
        const keep=candidates[0].index;
        for(const {index} of candidates.filter(x=>x.index!==keep).sort((a,b)=>b.index-a.index))
          rows.splice(index,1);
      }
    }
    return rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||
      String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }
  if(typeof generated==='function'&&!window.__generatedSalaryCanonicalV135){
    window.__generatedSalaryCanonicalV135=true;
    const previousGenerated=generated;
    generated=function generatedSalaryCanonicalV135(days=90){
      return normalize(previousGenerated(days),stateNow(),iso(new Date()),days);
    };
  }
  window.householdSalaryCanonicalV135={normalize,actualPaid,isRegular,previousBankingDay};
})();
