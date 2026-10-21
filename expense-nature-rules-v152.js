(() => {
  'use strict';
  if (window.householdExpenseNatureV152) return;
  // Cost behavior is a PRESENTATION classification. It never changes
  // economic_type (EXPENSE / DEBT_PRINCIPAL / INVESTMENT / TRANSFER).
  const defs=[
    ['HOUSING','RENT_MORTGAGE=FIXED|HOME_MAINTENANCE=SPECIAL|OTHER=REVIEW'],
    ['UTILITIES','ELECTRICITY=FIXED|WATER=FIXED|GAS=FIXED|OTHER=REVIEW'],
    ['COMMUNICATION','MOBILE=FIXED|INTERNET=FIXED|OTHER=REVIEW'],
    ['FOOD','GROCERIES=VARIABLE|EATING_OUT=VARIABLE|CAFE=VARIABLE|OTHER=VARIABLE'],
    ['DAILY_GOODS','HOUSEHOLD=VARIABLE|CLOTHING=VARIABLE|OTHER=VARIABLE'],
    ['CHILD','CHILDCARE=REVIEW|SCHOOL=REVIEW|GOODS=VARIABLE|OTHER=VARIABLE'],
    ['MEDICAL','CLINIC=VARIABLE|DENTAL=VARIABLE|CONTACTS=VARIABLE|PHARMACY=VARIABLE|OTHER=VARIABLE'],
    ['INSURANCE','LIFE=FIXED|AUTO=SPECIAL|OTHER=REVIEW'],
    ['CAR','FUEL=VARIABLE|MAINTENANCE=SPECIAL|PARKING=VARIABLE|TOLL=VARIABLE|OTHER=REVIEW'],
    ['TRANSPORT','TRAIN=VARIABLE|BUS=VARIABLE|TAXI=VARIABLE|AIR=SPECIAL|OTHER=REVIEW'],
    ['SUBSCRIPTION','DIGITAL=VARIABLE|MEMBERSHIP=VARIABLE|CARD_FEE=VARIABLE|OTHER=REVIEW'],
    ['ENTERTAINMENT','HOBBY=VARIABLE|MEDIA=VARIABLE|DINING=VARIABLE|OTHER=VARIABLE'],
    ['TRAVEL','LODGING=SPECIAL|AIR=SPECIAL|TRANSPORT=VARIABLE|OTHER=REVIEW'],
    ['EDUCATION','TUITION=FIXED|BOOKS=VARIABLE|OTHER=REVIEW'],
    ['TAX','TAX=FIXED|FEE=VARIABLE|OTHER=VARIABLE'],
    ['FINANCIAL_FEES','INTEREST=VARIABLE|FEE=VARIABLE|OTHER=REVIEW'],
    ['PERSONAL','BEAUTY=VARIABLE|FITNESS=VARIABLE|OTHER=REVIEW'],
    ['GIFTS_EVENTS','GIFT=SPECIAL|EVENT=SPECIAL|CEREMONY=SPECIAL|OTHER=REVIEW'],
    ['OTHER','OTHER=REVIEW']
  ];
  const ruleMap=new Map();
  for(const [category,spec] of defs) for(const piece of spec.split('|')){
    const [sub,nature]=piece.split('=');ruleMap.set(category+'.'+sub,nature);
  }
  const masters={
    LOAN_PRADO:'FIXED',LOAN_LAPIN:'FIXED',
    PRADO_SUMMER:'FIXED',PRADO_WINTER:'FIXED',
    LAPIN_SUMMER:'FIXED',LAPIN_WINTER:'FIXED',IDECO:'FIXED'
  };
  const norm=x=>String(x??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  function masterKey(master){
    const id=norm(master?.id||''),name=norm(master?.name||'');
    if(id==='IDECO'||/IDECO|イデコ|国民年金基金/.test(name))return 'IDECO';
    const p=/プラド|PRADO/.test(name+id),l=/ラパン|LAPIN/.test(name+id);
    const summer=/夏|SUMMER/.test(name+id),winter=/冬|WINTER/.test(name+id);
    if(p)return summer?'PRADO_SUMMER':winter?'PRADO_WINTER':'LOAN_PRADO';
    if(l)return summer?'LAPIN_SUMMER':winter?'LAPIN_WINTER':'LOAN_LAPIN';
    if(/CARLOAN|車ローン|自動車ローン|CAR_LOAN/.test(name+id))return 'LOAN_PRADO'; // generic loan is fixed; alias is not an asset identification
    return '';
  }
  function masterNature(master){
    const key=masterKey(master);
    if(key)return {nature:masters[key],key:'MASTER.'+key,reason:'approved-master'};
    return {nature:'REVIEW',key:'',reason:'unmapped-master'};
  }
  // Individual record choice wins for REVIEW only; no bulk auto-category edit.
  function classify({category,subcategory,source,kind,label,semantic}={}){
    const eco=String(source?.economic_type||'').toUpperCase();
    const cashflow=String(source?.cashflow_type||'').toUpperCase();
    if(kind==='debt'||eco==='DEBT_PRINCIPAL'||cashflow==='DEBT_PAYMENT'||cashflow==='DEBT_PRINCIPAL'){
      return {nature:'FIXED',key:'MASTER.DEBT_REPAYMENT',reason:'debt',economicType:'DEBT_PRINCIPAL'};
    }
    if(kind==='investment'||eco==='INVESTMENT'||cashflow==='INVESTMENT_CONTRIBUTION'){
      const ideco=/IDECO|イデコ|国民年金基金/.test(norm(label||source?.name||source?.description_raw));
      return {nature:ideco?'FIXED':'REVIEW',key:ideco?'MASTER.IDECO':'',reason:'investment',economicType:'INVESTMENT'};
    }
    if(kind==='card'){
      // A single bank settlement contains MANY purchase categories. Never
      // assign fixed/variable by merchant-pattern to an aggregated card debit.
      return {nature:'REVIEW',key:'',reason:'card-settlement-unallocated',economicType:'TRANSFER'};
    }
    const cat=semantic?.normalizeCategoryValue?.(category)||
      semantic?.inferCategory?.(label,category)||null;
    const sub=cat?semantic?.inferSubcategory?.(cat,label,subcategory)||'OTHER':null;
    const key=cat&&sub?cat+'.'+sub:'';
    const configured=key?ruleMap.get(key):null;
    const explicit=norm(source?.cost_nature||source?.cost_behavior||source?.fixed_variable_class);
    if((!configured||configured==='REVIEW')&&['FIXED','VARIABLE','SPECIAL'].includes(explicit))
      return {nature:explicit,key,reason:'record-override',economicType:eco||'EXPENSE'};
    if(configured&&configured!=='REVIEW')
      return {nature:configured,key,reason:'approved-rule',economicType:eco||'EXPENSE'};
    // A manual existing SPECIAL classification stays special when the selected
    // subcategory said review. NORMAL does not imply variable; request review.
    const prev=String(source?.spending_class||source?.expense_scope||source?.ordinary_or_special||'').toUpperCase();
    return {nature:prev==='SPECIAL'?'SPECIAL':'REVIEW',key,reason:'manual-review',economicType:eco||'EXPENSE'};
  }
  window.householdExpenseNatureV152={
    VERSION:152,rules:Object.fromEntries(ruleMap),
    masters:Object.freeze(masters),classify,masterKey,masterNature,
    label:{FIXED:'固定費',VARIABLE:'変動費',SPECIAL:'特別費',REVIEW:'要確認'}
  };
})();