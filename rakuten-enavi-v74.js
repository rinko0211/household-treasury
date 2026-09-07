(function(root){
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const num=s=>{const t=String(s??'').replace(/[¥￥,\s]/g,'');return /^[-+]?\d+(\.\d+)?$/.test(t)?Number(t):null};
  const parseDateLocal=s=>{const t=String(s??'').trim();if(/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(t)){const [y,m,d]=t.split(/[\/-]/);return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}return t};
  const monthIndex=ym=>{const m=String(ym||'').match(/^(\d{4})-(\d{2})$/);return m?Number(m[1])*12+Number(m[2])-1:null};
  const ymFromIndex=i=>`${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;
  const isRakuten=s=>{const n=norm(s);return n.includes('RAKUTEN')||n.includes('楽天')};
  function nearestMonth(statementYm,month,preferFuture=false){
    const si=monthIndex(statementYm);if(si===null||!(month>=1&&month<=12))return'';
    const y=Math.floor(si/12),c=[(y-1)*12+month-1,y*12+month-1,(y+1)*12+month-1];
    if(preferFuture){const f=c.filter(i=>i>si).sort((a,b)=>a-b);return ymFromIndex(f[0]??c.sort((a,b)=>Math.abs(a-si)-Math.abs(b-si))[0])}
    c.sort((a,b)=>Math.abs(a-si)-Math.abs(b-si));return ymFromIndex(c[0]);
  }
  function weekendAdjustedDue(ym,day=27){
    const m=String(ym||'').match(/^(\d{4})-(\d{2})$/);if(!m)return'';const y=Number(m[1]),mo=Number(m[2]),last=new Date(y,mo,0).getDate(),d=Math.min(day,last),dt=new Date(y,mo-1,d);let add=0;if(dt.getDay()===6)add=2;else if(dt.getDay()===0)add=1;dt.setDate(dt.getDate()+add);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  function statementYmFrom(fileName,payMonth){
    const fm=String(fileName||'').match(/enavi(\d{4})(\d{2})/i);if(fm){const ref=`${fm[1]}-${fm[2]}`;if(Number(fm[2])===payMonth)return ref;const ri=monthIndex(ref),y=Number(fm[1]),c=[y-1,y,y+1].map(v=>v*12+payMonth-1).sort((a,b)=>Math.abs(a-ri)-Math.abs(b-ri));return ymFromIndex(c[0])}
    const y=new Date().getFullYear();return `${y}-${String(payMonth).padStart(2,'0')}`;
  }
  function analyzeRakutenEnaviV74(text,fileName,parse){
    if(typeof parse!=='function')throw new Error('CSV parser unavailable');
    const rows=parse(text),hi=rows.findIndex(r=>['利用日','利用店名・商品名','支払方法','支払月'].every(n=>r.some(c=>String(c).includes(n))));
    if(hi<0)throw new Error('楽天カードヘッダーを認識できません。');
    const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,'').normalize('NFKC').trim());
    const payHeader=h.find(x=>/^\d{1,2}月支払金額$/.test(x));if(!payHeader)throw new Error('当月支払金額列を認識できません。');
    const payMonth=Number((payHeader.match(/^(\d{1,2})月/)||[])[1]),statementYm=statementYmFrom(fileName,payMonth);
    const futureHeader=h.find(x=>/^\d{1,2}月以降請求額$/.test(x))||'';
    const obj=r=>{const o={};h.forEach((k,i)=>o[k]=r[i]??'');return o};
    const records=[];
    for(let i=hi+1;i<rows.length;i++){
      const o=obj(rows[i]);if(!o['利用日'])continue;
      const merchant=String(o['利用店名・商品名']||''),payment=String(o['支払方法']||''),date=parseDateLocal(o['利用日']),amount=num(o['利用金額']),current=num(o[payHeader]),future=futureHeader?num(o[futureHeader]):null,label=String(o['支払月']||'').normalize('NFKC').trim();
      let continuation='';if(i+1<rows.length){const n=obj(rows[i+1]);if(!n['利用日']&&String(n['利用店名・商品名']||'').includes('購入金額'))continuation=String(n['利用店名・商品名']||'')}
      const om=(continuation.match(/購入金額[：:]\\?([\d,]+)/)||[])[1],originalFromContinuation=om?Number(om.replace(/,/g,'')):null;
      const lm=label.match(/^(\d{1,2})月$/),lf=label.match(/^(\d{1,2})月以降$/);let billingMonth='';
      if(lm)billingMonth=nearestMonth(statementYm,Number(lm[1]),false);else if(lf)billingMonth=nearestMonth(statementYm,Number(lf[1]),true);else if(current!==null)billingMonth=statementYm;
      const installment=amount===null&&current!==null&&/返済方法変更|分割変更|リボ|回目/i.test(`${merchant} ${payment}`);
      records.push({date,merchant,payment,amount,currentBilled:current,futureAmount:future,billingMonth,installment,originalFromContinuation,fee:num(o['手数料/利息']),payHeader,label});
    }
    const billingLines=records.filter(r=>r.currentBilled!==null&&r.currentBilled!==0),regularPurchases=records.filter(r=>r.amount!==null),installments=records.filter(r=>r.installment),futurePurchases=records.filter(r=>r.amount!==null&&r.billingMonth&&r.billingMonth!==statementYm);
    const currentTotal=billingLines.reduce((a,r)=>a+Number(r.currentBilled||0),0);
    return{statementYm,payHeader,futureHeader,records,billingLines,regularPurchases,installments,futurePurchases,currentTotal,dueDate:weekendAdjustedDue(statementYm,27)};
  }

  if(typeof module!=='undefined'&&module.exports){module.exports={analyzeRakutenEnaviV74,weekendAdjustedDue,nearestMonth};return}
  if(!root||root.__rakutenEnaviV74)return;root.__rakutenEnaviV74=true;
  const parser=()=>root.householdCsvParserV73?.parseCsv||root.parseCsv;
  const rowNorm=s=>norm(s);
  function classify(merchant){try{return typeof classifyMerchant==='function'?classifyMerchant(merchant):{category:'UNKNOWN',ordinary_or_special:'ORDINARY',confidence:.4}}catch{return{category:'UNKNOWN',ordinary_or_special:'ORDINARY',confidence:.4}}}
  function purchaseBase(p){return [p.purchase_date,rowNorm(p.merchant_raw),Math.abs(Number(p.original_amount)||0)].join('|')}
  function applyAnalysis(st,a,file){
    st.purchaseEvents=Array.isArray(st.purchaseEvents)?st.purchaseEvents:[];st.cardBillingLines=Array.isArray(st.cardBillingLines)?st.cardBillingLines:[];st.cardSettlements=Array.isArray(st.cardSettlements)?st.cardSettlements:[];
    const purchaseCounts=new Map(),lineCounts=new Map(),seenLineIds=new Set();let added=0,updated=0,review=0;
    const purchaseByRecord=new Map();
    for(const r of a.regularPurchases){
      const c=classify(r.merchant),base=[r.date,rowNorm(r.merchant),Math.abs(Number(r.amount)||0)].join('|'),occ=(purchaseCounts.get(base)||0)+1;purchaseCounts.set(base,occ);
      const existing=st.purchaseEvents.find(p=>isRakuten(p.card)&&purchaseBase(p)===base&&Number(p.occurrence_index||1)===occ);
      if(existing){
        const oldMonth=existing.billing_month;Object.assign(existing,{card:'Rakuten',source_file:file.name,purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:rowNorm(r.merchant),original_amount:Math.abs(Number(r.amount)||0),payment_method:r.payment,billing_month:r.billingMonth||oldMonth||null,occurrence_index:occ,billing_month_source:'CSV_PAYMENT_ROW_V74'});updated++;purchaseByRecord.set(r,existing);
      }else{
        const id=(typeof hash32==='function'?hash32(['Rakuten',r.date,rowNorm(r.merchant),Math.abs(Number(r.amount)||0),occ].join('|')):`rakuten:${Date.now()}:${occ}`),p={purchase_id:id,card:'Rakuten',source_file:file.name,purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:rowNorm(r.merchant),original_amount:Math.abs(Number(r.amount)||0),category:c.category,ordinary_or_special:c.ordinary_or_special,payment_method:r.payment,billing_month:r.billingMonth||null,confidence:c.confidence,occurrence_index:occ,billing_month_source:'CSV_PAYMENT_ROW_V74'};st.purchaseEvents.push(p);added++;purchaseByRecord.set(r,p);if(Number(c.confidence)<.7)review++;
      }
    }
    for(const r of a.billingLines){
      const original=Math.abs(Number(r.amount??r.originalFromContinuation??r.currentBilled)||0),base=[a.statementYm,r.date,rowNorm(r.merchant),original,rowNorm(r.payment),r.installment?'A':'P'].join('|'),occ=(lineCounts.get(base)||0)+1;lineCounts.set(base,occ);const raw=[base,occ].join('|'),id=`rakuten-bill:${a.statementYm}:${typeof hash32==='function'?hash32(raw):raw}`;seenLineIds.add(id);
      const linked=purchaseByRecord.get(r),line={billing_line_id:id,card:'Rakuten',billing_month:a.statementYm,purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:rowNorm(r.merchant),original_amount:original,billed_amount:Number(r.currentBilled)||0,payment_method:r.payment,occurrence_index:occ,line_kind:r.installment?'INSTALLMENT':'PURCHASE',installment_fee:Number(r.fee)||0,source_files:[file.name],source_file:file.name,confidence:.99,billing_model:'RAKUTEN_ENAVI_V74'};if(linked){line.purchase_id=linked.purchase_id;line.category=linked.category||null;line.subcategory=linked.subcategory||null;line.fixed_expense_master_id=linked.fixed_expense_master_id||null}
      const old=st.cardBillingLines.find(x=>String(x.billing_line_id)===id);if(old)Object.assign(old,line);else st.cardBillingLines.push(line);
    }
    st.cardBillingLines=st.cardBillingLines.filter(x=>!(isRakuten(x.card)&&String(x.billing_month||'')===a.statementYm&&String(x.source_file||'')===String(file.name)&&String(x.billing_line_id||'').startsWith(`rakuten-bill:${a.statementYm}:`)&&!seenLineIds.has(String(x.billing_line_id||''))));
    const sid=`rakuten:${a.statementYm}`,due=a.dueDate,rec={settlement_id:sid,card:'Rakuten',due_date:due,statement_due_date:`${a.statementYm}-27`,amount:Math.abs(Number(a.currentTotal)||0),principal:null,fee_interest:null,remaining_balance:null,source_file:file.name,confidence:.99,billing_line_ids:[...seenLineIds],detail_count:a.billingLines.length,detail_payment_total:a.currentTotal,detail_difference:0,detail_reconciled:true,billing_model:'RAKUTEN_ENAVI_V74',due_date_source:'STATEMENT_WEEKEND_ADJUSTED'};
    const oldS=st.cardSettlements.find(x=>String(x.settlement_id||'')===sid);if(oldS)Object.assign(oldS,rec);else st.cardSettlements.push(rec);
    const actual=oldS?.bank_transaction_id?(st.cashTransactions||[]).find(t=>String(t.id)===String(oldS.bank_transaction_id)):null;if(actual?.date){const s=st.cardSettlements.find(x=>String(x.settlement_id||'')===sid);s.due_date=actual.date;s.due_date_source='BANK_ACTUAL'}
    return{added,updated,review,billingLines:a.billingLines.length,installmentLines:a.installments.length,futurePurchases:a.futurePurchases.length,currentTotal:a.currentTotal,detectedBillingMonth:a.statementYm,dueDate:st.cardSettlements.find(x=>String(x.settlement_id||'')===sid)?.due_date||due,source:'楽天カード'};
  }
  if(typeof parseRakutenCard==='function'){
    parseRakutenCard=function parseRakutenCardV74(src,file){const a=analyzeRakutenEnaviV74(src.text,file.name,parser());const st=typeof state!=='undefined'?state:null;if(!st)throw new Error('家計データを取得できません。');return applyAnalysis(st,a,file)};
  }
  if(typeof importOne==='function'){
    const previousImport=importOne;
    importOne=async function importOneV74(file){
      const buf=await file.arrayBuffer(),src=detectSource(file,buf);if(src.type!=='rakuten_card')return previousImport(file);
      const sha=await fileHash(buf),a=analyzeRakutenEnaviV74(src.text,file.name,parser()),result=applyAnalysis(state,a,file),now=new Date().toISOString();state.imports=Array.isArray(state.imports)?state.imports:[];let rec=state.imports.find(x=>String(x.sha256||'')===sha);if(!rec){rec={};state.imports.unshift(rec)}Object.assign(rec,{at:now,file:file.name,sha256:sha,type:'rakuten_card',read:a.records.length,duplicates:0,reprocessed:!!rec.at,...result});try{save()}catch{}setTimeout(()=>{try{root.renderCardClaimsV56?.();root.renderCardImportCorrectionsV73?.()}catch{}},0);return{read:a.records.length,duplicates:0,reprocessed:true,...result}
    };
  }
  root.householdRakutenEnaviV74={analyze:(text,fileName)=>analyzeRakutenEnaviV74(text,fileName,parser())};
})(typeof window!=='undefined'?window:null);
