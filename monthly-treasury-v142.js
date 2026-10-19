(() => {
  'use strict';
  if(window.__householdMonthlyTreasuryV142)return;
  window.__householdMonthlyTreasuryV142=true;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(v)||0);
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const stateNow=()=>{try{return(window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return{}}};
  const engine=()=>window.treasuryLedgerV145;
  const names={living:'生活費・その他',fixed:'固定費',cash:'現金支出',card:'カード引落',debt:'ローン・リボ返済',
    investment:'NISA・iDeCo等への積立',special:'特別費',cardPurchase:'カード利用（利用日）'};
  let basis='payday',month='',lens='cash',annualYear=0,trendLength=12;

  function cardEstimates(){
    try {
      const api=window.householdCardCycleV81;
      const plan=api?.buildPlan?.(460);
      return Array.isArray(plan?.rows)?plan.rows:[];
    }catch{return[]}
  }
  function revolvingEstimates(){
    try{
      if(typeof generated!=='function')return [];
      return (generated(460)||[]).filter(x=>
        String(x?.type||'').toUpperCase()==='CARD_REVOLVING_PAYMENT'&&Number(x.amount)<0);
    }catch{return []}
  }
  function calculate(st,m,b,ref,estimates=[],revolving=[]){
    const api=engine();
    if(!api?.calculate)throw Error('月次台帳の集計機能を読み込めませんでした。');
    return api.calculate(st,m,b,ref,{cardEstimates:estimates,revolvingEstimates:revolving});
  }
  function currentPeriod(){
    const d=today(),m=d.slice(0,7);
    const api=engine();if(basis==='calendar'||!api)return m;
    return d<api.payday(stateNow(),m)?api.addMonth(m,-1):m;
  }
  function detailTable(rows,mode){
    const list=(rows||[]).slice(0,350);
    const content=list.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.label)+'</td><td>'+esc(names[x.kind]||x.kind)+'</td>'+
      '<td>'+esc(mode==='economic'?'利用記録':x.status==='confirmed'?'確認済み':x.status==='unverified'?'期限経過・未照合':'今後の予定')+
      '</td><td>'+esc(x.source||'')+'</td><td class="'+(x.amount<0?'bad':'good')+'">'+
      (x.amount>0?'+':'')+yen(x.amount)+'</td></tr>').join('');
    return '<div class="table"><table><thead><tr><th>日付</th><th>内容</th><th>分類</th><th>状態</th><th>根拠</th><th>金額</th></tr></thead><tbody>'+
      (content||'<tr><td colspan="6">該当明細がありません。</td></tr>')+'</tbody></table></div>'+
      (rows.length>350?'<div class="tiny">350件まで表示しています。その他'+(rows.length-350)+'件はバックアップから確認してください。</div>':'');
  }
  function ensure(){
    const nav=document.querySelector('nav.tabs');
    if(!nav)return false;
    let tab=$('monthlyTreasuryTabV142');
    if(!tab){
      tab=document.createElement('button');tab.className='tab';tab.id='monthlyTreasuryTabV142';
      tab.type='button';tab.dataset.page='monthlyTreasuryPageV142';tab.textContent='月次収支';
      const expenses=nav.querySelector('[data-page="expenses"]');nav.insertBefore(tab,expenses||null);
    }
    // Do not rely on the boot-time router seeing a dynamically inserted tab.
    // Static index.html contains this tab; the direct handler is a fallback.
    tab.onclick=()=>{
      document.querySelectorAll('nav.tabs .tab').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('section.page').forEach(x=>x.classList.remove('active'));
      tab.classList.add('active');
      $('monthlyTreasuryPageV142')?.classList.add('active');
      window.dispatchEvent(new CustomEvent('treasury:pagechange',{detail:{page:'monthlyTreasuryPageV142'}}));
      render();
    };
    let page=$('monthlyTreasuryPageV142');
    if(!page){
      page=document.createElement('section');page.className='page';page.id='monthlyTreasuryPageV142';
      page.innerHTML=
        '<div class="card" style="margin-bottom:12px">'+
          '<div class="title">月次・年間の資金収支</div>'+
          '<div class="tiny" style="margin-bottom:10px">v146 · 表示切替を選ぶと、期間・明細・年間集計も切り替わります。</div>'+
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+
            '<button type="button" class="btn" id="treasuryCyclePaydayV146">給与サイクル</button>'+
            '<button type="button" class="btn secondary" id="treasuryCycleCalendarV146">暦月（1日〜末日）</button>'+
          '</div>'+
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+
            '<button type="button" class="btn" id="treasuryLensCashV146">資金流出（ローン等含む）</button>'+
            '<button type="button" class="btn secondary" id="treasuryLensEconomicV146">消費支出のみ</button>'+
          '</div>'+
          '<div class="controls" style="display:flex;flex-wrap:wrap;gap:9px;align-items:end">'+
            '<div class="field"><label for="treasuryBasisV145">集計サイクル</label><select id="treasuryBasisV145"><option value="payday">給与サイクル（給与日基準）</option><option value="calendar">暦月（1日〜末日）</option></select></div>'+
            '<div class="field"><label for="treasuryLensV145">集計の見方</label><select id="treasuryLensV145"><option value="cash">給与からの資金流出（ローン・投資含む）</option><option value="economic">消費支出（カード利用日基準）</option></select></div>'+
            '<button class="btn secondary" type="button" id="treasuryPrevV145">◀</button>'+
            '<div class="field"><label for="treasuryMonthV145">対象月</label><input id="treasuryMonthV145" type="month"></div>'+
            '<button class="btn secondary" type="button" id="treasuryNextV145">▶</button>'+
            '<button class="btn secondary" type="button" id="treasuryNowV145">今のサイクル</button>'+
          '</div>'+
          '<div id="treasuryPeriodNoteV145" class="tiny" style="margin-top:12px"></div>'+
        '</div>'+
        '<div class="grid" id="treasuryKpisV145"></div>'+
        '<div class="grid" style="margin-top:12px" id="treasuryGroupsV145"></div>'+
        '<div class="card" style="margin-top:12px"><div class="title">過去12期間の比較</div><div id="treasuryHistoryV145" class="table"></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="title">年間収支（給与・ボーナスを含む）</div>'+
          '<div class="controls" style="margin-bottom:10px"><label for="treasuryYearV145">対象年</label><input id="treasuryYearV145" type="number" min="2000" max="2100" style="width:130px"></div>'+
          '<div id="treasuryAnnualV145"></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="title">明細と根拠</div><div id="treasuryDetailsV145"></div></div>';
      const before=$('expenses');before?.parentNode?.insertBefore(page,before);
      // Keep the selected month label when comparing payroll vs calendar cycles.
      const setBasis=choice=>{basis=choice;if(!month)month=currentPeriod();annualYear=Number(month.slice(0,4));render()};
      const setLens=choice=>{lens=choice;render()};
      $('treasuryCyclePaydayV146').onclick=()=>setBasis('payday');
      $('treasuryCycleCalendarV146').onclick=()=>setBasis('calendar');
      $('treasuryLensCashV146').onclick=()=>setLens('cash');
      $('treasuryLensEconomicV146').onclick=()=>setLens('economic');
      $('treasuryBasisV145').onchange=e=>setBasis(e.target.value);
      $('treasuryLensV145').onchange=e=>setLens(e.target.value);
      $('treasuryMonthV145').onchange=e=>{month=e.target.value;annualYear=Number(month.slice(0,4));render()};
      $('treasuryPrevV145').onclick=()=>{month=engine().addMonth(month||currentPeriod(),-1);annualYear=Number(month.slice(0,4));render()};
      $('treasuryNextV145').onclick=()=>{month=engine().addMonth(month||currentPeriod(),1);annualYear=Number(month.slice(0,4));render()};
      $('treasuryNowV145').onclick=()=>{month=currentPeriod();annualYear=Number(month.slice(0,4));render()};
      $('treasuryYearV145').onchange=e=>{const y=Number(e.target.value);if(y>=2000&&y<=2100){annualYear=y;render()}};
    }
    return true;
  }
  const kpi=(title,amount,note,color='')=>'<div class="card kpi"><span class="muted">'+esc(title)+'</span>'+
    '<b class="'+color+'">'+yen(amount)+'</b><div class="tiny">'+note+'</div></div>';
  function render(){
    if(!ensure()||!engine())return;
    if(!month)month=currentPeriod();
    if(!annualYear)annualYear=Number(month.slice(0,4));
    const st=stateNow(),ref=today(),estimates=cardEstimates(),revolving=revolvingEstimates();
    const v=calculate(st,month,basis,ref,estimates,revolving);
    for(const [id,active] of [
      ['treasuryCyclePaydayV146',basis==='payday'],['treasuryCycleCalendarV146',basis==='calendar'],
      ['treasuryLensCashV146',lens==='cash'],['treasuryLensEconomicV146',lens==='economic']
    ]){
      const button=$(id);if(!button)continue;
      button.className=active?'btn':'btn secondary';
      button.setAttribute('aria-pressed',active?'true':'false');
    }
    $('treasuryBasisV145').value=basis;
    $('treasuryLensV145').value=lens;
    $('treasuryMonthV145').value=month;
    $('treasuryYearV145').value=annualYear;
    $('treasuryPeriodNoteV145').textContent=v.start+' 〜 '+v.end+
      (basis==='payday'?' ｜ 毎月'+(Number(st.settings?.salaryDay)||18)+'日基準、土日なら前倒し':' ｜ 暦月1日〜末日')+
      ' ｜ 確認済みと未照合の予定は別に集計します';
    const actualNet=v.remainderActual,forecastNet=v.remainder;
    const note=(s)=>'<div class="tiny">'+s+'</div>';
    let cards;
    if(lens==='cash'){
      cards=kpi('実入金合計',v.incomeActual,'給与・賞与・その他の確認済み入金')+
        kpi('実際の資金流出',v.outActual,'生活費・カード引落・ローン返済・投資積立を含む')+
        kpi('確認済み差引',actualNet,'実入金－実際の流出。銀行残高とは別の期間損益',actualNet<0?'bad':'good')+
        kpi('未照合の支払予定',v.outPending,'期限経過分を含みます。支払済みとは扱いません')+
        kpi('今後の予定入金',v.incomePending,'給与設定・明示的なボーナス予定など。未入金')+
        kpi('予定込み差引（参考）',forecastNet,'入出金予定込み。確定残高ではありません',forecastNet<0?'bad':'good');
    }else{
      cards=kpi('生活上の消費支出',v.spentActual,'カード利用日＋現金支出＋銀行の直接支出')+
        kpi('カード利用額（内数）',v.cardPurchase,'カード引落とは別。消費額に含まれています')+
        kpi('参考：確認済み資金流出',v.outActual,'ローン返済・投資積立も含む別指標')+
        kpi('参考：実入金',v.incomeActual,'消費日と入金日は一致しません');
    }
    if(v.currentBankBalance!==null){
      cards+=kpi('記録された現金・銀行残高',v.currentBankBalance,
        '残高の記録日 '+esc(v.currentBankBalanceAsOf||'不明')+'。月次差引を足し直さない');
    }
    const liabilities=Math.max(0,Number(st.assets?.liabilities)||0),revolvingDebt=Math.max(0,Number(st.assets?.revolvingBalance)||0);
    if(liabilities)cards+=kpi('負債残高（登録値）',liabilities,'元金残高の参考値。今月の返済流出とは別');
    if(revolvingDebt)cards+=kpi('リボ残高（登録値）',revolvingDebt,'負債残高への内包有無が不明なため、合算しません');
    $('treasuryKpisV145').innerHTML=cards;
    const cashGroupRows=v.groups.map(g=>'<div class="row"><span>'+names[g.kind]+'</span>'+
      '<div style="text-align:right"><b>'+yen(g.actual)+'</b>'+ (g.pending?'<div class="tiny">未照合 '+yen(g.pending)+'</div>':'')+
      '</div></div>').join('');
    const econGroupRows=v.economicGroups.map(g=>'<div class="row"><span>'+names[g.kind]+'</span><b>'+yen(g.amount)+'</b></div>').join('');
    $('treasuryGroupsV145').innerHTML=
      '<div class="card half"><div class="title">'+(lens==='cash'?'給与から出たお金の内訳':'何に使ったか（利用日基準）')+'</div>'+
        (lens==='cash'?cashGroupRows:econGroupRows)+'</div>'+
      '<div class="card half"><div class="title">二重計上防止・データ品質</div>'+
        '<div class="row"><span>内部振替・ATM等の除外額（絶対値合計）</span><b>'+yen(v.excludedTransfers)+'</b></div>'+
        '<div class="row"><span>期限経過・未照合件数</span><b>'+v.pendingPast+'件</b></div>'+
        '<div class="row"><span>確認済み銀行明細数</span><b>'+v.bankCount+'件</b></div>'+
        '<div class="tiny" style="margin-top:7px">カード購入は消費日、カード請求は引落日にのみ計上。投資積立とローン元金は資金流出であり、生活上の消費とは区別します。</div>'+
        '<div class="tiny" style="margin-top:7px">銀行からの証券口座送金は積立配分に含めます。銀行間振替やATM引出は消費・純流出に含めません。</div>'+
        (v.quality.length?v.quality.map(w=>'<div class="note" style="margin-top:6px">'+esc(w)+'</div>').join(''):
          '<div class="tiny" style="margin-top:8px">特記事項なし</div>')+'</div>';
    let history='<table><thead><tr><th>対象月</th><th>実入金</th><th>'+
      (lens==='cash'?'実流出':'消費支出')+'</th><th>確認済み差引</th><th>未照合支払</th></tr></thead><tbody>';
    for(let i=0;i<trendLength;i++){
      const m=engine().addMonth(month,-i),a=calculate(st,m,basis,ref,estimates,revolving);
      const cost=lens==='cash'?a.outActual:a.spentActual;
      history+='<tr><td><button type="button" class="btn secondary" data-treasury-month="'+esc(m)+'">'+esc(m)+'</button></td>'+
        '<td>'+yen(a.incomeActual)+'</td><td>'+yen(cost)+'</td><td>'+yen(a.remainderActual)+'</td>'+
        '<td>'+yen(a.outPending)+'</td></tr>';
    }
    $('treasuryHistoryV145').innerHTML=history+'</tbody></table>';
    const annual=engine().annual(st,annualYear,basis,ref,{cardEstimates:estimates,revolvingEstimates:revolving});
    const annualTotals='<div class="grid">'+
      kpi('年間の給与実入金',annual.salaryActual,'確認できた給与の入金のみ')+
      kpi('年間の賞与実入金',annual.bonusActual,'確認できたボーナスの入金のみ')+
      kpi('年間の実入金',annual.incomeActual,'給与・賞与・その他の銀行入金')+
      kpi('年間の実流出',annual.outActual,'ローン・投資・カード引落を含む')+
      kpi('年間の確認済み差引',annual.remainderActual,'実入金－実流出',annual.remainderActual<0?'bad':'good')+
      kpi('年間の消費支出',annual.spentActual,'購入日基準のカード・現金・直接支出')+
      kpi('未照合の年間支払予定',annual.outPending,'確認済みの実支出ではありません')+
      kpi('未入金の年間予定',annual.incomePending,'うち給与予定 '+yen(annual.salaryPending)+' ／ 賞与予定 '+yen(annual.bonusPending)) +
      '</div>';
    let annualGroups='<div style="margin-top:12px"><b>年間の流出内訳</b>';
    for(const g of annual.groups)annualGroups+='<div class="row"><span>'+names[g.kind]+'</span>'+
      '<span>'+yen(g.actual)+(g.pending?' <span class="tiny">＋未照合 '+yen(g.pending)+'</span>':'')+'</span></div>';
    annualGroups+='</div>';
    const yearInfo='<div class="tiny" style="margin-top:10px">この年間集計は'+annualYear+'年1月〜12月の12期間の合計です。'+
      (basis==='payday'?'給与サイクルを各月に割り当て、12月分は翌年1月の給与日前日まで含みます。':'暦月で集計します。')+
      '銀行明細がない期間 '+annual.missingBankPeriods+'件。未照合予定 '+annual.unverifiedCount+'件。'+
      '未登録のボーナスや特別費は自動推定しません。</div>';
    $('treasuryAnnualV145').innerHTML=annualTotals+annualGroups+yearInfo;
    $('treasuryDetailsV145').innerHTML=detailTable(lens==='economic'?v.economicRows:v.rows,lens==='economic'?'economic':'cash');
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-treasury-month]');
    if(btn){month=btn.dataset.treasuryMonth;annualYear=Number(month.slice(0,4));render()}
  });
  window.addEventListener('treasury:pagechange',e=>{if(e.detail?.page==='monthlyTreasuryPageV142')render()});
  window.addEventListener('treasury:expenses-imported',()=>{if($('monthlyTreasuryPageV142')?.classList.contains('active'))render()});
  window.addEventListener('focus',()=>{if($('monthlyTreasuryPageV142')?.classList.contains('active'))render()});
  window.addEventListener('pageshow',()=>{ensure();if($('monthlyTreasuryPageV142')?.classList.contains('active'))render()});
  window.householdMonthlySummaryV142=calculate;
  window.householdAnnualSummaryV145=(st,year,b,ref)=>engine()?.annual(st,year,b,ref,{
    cardEstimates:cardEstimates(),revolvingEstimates:revolvingEstimates()
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();