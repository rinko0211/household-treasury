(() => {
  const VERSION=1;
  const VALID_ECONOMIC=new Set(['INCOME','EXPENSE','TRANSFER','INVESTMENT','DEBT_PRINCIPAL','DEBT_INTEREST','UNKNOWN']);
  const VALID_SPENDING=new Set(['NORMAL','SPECIAL']);
  const CATEGORY_DEFS={
    HOUSING:{label:'住居',defaultSpending:'NORMAL',subs:['RENT_MORTGAGE','HOME_MAINTENANCE','OTHER']},
    UTILITIES:{label:'公共料金',defaultSpending:'NORMAL',subs:['ELECTRICITY','WATER','GAS','OTHER']},
    COMMUNICATION:{label:'通信',defaultSpending:'NORMAL',subs:['MOBILE','INTERNET','OTHER']},
    FOOD:{label:'食費',defaultSpending:'NORMAL',subs:['GROCERIES','EATING_OUT','CAFE','OTHER']},
    DAILY_GOODS:{label:'日用品',defaultSpending:'NORMAL',subs:['HOUSEHOLD','CLOTHING','OTHER']},
    CHILD:{label:'子ども',defaultSpending:'NORMAL',subs:['CHILDCARE','SCHOOL','GOODS','OTHER']},
    MEDICAL:{label:'医療',defaultSpending:'NORMAL',subs:['CLINIC','DENTAL','CONTACTS','PHARMACY','OTHER']},
    INSURANCE:{label:'保険',defaultSpending:'NORMAL',subs:['LIFE','AUTO','OTHER']},
    CAR:{label:'車',defaultSpending:'NORMAL',subs:['FUEL','MAINTENANCE','PARKING','TOLL','OTHER']},
    TRANSPORT:{label:'交通',defaultSpending:'NORMAL',subs:['TRAIN','BUS','TAXI','AIR','OTHER']},
    SUBSCRIPTION:{label:'サブスク・会費',defaultSpending:'NORMAL',subs:['DIGITAL','MEMBERSHIP','CARD_FEE','OTHER']},
    ENTERTAINMENT:{label:'娯楽',defaultSpending:'NORMAL',subs:['HOBBY','MEDIA','DINING','OTHER']},
    TRAVEL:{label:'旅行',defaultSpending:'SPECIAL',subs:['LODGING','AIR','TRANSPORT','OTHER']},
    EDUCATION:{label:'教育',defaultSpending:'NORMAL',subs:['TUITION','BOOKS','OTHER']},
    TAX:{label:'税・公的負担',defaultSpending:'SPECIAL',subs:['TAX','FEE','OTHER']},
    FINANCIAL_FEES:{label:'金融手数料',defaultSpending:'NORMAL',subs:['INTEREST','FEE','OTHER']},
    PERSONAL:{label:'個人',defaultSpending:'NORMAL',subs:['BEAUTY','FITNESS','OTHER']},
    OTHER:{label:'その他',defaultSpending:'NORMAL',subs:['OTHER']}
  };
  const CATEGORY_ALIASES={
    FOOD:'FOOD',GROCERY:'FOOD',GROCERIES:'FOOD',EATING_OUT:'FOOD',RESTAURANT:'FOOD',CAFE:'FOOD',
    UTILITY:'UTILITIES',UTILITIES:'UTILITIES',UTILITY_ELECTRICITY:'UTILITIES',ELECTRICITY:'UTILITIES',WATER:'UTILITIES',GAS:'UTILITIES',
    PHONE:'COMMUNICATION',MOBILE:'COMMUNICATION',INTERNET:'COMMUNICATION',WIFI:'COMMUNICATION',COMMUNICATION:'COMMUNICATION',
    INSURANCE:'INSURANCE',AUTO_INSURANCE:'INSURANCE',LIFE_INSURANCE:'INSURANCE',
    CAR:'CAR',AUTO:'CAR',FUEL:'CAR',GASOLINE:'CAR',PARKING:'CAR',TOLL:'CAR',
    DAILY_GOODS:'DAILY_GOODS',HOUSEHOLD:'DAILY_GOODS',SHOPPING:'DAILY_GOODS',
    CHILD:'CHILD',CHILDCARE:'CHILD',KIDS:'CHILD',
    MEDICAL:'MEDICAL',HEALTH:'MEDICAL',DENTAL:'MEDICAL',CONTACT:'MEDICAL',CONTACTS:'MEDICAL',PHARMACY:'MEDICAL',
    SUBSCRIPTION:'SUBSCRIPTION',SUBSCRIPTIONS:'SUBSCRIPTION',MEMBERSHIP:'SUBSCRIPTION',
    TRAVEL:'TRAVEL',HOTEL:'TRAVEL',
    TRANSPORT:'TRANSPORT',TRANSPORTATION:'TRANSPORT',TRAIN:'TRANSPORT',TAXI:'TRANSPORT',AIR:'TRANSPORT',
    EDUCATION:'EDUCATION',SCHOOL:'EDUCATION',
    ENTERTAINMENT:'ENTERTAINMENT',HOBBY:'ENTERTAINMENT',
    HOUSING:'HOUSING',RENT:'HOUSING',MORTGAGE:'HOUSING',
    TAX:'TAX',TAXES:'TAX',
    FINANCIAL_FEES:'FINANCIAL_FEES',FEE:'FINANCIAL_FEES',INTEREST:'FINANCIAL_FEES',
    PERSONAL:'PERSONAL',BEAUTY:'PERSONAL',FITNESS:'PERSONAL',
    OTHER:'OTHER',UNKNOWN:'OTHER'
  };
  const INTERNAL_CATEGORY_TOKENS=new Set([
    'CARD_SETTLEMENT','BANK_TRANSACTION','CARD_PURCHASE','MASTER_FIXED','MASTER_ANNUAL','FUTURE_EVENT','FUTURE_INCOME','FUTURE_EXPENSE',
    'INVESTMENT_CONTRIBUTION','DEBT_PRINCIPAL','DEBT_INTEREST','TRANSFER','CASH_WITHDRAWAL_UNCLASSIFIED','SALARY','FIXED','RULE'
  ]);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const normalizeCategoryValue=v=>{
    const raw=String(v??'').trim().toUpperCase();
    if(!raw||INTERNAL_CATEGORY_TOKENS.has(raw)||raw.startsWith('MASTER_')||raw.startsWith('CARD_')||raw.startsWith('FUTURE_'))return null;
    if(CATEGORY_DEFS[raw])return raw;
    return CATEGORY_ALIASES[raw]||null;
  };
  const canonicalSpending=(o,defaultValue=null)=>{
    for(const v of [o?.spending_class,o?.expense_scope,o?.ordinary_or_special]){
      const s=String(v||'').toUpperCase();
      if(s==='ORDINARY'||s==='NORMAL')return'NORMAL';
      if(s==='SPECIAL')return'SPECIAL';
    }
    return defaultValue;
  };
  function inferCategory(name,existing){
    const mapped=normalizeCategoryValue(existing);if(mapped)return mapped;
    const n=norm(name);
    const rules=[
      ['UTILITIES',/(電気|デンキ|ELECTRIC|水道|スイドウ|GAS|ガス)/],
      ['COMMUNICATION',/(DOCOMO|ドコモ|AU|SOFTBANK|ソフトバンク|楽天モバイル|RAKUTENMOBILE|WIFI|WI-FI|INTERNET|光回線)/],
      ['INSURANCE',/(保険|ホケン|METLIFE|メットライフ)/],
      ['MEDICAL',/(病院|医院|クリニック|歯科|薬局|メルス|CONTACT|コンタクト)/],
      ['CAR',/(ガソリン|GASOLINE|ENEOS|エネオス|出光|IDEMITSU|タイヤ|車検|駐車|高速|ETC|自動車|クルマ|CAR)/],
      ['SUBSCRIPTION',/(APPLE|GOOGLE|NETFLIX|SPOTIFY|AMAZONPRIME|YOUTUBE|年会費|会費|サブスク)/],
      ['FOOD',/(スーパー|AEON|イオン|イトーヨーカ|コンビニ|セブン|LAWSON|ローソン|FAMILYMART|ファミリーマート|RESTAURANT|レストラン|CAFE|カフェ)/],
      ['CHILD',/(保育|幼稚園|こども|子供|キッズ|BABY|ベビー)/],
      ['TRAVEL',/(HOTEL|ホテル|旅館|AIRBNB|JAL|ANA|航空|旅行)/],
      ['TRANSPORT',/(JR|鉄道|電車|タクシー|TAXI|バス)/],
      ['EDUCATION',/(学校|塾|教材|BOOK|書籍|受験|TOEIC|英検)/],
      ['HOUSING',/(家賃|住宅|MORTGAGE|RENT)/],
      ['PERSONAL',/(ジム|GYM|美容|理容|フィットネス)/]
    ];
    return rules.find(([,re])=>re.test(n))?.[0]||null;
  }
  function inferSubcategory(category,name,existing){
    const raw=String(existing||'').toUpperCase();if(raw&&CATEGORY_DEFS[category]?.subs.includes(raw))return raw;
    const n=norm(name);
    if(category==='UTILITIES')return /水道|スイドウ/.test(n)?'WATER':/ガス|GAS/.test(n)?'GAS':/電気|デンキ|ELECTRIC/.test(n)?'ELECTRICITY':'OTHER';
    if(category==='COMMUNICATION')return /WIFI|WI-FI|INTERNET|光回線/.test(n)?'INTERNET':'MOBILE';
    if(category==='INSURANCE')return /車|自動車|AUTO/.test(n)?'AUTO':'OTHER';
    if(category==='CAR')return /ガソリン|GASOLINE|ENEOS|エネオス|IDEMITSU|出光/.test(n)?'FUEL':/タイヤ|車検|整備|MAINT/.test(n)?'MAINTENANCE':/駐車/.test(n)?'PARKING':/ETC|高速/.test(n)?'TOLL':'OTHER';
    if(category==='MEDICAL')return /歯/.test(n)?'DENTAL':/メルス|CONTACT|コンタクト/.test(n)?'CONTACTS':/薬局/.test(n)?'PHARMACY':'CLINIC';
    if(category==='SUBSCRIPTION')return /年会費|CARD/.test(n)?'CARD_FEE':/APPLE|GOOGLE|NETFLIX|SPOTIFY|YOUTUBE/.test(n)?'DIGITAL':'OTHER';
    if(category==='TRAVEL')return /HOTEL|ホテル|旅館|AIRBNB/.test(n)?'LODGING':/JAL|ANA|航空/.test(n)?'AIR':'OTHER';
    if(category==='FOOD')return /CAFE|カフェ/.test(n)?'CAFE':/RESTAURANT|レストラン/.test(n)?'EATING_OUT':'OTHER';
    return category?'OTHER':null;
  }
  function economicFromLegacy(o,{kind='',amount=0}={}){
    const explicit=String(o?.economic_type||'').toUpperCase();if(VALID_ECONOMIC.has(explicit))return explicit;
    const cf=String(o?.cashflow_type||o?.type||o?.future_kind||'').toUpperCase();
    const scope=String(o?.expense_scope||o?.ordinary_or_special||'').toUpperCase();
    if(kind==='CARD_SETTLEMENT'||cf==='CARD_SETTLEMENT')return'TRANSFER';
    if(cf==='INVESTMENT_CONTRIBUTION'||scope==='INVESTMENT'||cf.includes('INVESTMENT'))return'INVESTMENT';
    if(cf==='DEBT_INTEREST'||cf.includes('INTEREST'))return'DEBT_INTEREST';
    if(cf==='DEBT_PRINCIPAL'||scope==='DEBT'||cf.includes('DEBT')||cf.includes('LOAN'))return'DEBT_PRINCIPAL';
    if(scope==='TRANSFER'||cf==='TRANSFER'||o?.is_transfer)return'TRANSFER';
    if(kind==='CARD_PURCHASE')return'EXPENSE';
    if(cf==='INCOME'||cf==='SALARY'||scope==='INCOME'||Number(amount)>0)return'INCOME';
    if(Number(amount)<0)return'EXPENSE';
    return'UNKNOWN';
  }
  function setIfDiff(obj,key,val){if(obj[key]===val)return false;obj[key]=val;return true}
  function cleanLegacyScope(obj,economic,spending){
    let changed=false;
    if(economic==='EXPENSE'){
      const s=spending||'NORMAL';changed=setIfDiff(obj,'spending_class',s)||changed;changed=setIfDiff(obj,'expense_scope',s)||changed;changed=setIfDiff(obj,'ordinary_or_special',s)||changed;
    }else{
      changed=setIfDiff(obj,'spending_class',null)||changed;
      const legacy=economic==='INVESTMENT'?'INVESTMENT':economic.startsWith('DEBT_')?'DEBT':economic==='TRANSFER'?'TRANSFER':economic==='INCOME'?'INCOME':null;
      if(legacy){changed=setIfDiff(obj,'expense_scope',legacy)||changed;changed=setIfDiff(obj,'ordinary_or_special',legacy)||changed}
    }
    return changed;
  }
  function migrateRecord(obj,{recordKind,name,amount,allowCategory=true}={}){
    let changed=false;changed=setIfDiff(obj,'record_kind',recordKind)||changed;
    const economic=economicFromLegacy(obj,{kind:recordKind,amount});changed=setIfDiff(obj,'economic_type',economic)||changed;
    const defaultSpend=economic==='EXPENSE'?(canonicalSpending(obj)||null):null;
    changed=cleanLegacyScope(obj,economic,defaultSpend)||changed;
    if(allowCategory&&economic==='EXPENSE'){
      const category=inferCategory(name,obj.category);const sub=inferSubcategory(category,name,obj.subcategory);
      if(category)changed=setIfDiff(obj,'category',category)||changed;else if(normalizeCategoryValue(obj.category)===null&&obj.category!=null)changed=setIfDiff(obj,'category',null)||changed;
      if(sub)changed=setIfDiff(obj,'subcategory',sub)||changed;
    }else{
      if(obj.category&&INTERNAL_CATEGORY_TOKENS.has(String(obj.category).toUpperCase()))changed=setIfDiff(obj,'category',null)||changed;
      if(economic!=='EXPENSE'){changed=setIfDiff(obj,'category',null)||changed;changed=setIfDiff(obj,'subcategory',null)||changed}
    }
    return changed;
  }
  function migrateMaster(m){
    let changed=false;const name=String(m.name||'');changed=setIfDiff(m,'template_kind','SCHEDULE')||changed;
    let economic=String(m.economic_type||'').toUpperCase();
    if(!VALID_ECONOMIC.has(economic)||economic==='UNKNOWN')economic=economicFromLegacy(m,{kind:'SCHEDULE',amount:-Math.abs(Number(m.amount)||0)});
    if(economic==='INCOME')economic='EXPENSE';
    changed=setIfDiff(m,'economic_type',economic)||changed;
    const cadence=String(m.cadence||'MONTHLY').toUpperCase(),defaultSpend=cadence==='ANNUAL'?'SPECIAL':'NORMAL';
    changed=cleanLegacyScope(m,economic,economic==='EXPENSE'?(canonicalSpending(m,defaultSpend)||defaultSpend):null)||changed;
    if(economic==='EXPENSE'){
      const category=inferCategory(name,m.category),sub=inferSubcategory(category,name,m.subcategory);
      if(category)changed=setIfDiff(m,'category',category)||changed;if(sub)changed=setIfDiff(m,'subcategory',sub)||changed;
    }else{changed=setIfDiff(m,'category',null)||changed;changed=setIfDiff(m,'subcategory',null)||changed}
    return changed;
  }
  function migrateAutomationRules(st){
    st.automationRules=Array.isArray(st.automationRules)?st.automationRules:[];let changed=false;
    for(const old of st.reviewRules||[]){
      const id=`legacy:${old.id||norm(old.match_key||old.match_name)}`;
      if(st.automationRules.some(r=>r.id===id))continue;
      const economic=String(old.economic_type||'').toUpperCase();
      const category=normalizeCategoryValue(old.category),spending=canonicalSpending(old);
      st.automationRules.push({id,active:old.active!==false,match:{kind:old.kind||null,key:old.match_key||null,name:old.match_name||null},actions:{economic_type:VALID_ECONOMIC.has(economic)?economic:null,spending_class:spending,category,subcategory:old.subcategory||null},source:'reviewRules-v40-migration',createdAt:old.created_at||new Date().toISOString()});changed=true;
    }
    return changed;
  }
  function migrateState(st){
    if(!st||typeof st!=='object')return false;let changed=false;
    st.masters=st.masters||{};st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];
    for(const p of st.purchaseEvents||[])changed=migrateRecord(p,{recordKind:'CARD_PURCHASE',name:p.merchant_raw||p.merchant_normalized,amount:-Math.abs(Number(p.original_amount)||0)})||changed;
    for(const t of st.cashTransactions||[])changed=migrateRecord(t,{recordKind:'BANK_TRANSACTION',name:t.description_raw||t.description,amount:Number(t.amount)||0})||changed;
    for(const s of st.cardSettlements||[])changed=migrateRecord(s,{recordKind:'CARD_SETTLEMENT',name:`${s.card||''}カード支払`,amount:-Math.abs(Number(s.amount)||0),allowCategory:false})||changed;
    for(const x of st.investmentEvents||[])changed=migrateRecord(x,{recordKind:'INVESTMENT_TRANSACTION',name:x.security_name||x.symbol||x.asset_type,amount:Number(x.amount)||0,allowCategory:false})||changed;
    for(const e of st.events||[])changed=migrateRecord(e,{recordKind:'SCHEDULE',name:e.name||'',amount:Number(e.amount)||0})||changed;
    for(const m of st.masters.fixedExpenses)changed=migrateMaster(m)||changed;
    changed=migrateAutomationRules(st)||changed;
    if(st.semanticModelVersion!==VERSION){st.semanticModelVersion=VERSION;changed=true}
    return changed;
  }
  function ruleKey(kind,o){
    const name=kind==='purchase'?(o.merchant_raw||o.merchant_normalized):(o.description_raw||o.description);
    return `${kind}|${norm(name)}`;
  }
  function applyAutomationRules(st){
    const rules=(st.automationRules||[]).filter(r=>r.active!==false),apply=(kind,o)=>{
      const key=ruleKey(kind,o),name=norm(kind==='purchase'?(o.merchant_raw||o.merchant_normalized):(o.description_raw||o.description));
      const hits=rules.filter(r=>{const mk=String(r.match?.key||'');if(mk&&mk===key)return true;const mn=norm(r.match?.name||'');return !!mn&&mn===name});
      if(hits.length!==1)return false;const a=hits[0].actions||{};let ch=false;
      if(a.economic_type&&VALID_ECONOMIC.has(a.economic_type))ch=setIfDiff(o,'economic_type',a.economic_type)||ch;
      if(a.spending_class&&VALID_SPENDING.has(a.spending_class)&&String(o.economic_type)==='EXPENSE')ch=setIfDiff(o,'spending_class',a.spending_class)||ch;
      if(a.category&&CATEGORY_DEFS[a.category]&&String(o.economic_type)==='EXPENSE')ch=setIfDiff(o,'category',a.category)||ch;
      if(a.subcategory&&String(o.economic_type)==='EXPENSE')ch=setIfDiff(o,'subcategory',a.subcategory)||ch;
      if(ch)cleanLegacyScope(o,o.economic_type,o.spending_class);return ch;
    };
    let changed=false;(st.purchaseEvents||[]).forEach(o=>changed=apply('purchase',o)||changed);(st.cashTransactions||[]).forEach(o=>changed=apply('cash',o)||changed);return changed;
  }
  let replacing=false;
  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'){
    window.replaceTreasuryState=function replaceSemanticV47(next){
      if(!replacing){replacing=true;try{migrateState(next);applyAutomationRules(next)}finally{replacing=false}}
      return previousReplace(next);
    };
  }
  const previousImportOne=typeof importOne==='function'?importOne:null;
  if(previousImportOne){
    importOne=async function importSemanticV47(file){
      const result=await previousImportOne(file),st=stateNow();const changed=migrateState(st)|applyAutomationRules(st);
      if(changed){window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('分類モデル更新済み・同期中');window.cloudSyncOnLocalSave?.()}
      result.semanticNormalized=true;return result;
    };
  }
  function annotateEvent(e,st){
    const out={...e};out.record_kind='FORECAST_EVENT';
    let economic='UNKNOWN',spending=null,category=null,subcategory=null,template=null;
    if(e.master_id)template=(st.masters?.fixedExpenses||[]).find(m=>String(m.id)===String(e.master_id));
    if(template){economic=template.economic_type||'EXPENSE';spending=template.spending_class||null;category=template.category||null;subcategory=template.subcategory||null}
    else if(e.source==='card_settlement'||String(e.type||'').toUpperCase()==='CARD_SETTLEMENT')economic='TRANSFER';
    else if(e.source==='settings_salary'||Number(e.amount)>0)economic='INCOME';
    else economic=economicFromLegacy(e,{kind:'FORECAST_EVENT',amount:Number(e.amount)||0});
    out.economic_type=economic;out.spending_class=economic==='EXPENSE'?(spending||canonicalSpending(e,'NORMAL')):null;
    out.category=economic==='EXPENSE'?(category||inferCategory(e.name,e.category)):null;out.subcategory=economic==='EXPENSE'?(subcategory||inferSubcategory(out.category,e.name,e.subcategory)):null;
    return out;
  }
  const previousGenerated=typeof generated==='function'?generated:null;
  if(previousGenerated){
    generated=function generatedSemanticV47(days=90){const st=stateNow();return previousGenerated(days).map(e=>annotateEvent(e,st))};
  }
  function monthEconomicTotalsV47(month=null){
    const st=stateNow(),m=month||new Date().toISOString().slice(0,7);let ordinary=0,special=0,investment=0,debt=0,transfer=0,income=0;
    const add=(o,amount,date)=>{if(!String(date||'').startsWith(m))return;const a=Math.abs(Number(amount)||0),economic=String(o.economic_type||economicFromLegacy(o,{amount:Number(amount)||0}));if(!a)return;
      if(economic==='EXPENSE'){if(String(o.spending_class||canonicalSpending(o,'NORMAL'))==='SPECIAL')special+=a;else ordinary+=a}
      else if(economic==='INVESTMENT')investment+=a;else if(economic==='DEBT_PRINCIPAL'||economic==='DEBT_INTEREST')debt+=a;else if(economic==='TRANSFER')transfer+=a;else if(economic==='INCOME')income+=a;
    };
    (st.purchaseEvents||[]).forEach(p=>add(p,p.original_amount,p.purchase_date));
    (st.cashTransactions||[]).forEach(t=>{if(t.bank_transaction_id||t.linked_event_id&&String(t.cashflow_type)==='CARD_SETTLEMENT'){}add(t,t.amount,t.date)});
    return{ordinary,special,investment,debt,transfer,income};
  }
  try{monthEconomicTotals=monthEconomicTotalsV47}catch{}
  function boot(){
    const st=stateNow(),changed=migrateState(st)|applyAutomationRules(st);
    if(changed){window.treasuryRecoverySnapshot?.('分類モデルv47移行直前');window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('分類モデルv47移行済み・同期中');window.cloudSyncOnLocalSave?.()}
  }
  window.householdSemanticV47={VERSION,CATEGORY_DEFS,VALID_ECONOMIC:[...VALID_ECONOMIC],VALID_SPENDING:[...VALID_SPENDING],normalizeCategoryValue,inferCategory,inferSubcategory,migrateState,applyAutomationRules,monthEconomicTotals:monthEconomicTotalsV47,ruleKey};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
