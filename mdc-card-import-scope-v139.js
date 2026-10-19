(() => {
  if(window.__mdcScopedCardImportV139)return;
  window.__mdcScopedCardImportV139=true;

  const headerName='MDCカード識別子';
  const legacyName='MDC旧版CSVファイル';
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
  const stateNow=()=>typeof state!=='undefined'?state:(window.getTreasuryStateRaw||window.getTreasuryState)?.();
  const cardIdentity=s=>String(s||'').normalize('NFKC').trim().slice(0,70);
  const recordSignature=(date,merchant,amount)=>[date,norm(merchant),Math.abs(Number(amount)||0)].join('|');
  const installmentOf=x=>Math.max(0,Number(x?.installment_number??x?.installment??0)||0);
  const lineKey=(date,merchant,amount,installment)=>recordSignature(date,merchant,amount)+'|'+(Number(installment)||0);
  const isMdcCard=x=>norm(x?.card)==='MUFGDCJAL';
  const isOldPdf=x=>/^MDC_PDF_/i.test(String(x?.source_file||''));

  function readRows(src) {
    const rows=parseCsv(src.text),hi=findHeader(rows,['確定情報','ご利用日','ご利用金額（円）']);
    if(hi<0)throw Error('MDCカード明細のCSV形式を認識できません。');
    const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,''));
    if(!h.includes(headerName))return null;
    const all=[];let total=0,identity='',bill='';
    for(const row of rows.slice(hi+1)) {
      const o=rowObj(h,row);
      if(String(o['確定情報']||'').trim()!=='確定')continue;
      const date=parseDate(o['ご利用日']),merchant=String(o['ご利用店名（海外ご利用店名／海外都市名）']||'').trim();
      const amount=number(o['ご利用金額（円）']),id=cardIdentity(o[headerName]);
      const paid=parseDate(o['お支払日']),billing_month=String(paid||'').slice(0,7);
      if(!validDate(date)||!merchant||!Number.isSafeInteger(amount)||amount<=0||!id||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(billing_month))
        throw Error('MDC-D01: 明細の必須項目が不正です。保存しません。');
      if(identity&&identity!==id)throw Error('MDC-D02: 1ファイル内に異なるカード識別子があります。');
      if(bill&&bill!==billing_month)throw Error('MDC-D03: 1ファイル内に異なる請求月があります。');
      identity=id;bill=billing_month;total+=amount;
      all.push({date,merchant,amount,identity:id,billing_month,oldFilename:String(o[legacyName]||'').trim(),
        count:number(o['支払回数'])||1,installment:number(o['何回目'])||0,
        key:lineKey(date,merchant,amount,number(o['何回目'])||0)});
    }
    if(!all.length)throw Error('MDC-D04: 有効なMDC明細がありません。');
    return {all,identity,billing_month:bill,total};
  }

  function planScopedMdc(src,file,st=stateNow()) {
    const parsed=readRows(src);
    if(!parsed)return null;
    if(!st||!Array.isArray(st.purchaseEvents))throw Error('保存先の支出データを取得できません。');
    const {all,identity,billing_month,total}=parsed;
    // Restrict matches to the same physical card. Never equate separate JAL cards
    // merely because their dates/merchant/amounts coincide.
    const used=new Set(),inserts=[],upgrades=[],matches=[];
    const current=st.purchaseEvents||[];
    for(const row of all) {
      const options=current.map((p,index)=>({p,index})).filter(({p})=>
        isMdcCard(p)&&lineKey(p.purchase_date,p.merchant_raw||p.merchant_normalized,p.original_amount,installmentOf(p))===row.key);
      const ours=options.find(({p,index})=>!used.has(index)&&cardIdentity(p.pdf_card_identity)===identity);
      if(ours){used.add(ours.index);matches.push(ours.index);continue;}
      const foreign=options.filter(({p})=>cardIdentity(p.pdf_card_identity)&&cardIdentity(p.pdf_card_identity)!==identity);
      // Exact old synthetic filename is strongest evidence of a legacy import.
      const exact=options.find(({p,index})=>!used.has(index)&&!p.pdf_card_identity&&
        row.oldFilename&&String(p.source_file||'')===row.oldFilename);
      const legacy=exact||(!foreign.length&&options.find(({p,index})=>
        !used.has(index)&&!p.pdf_card_identity&&
        String(p.billing_month||'')===billing_month&&
        (isOldPdf(p)||isMdcCard(p))));
      if(legacy) {
        used.add(legacy.index);
        upgrades.push({index:legacy.index,identity});
        matches.push(legacy.index);
        continue;
      }
      // A different stored card identity with identical purchase evidence is an
      // ambiguity, not proof of a new purchase. Fail atomically, ask the user to
      // select the previously used physical card identity.
      if(foreign.length)
        throw Error('MDC-D05: 同じ利用明細が別のカード識別名「'+
          cardIdentity(foreign[0].p.pdf_card_identity)+'」で登録済みです。前回と同じカード識別名を選ぶか、別カードであることを確認してください。追加登録は行っていません。');
      inserts.push(row);
    }
    return {parsed,inserts,upgrades,matches,
      summary:{source:'MDC/JAL PDF',read:all.length,added:inserts.length,
        duplicates:matches.length,upgraded:upgrades.length,review:0,
        statementTotal:total,billing_month,identity,
        importedMonths:[...new Set(all.map(r=>r.date.slice(0,7)))].sort(),
        scopedDedup:true,incrementalDedupV144:true}};
  }

  function parseScopedMdc(src,file) {
    const st=stateNow(),plan=planScopedMdc(src,file,st);
    if(!plan)return null;
    // Full-file validation and matching complete before the first mutation.
    for(const change of plan.upgrades){
      const p=st.purchaseEvents[change.index];
      p.pdf_card_identity=change.identity;
      p.pdf_statement_migrated_v144=true;
    }
    let review=0;
    const inFileCount=new Map();
    for(const r of plan.parsed.all){
      inFileCount.set(r.key,(inFileCount.get(r.key)||0)+1);
      r.position=inFileCount.get(r.key);
    }
    for(const r of plan.inserts){
      const category=classifyMerchant(r.merchant);
      const scope=String(category.ordinary_or_special||'ORDINARY').toUpperCase()==='SPECIAL'?'SPECIAL':'NORMAL';
      const purchaseId=hash32(['MDC-PDF-SEMANTIC-V144',r.identity,r.key,r.position].join('|'));
      const x={
        purchase_id:purchaseId,occurrence_index:r.position,
        card:'MUFG/DC/JAL',pdf_card_identity:r.identity,source_file:file.name,
        purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:normalizeText(r.merchant),
        original_amount:r.amount,billing_month:r.billing_month,
        installment_count:r.count,installment_number:r.installment||null,
        payment_method:String(r.count)+(r.installment?(' '+r.installment):''),
        record_kind:'CARD_PURCHASE',economic_type:'EXPENSE',
        ordinary_or_special:scope,expense_scope:scope,spending_class:scope,
        category:category.category||'UNKNOWN',subcategory:null,confidence:category.confidence||.4,
        mdc_semantic_key_v144:r.key,mdc_incremental_import_v144:true
      };
      st.purchaseEvents.push(x);
      if(x.confidence<.7&&typeof addReview==='function'){
        addReview({source:x.card,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});review++;
      }
    }
    return {...plan.summary,review,autoClassified:plan.inserts.length-review,
      latest:plan.parsed.all.map(x=>x.date).sort().at(-1)};
  }

  // Audit only: same-card, same-statement exact semantic rows imported from
  // multiple source PDFs. Cannot prove a duplicate when a user genuinely made
  // identical transactions, so never silently remove or relabel stored rows.
  function auditDuplicates(st=stateNow()) {
    const byKey=new Map(),groups=[];
    for(const [index,p] of (st?.purchaseEvents||[]).entries()) {
      if(!isMdcCard(p))continue;
      const identity=cardIdentity(p.pdf_card_identity),bill=String(p.billing_month||'');
      if(!identity||!bill)continue;
      const key=identity+'|'+bill+'|'+lineKey(p.purchase_date,p.merchant_raw||p.merchant_normalized,p.original_amount,installmentOf(p));
      const list=byKey.get(key)||[];list.push({index,id:p.purchase_id,source_file:p.source_file,
        date:p.purchase_date,merchant:p.merchant_raw,amount:Math.abs(Number(p.original_amount)||0),identity});
      byKey.set(key,list);
    }
    for(const [key,records] of byKey){
      if(records.length<2)continue;
      const files=new Set(records.map(x=>String(x.source_file||'')));
      if(files.size>1)groups.push({key,records,reason:'異なる取込ファイルで同一カード・同一利用情報'});
    }
    return groups.sort((a,b)=>b.records.length-a.records.length);
  }

  if(typeof parseMufg==='function'){
    const previous=parseMufg;
    parseMufg=function parseMufgScopedV144(src,file){
      const result=parseScopedMdc(src,file);
      return result||previous(src,file);
    };
  }
  window.householdMdcScopedCardV139={
    parseScopedMdc,recordSignature,
    dryRun:(src,file,st)=>planScopedMdc(src,file,st).summary,
    auditDuplicates,planScopedMdc
  };
})();