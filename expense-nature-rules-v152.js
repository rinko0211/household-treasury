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
  const subcategoryLabels={
    "HOUSING.RENT_MORTGAGE": "家賃・住宅ローン",
    "HOUSING.HOME_MAINTENANCE": "住宅修繕",
    "HOUSING.OTHER": "その他",
    "UTILITIES.ELECTRICITY": "電気",
    "UTILITIES.WATER": "水道",
    "UTILITIES.GAS": "ガス",
    "UTILITIES.OTHER": "その他",
    "COMMUNICATION.MOBILE": "携帯電話",
    "COMMUNICATION.INTERNET": "インターネット",
    "COMMUNICATION.OTHER": "その他",
    "FOOD.GROCERIES": "食料品",
    "FOOD.EATING_OUT": "外食",
    "FOOD.CAFE": "カフェ",
    "FOOD.OTHER": "その他",
    "DAILY_GOODS.HOUSEHOLD": "生活用品",
    "DAILY_GOODS.CLOTHING": "衣類",
    "DAILY_GOODS.OTHER": "その他",
    "CHILD.CHILDCARE": "保育",
    "CHILD.SCHOOL": "学校",
    "CHILD.GOODS": "子ども用品",
    "CHILD.OTHER": "その他",
    "MEDICAL.CLINIC": "診療",
    "MEDICAL.DENTAL": "歯科",
    "MEDICAL.CONTACTS": "コンタクト",
    "MEDICAL.PHARMACY": "薬局",
    "MEDICAL.OTHER": "その他",
    "INSURANCE.LIFE": "生命保険",
    "INSURANCE.AUTO": "自動車保険",
    "INSURANCE.OTHER": "その他",
    "CAR.FUEL": "燃料",
    "CAR.MAINTENANCE": "整備・修理",
    "CAR.PARKING": "駐車場",
    "CAR.TOLL": "高速・ETC",
    "CAR.OTHER": "その他",
    "TRANSPORT.TRAIN": "鉄道",
    "TRANSPORT.BUS": "バス",
    "TRANSPORT.TAXI": "タクシー",
    "TRANSPORT.AIR": "航空",
    "TRANSPORT.OTHER": "その他",
    "SUBSCRIPTION.DIGITAL": "デジタルサービス",
    "SUBSCRIPTION.MEMBERSHIP": "会員費",
    "SUBSCRIPTION.CARD_FEE": "カード年会費",
    "SUBSCRIPTION.OTHER": "その他",
    "ENTERTAINMENT.HOBBY": "趣味",
    "ENTERTAINMENT.MEDIA": "メディア",
    "ENTERTAINMENT.DINING": "飲食・娯楽",
    "ENTERTAINMENT.OTHER": "その他",
    "TRAVEL.LODGING": "宿泊",
    "TRAVEL.AIR": "航空",
    "TRAVEL.TRANSPORT": "現地交通",
    "TRAVEL.OTHER": "その他",
    "EDUCATION.TUITION": "授業料",
    "EDUCATION.BOOKS": "書籍",
    "EDUCATION.OTHER": "その他",
    "TAX.TAX": "税金",
    "TAX.FEE": "手数料",
    "TAX.OTHER": "その他",
    "FINANCIAL_FEES.INTEREST": "利息",
    "FINANCIAL_FEES.FEE": "手数料",
    "FINANCIAL_FEES.OTHER": "その他",
    "PERSONAL.BEAUTY": "美容",
    "PERSONAL.FITNESS": "フィットネス",
    "PERSONAL.OTHER": "その他",
    "GIFTS_EVENTS.GIFT": "贈り物",
    "GIFTS_EVENTS.EVENT": "イベント",
    "GIFTS_EVENTS.CEREMONY": "冠婚葬祭",
    "GIFTS_EVENTS.OTHER": "その他",
    "OTHER.OTHER": "その他"
  };
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
    if(/CARLOAN|車ローン|自動車ローン|CAR_LOAN/.test(name+id))return 'GENERIC_CAR_LOAN';
    return '';
  }
  function masterNature(master){
    const key=masterKey(master);
    if(key&&masters[key])return {nature:masters[key],key:'MASTER.'+key,reason:'approved-master'};
    if(key==='GENERIC_CAR_LOAN')return {nature:'FIXED',key:'',reason:'debt-master'};
    return {nature:'REVIEW',key:'',reason:'unmapped-master'};
  }
  // User decisions on individual records win over category defaults.
  function classify({category,subcategory,source,kind,label,semantic}={}){
    const eco=String(source?.economic_type||'').toUpperCase();
    const cashflow=String(source?.cashflow_type||'').toUpperCase();
    const cat=semantic?.normalizeCategoryValue?.(category)||
      semantic?.inferCategory?.(label,category)||null;
    const sub=cat?semantic?.inferSubcategory?.(cat,label,subcategory)||'OTHER':null;
    const key=cat&&sub?cat+'.'+sub:'';
    const configured=key?ruleMap.get(key):null;
    const explicit=norm(source?.cost_nature||source?.cost_behavior||source?.fixed_variable_class);
    // Interest payments can have DEBT_INTEREST economics but are VARIABLE by
    // the user's FINANCIAL_FEES.INTEREST rule, unlike loan principal.
    if(key==='FINANCIAL_FEES.INTEREST')
      return {nature:'VARIABLE',key,reason:'approved-rule',economicType:eco||'DEBT_INTEREST'};
    if(kind==='debt'||eco==='DEBT_PRINCIPAL'||cashflow==='DEBT_PAYMENT'||cashflow==='DEBT_PRINCIPAL'){
      return {nature:'FIXED',key:key||'MASTER.DEBT_REPAYMENT',reason:'debt',economicType:'DEBT_PRINCIPAL'};
    }
    if(kind==='investment'||eco==='INVESTMENT'||cashflow==='INVESTMENT_CONTRIBUTION'){
      const ideco=/IDECO|イデコ|国民年金基金/.test(norm(label||source?.name||source?.description_raw));
      return {nature:ideco?'FIXED':'REVIEW',key:ideco?'MASTER.IDECO':'',reason:'investment',economicType:'INVESTMENT'};
    }
    if(kind==='card'){
      // A bank card settlement combines many purchases, so no merchant guess.
      return {nature:'REVIEW',key:'',reason:'card-settlement-unallocated',economicType:'TRANSFER'};
    }
    // An explicit user decision on an individual purchase always wins over
    // a default subcategory rule. Keep economics and payment channels separate.
    if(['FIXED','VARIABLE','SPECIAL','REVIEW'].includes(explicit))
      return {nature:explicit,key,reason:'record-override',economicType:eco||'EXPENSE'};
    if(configured&&configured!=='REVIEW')
      return {nature:configured,key,reason:'approved-rule',economicType:eco||'EXPENSE'};
    // For subcategories explicitly left to individual judgement, an existing
    // verified fixed-master link is that individual judgement. Do not let a
    // master override a user's FIXED/VARIABLE/SPECIAL subcategory selection.
    if((!configured||configured==='REVIEW')&&source?.is_fixed_expense===true&&
       String(source?.fixed_expense_master_id||'').trim())
      return {nature:'FIXED',key,reason:'verified-fixed-master-link',economicType:eco||'EXPENSE'};
    const prev=String(source?.spending_class||source?.expense_scope||source?.ordinary_or_special||'').toUpperCase();
    return {nature:prev==='SPECIAL'?'SPECIAL':'REVIEW',key,reason:'manual-review',economicType:eco||'EXPENSE'};
  }
  window.householdExpenseNatureV152={
    VERSION:152,rules:Object.fromEntries(ruleMap),subcategoryLabels:Object.freeze(subcategoryLabels),
    masters:Object.freeze(masters),classify,masterKey,masterNature,
    label:{FIXED:'固定費',VARIABLE:'変動費',SPECIAL:'特別費',REVIEW:'要確認'}
  };
})();