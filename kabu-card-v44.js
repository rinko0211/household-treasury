(() => {
  const CARD_NAME='KABU&';
  const SOURCE_LABEL='KABU&カード';
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/]/g,'').toUpperCase();
  const isKabuCard=x=>/^(?:KABU&|KABUAND|カブアンド|株アンド)(?:カード|CARD)?$/i.test(norm(x?.card||''));
  const counted=x=>x?.count_in_spending!==false&&x?.reconciliation_status!=='ABSORBED_DUPLICATE';
  // The purchase identity is independent of statement month, export filename,
  // or payment presentation. Two genuinely identical purchases in one file
  // are preserved by their occurrence index, not collapsed by their key.
  const usageKey=x=>[String(x.purchase_date||''),norm(x.merchant_raw||x.merchant_normalized),
    Math.abs(Number(x.original_amount)||0)].join('|');
  const isOfficial=x=>isKabuCard(x)&&/^kabu:/i.test(String(x.purchase_id||''));

  const decodeTry=(buf,encoding)=>{try{return new TextDecoder(encoding,{fatal:false}).decode(buf)}catch{return''}};
  const isKabuText=text=>text.includes('今回のお支払日')&&text.includes('ご利用日')&&text.includes('ご利用先など')&&text.includes('ご利用金額(￥)');

  const previousDetectSource=typeof detectSource==='function'?detectSource:null;
  if(previousDetectSource){
    detectSource=function detectSourceV44(file,buf){
      const sjis=decodeTry(buf,'shift-jis'),utf=decodeTry(buf,'utf-8');
      if(isKabuText(sjis))return{type:'kabu_card',encoding:'shift-jis',text:sjis,detection:'content'};
      if(isKabuText(utf))return{type:'kabu_card',encoding:'utf-8',text:utf,detection:'content'};
      return previousDetectSource(file,buf);
    };
  }

  function valueAfterLabel(rows,label){
    for(const r of rows){
      const i=r.findIndex(c=>String(c||'').trim().includes(label));
      if(i<0)continue;
      for(let j=i+1;j<r.length;j++)if(String(r[j]??'').trim()!=='')return String(r[j]).trim();
    }
    return'';
  }
  function headerIndex(rows){return rows.findIndex(r=>r.includes('ご利用日')&&r.includes('ご利用先など')&&r.some(c=>String(c).includes('ご利用金額')))}
  function daysBetween(a,b){const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)?Math.round(Math.abs(x-y)/86400000):9999}
  function looksLikeKabuDebit(t){const n=norm(t?.description_raw||t?.description||'');return n.includes('KABU&')||n.includes('KABUAND')||n.includes('カブアンド')||n.includes('ＫＡＢＵ＆')}
  function reconcileKabuSettlements(){
    let linked=0;
    for(const s of state.cardSettlements||[]){
      if(s.bank_transaction_id||norm(s.card)!==norm(CARD_NAME))continue;
      const candidates=(state.cashTransactions||[]).filter(t=>Number(t.amount)<0&&Math.abs(Number(t.amount))===Math.abs(Number(s.amount))&&daysBetween(t.date,s.due_date)<=5&&looksLikeKabuDebit(t));
      if(candidates.length!==1)continue;
      const t=candidates[0];s.bank_transaction_id=t.id;t.linked_event_id=s.settlement_id;t.cashflow_type='CARD_SETTLEMENT';t.category='CARD_SETTLEMENT';linked++;
    }
    return linked;
  }

  function parseKabuCard(src,file){
    const rows=parseCsv(src.text),hi=headerIndex(rows);if(hi<0)throw new Error('KABU&カードの利用明細ヘッダーを認識できません。');
    const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,'').trim()),dueDate=parseDate(valueAfterLabel(rows.slice(0,hi),'今回のお支払日')),settlementTotal=number(valueAfterLabel(rows.slice(0,hi),'今回のお支払金額合計'));
    const raw=[];let read=0,review=0,duplicates=0,added=0;
    for(const r of rows.slice(hi+1)){
      const o=rowObj(h,r),date=parseDate(o['ご利用日']),merchant=String(o['ご利用先など']||'').trim(),amount=number(o['ご利用金額(￥)']);
      if(!date||!merchant||amount===null)continue;read++;
      const c=classifyMerchant(merchant),payment=String(o['支払区分']||'').trim(),payAmount=number(o['お支払い金額(￥)']),instMatch=payment.normalize('NFKC').match(/(\d+)回/),installments=instMatch?Number(instMatch[1]):null;
      raw.push({card:CARD_NAME,source_file:file.name,purchase_date:date,merchant_raw:merchant,merchant_normalized:normalizeText(merchant),original_amount:Math.abs(amount),payment_amount:payAmount===null?null:Math.abs(payAmount),category:c.category,ordinary_or_special:c.ordinary_or_special,payment_method:payment,installment_count:installments,installment_number:null,billing_month:dueDate?dueDate.slice(0,7):ym(date),confidence:c.confidence,domestic_overseas:String(o['国内／海外']||'').trim(),note:String(o['摘要']||'').trim()});
    }
    const within=new Map(),existing=new Map();
    // Index the entire previously imported history before adding this file.
    // Count old occurrence numbers even if a duplicate was later suppressed.
    for(const p of state.purchaseEvents||[]){
      if(!isOfficial(p))continue;
      const key=usageKey(p);
      if(!existing.has(key))existing.set(key,new Set());
      existing.get(key).add(Number(p.occurrence_index||1));
    }
    for(const x of raw){
      const key=usageKey(x),idx=(within.get(key)||0)+1;
      within.set(key,idx);
      if(existing.get(key)?.has(idx)){duplicates++;continue}
      x.occurrence_index=idx;
      x.purchase_id='kabu:'+hash32(CARD_NAME+'|'+key)+':'+idx;
      x.record_kind='CARD_PURCHASE';x.kabu_csv_import_v198=true;
      state.purchaseEvents.push(x);
      if(!existing.has(key))existing.set(key,new Set());
      existing.get(key).add(idx);
      if(Number(x.confidence)<.7){
        addReview({source:SOURCE_LABEL,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});
        review++;
      }
      added++;
    }
    if(dueDate&&Number.isFinite(Number(settlementTotal))&&Number(settlementTotal)>0){
      const sid=`kabu:${dueDate}`,rec={settlement_id:sid,card:CARD_NAME,due_date:dueDate,amount:Math.abs(Number(settlementTotal)),principal:null,fee_interest:null,remaining_balance:null,source_file:file.name,confidence:.98};
      const old=(state.cardSettlements||[]).find(x=>x.settlement_id===sid);if(old)Object.assign(old,rec);else state.cardSettlements.push(rec);
    }
    const linkedSettlements=reconcileKabuSettlements(),autoClassified=raw.filter(x=>Number(x.confidence)>=.7&&String(x.category||'UNKNOWN')!=='UNKNOWN').length;
    return{read,added,duplicates,review,autoClassified,linkedSettlements,source:SOURCE_LABEL,latest:raw.map(x=>x.purchase_date).sort().at(-1)||'',settlementDate:dueDate||'',settlementAmount:Number(settlementTotal)||0};
  }

  const previousImportOne=typeof importOne==='function'?importOne:null;
  if(previousImportOne){
    importOne=async function importOneV44(file){
      const buf=await file.arrayBuffer(),src=detectSource(file,buf);
      if(src.type!=='kabu_card'){
        const result=await previousImportOne(file),linked=reconcileKabuSettlements();if(linked){save();result.linkedKabuSettlements=(result.linkedKabuSettlements||0)+linked}return result;
      }
      const sha=await fileHash(buf);if(state.imports.some(x=>x.sha256===sha))return{source:'重複ファイル',added:0,duplicates:1,review:0,skipped:true};
      const result=parseKabuCard(src,file);state.imports.unshift({at:new Date().toISOString(),file:file.name,sha256:sha,type:src.type,...result});save();return result;
    };
  }


  // Previously imported duplicate copies remain in the ledger as evidence.
  // Users can suppress only an explicitly reviewed duplicate from Expenses.
  // Never delete the original card transaction or exclude it implicitly.
  function scanDuplicates(st=state){
    const groups=new Map(),out=[];
    for(const [i,p] of (st.purchaseEvents||[]).entries()){
      if(!isOfficial(p)||!counted(p))continue;
      const key=usageKey(p)+'|'+Number(p.occurrence_index||1);
      const first=groups.get(key);
      if(!first){groups.set(key,{p,index:i});continue}
      // A repeated purchase from a different official export may use a
      // different payment label or statement month. Show it for review;
      // multiple legitimate same-day charges are not automatically excluded.
      out.push({kind:'purchase',index:i,canonicalIndex:first.index,key,
        date:p.purchase_date||'',label:p.merchant_raw||p.merchant_normalized||'',
        amount:Math.abs(Number(p.original_amount)||0),
        sourceFile:String(p.source_file||''),canonicalFile:String(first.p.source_file||'')});
    }
    // Explicitly KABU-tagged hand-entered purchases can be reviewed in
    // Expenses, but must never block ingestion of an official statement.
    // Cash paid with untagged method is excluded from automatic candidates.
    for(const [i,p] of (st.purchaseEvents||[]).entries()){
      if(isOfficial(p)||!counted(p)||!isKabuCard(p))continue;
      const confirmed=groups.get(usageKey(p)+'|'+Number(p.occurrence_index||1));
      if(!confirmed||confirmed.index===i)continue;
      out.push({kind:'manual_purchase',index:i,canonicalIndex:confirmed.index,
        key:usageKey(p)+'|manual_purchase|'+i,date:p.purchase_date||'',
        label:p.merchant_raw||p.merchant_normalized||'',
        amount:Math.abs(Number(p.original_amount)||0),
        sourceFile:String(p.source_file||'手動登録'),canonicalFile:String(confirmed.p.source_file||'')});
    }
    for(const [i,p] of (st.cashExpenses||[]).entries()){
      if(!counted(p)||!/(?:KABU[&＆]?|KABUAND|カブアンド|株アンド)/i.test(
        String(p.payment_method||p.payment_route||'')))continue;
      const key=[p.date,norm(p.description||p.description_raw||p.name),
        Math.abs(Number(p.purchase_total??p.amount)||0)].join('|');
      const confirmed=groups.get(key+'|1');
      if(!confirmed)continue;
      out.push({kind:'manual_cash',index:i,canonicalIndex:confirmed.index,
        key:key+'|manual_cash|'+i,date:p.date||'',
        label:p.description||p.description_raw||p.name||'',
        amount:Math.abs(Number(p.purchase_total??p.amount)||0),
        sourceFile:String(p.source_file||'手動登録'),canonicalFile:String(confirmed.p.source_file||'')});
    }
    return out.sort((a,b)=>b.date.localeCompare(a.date)||a.index-b.index);
  }
  function applyDuplicate(ref){
    const [kind,number]=String(ref||'').split(':');
    const index=Number(number);
    if(!['purchase','manual_purchase','manual_cash'].includes(kind)||
       !Number.isSafeInteger(index)||index<0)throw Error('重複候補の指定が不正です。');
    const proposed=scanDuplicates().find(x=>x.kind===kind&&x.index===index);
    if(!proposed)throw Error('重複候補が変わりました。公式明細は変更していません。');
    if(typeof window.treasuryRecoverySnapshot!=='function'||
       typeof window.replaceTreasuryState!=='function')
      throw Error('安全な保存と復旧履歴が利用できません。');
    const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0});
    if(!window.confirm?.('株アンドの同一利用として照合しますか？\\n'+
      proposed.date+'　'+proposed.label+'　'+yen.format(proposed.amount)+'\\n'+
      '保持する正本：'+proposed.canonicalFile+'\\n重複候補：'+proposed.sourceFile+
      '\\n実際に2回買い物をした場合はキャンセルしてください。\\n'+
      '明細は削除せず、'+(proposed.kind.startsWith('manual')?'手動入力':'重複登録分')+'の二重計上だけ解除します。'))
      return {cancelled:true};
    const latest=typeof window.getTreasuryStateRaw==='function'?window.getTreasuryStateRaw():state;
    const verified=scanDuplicates(latest).find(x=>x.kind===kind&&x.index===index);
    if(!verified||verified.key!==proposed.key||
       verified.canonicalIndex!==proposed.canonicalIndex)
      throw Error('照合中に家計データが変わりました。再確認してください。');
    const next=structuredClone(latest);
    const x=verified.kind==='manual_cash'?next.cashExpenses[index]:next.purchaseEvents[index];
    const canonical=next.purchaseEvents[verified.canonicalIndex];
    if(!x||!canonical||!isOfficial(canonical)||!counted(x)||!counted(canonical)||
       (verified.kind==='purchase'&&!isOfficial(x))||
       (verified.kind==='manual_purchase'&&isOfficial(x))||
       (verified.kind==='manual_cash'&&!/(?:KABU[&＆]?|KABUAND|カブアンド|株アンド)/i.test(String(x.payment_method||x.payment_route||''))))
      throw Error('正本の照合に失敗しました。');
    x.kabu_original_count_v198=x.count_in_spending===undefined?null:x.count_in_spending;
    x.kabu_original_status_v198=x.reconciliation_status===undefined?null:x.reconciliation_status;
    x.count_in_spending=false;
    x.reconciliation_status='ABSORBED_DUPLICATE';
    x.kabu_canonical_purchase_id=String(canonical.purchase_id||'');
    x.kabu_duplicate_kind_v198=verified.kind;
    x.kabu_duplicate_reviewed_at_v198=new Date().toISOString();
    window.treasuryRecoverySnapshot('株アンドCSV同一利用の二重計上解除直前');
    if(window.replaceTreasuryState(next)===false)throw Error('保存に失敗しました。');
    window.cloudSyncOnLocalSave?.();
    window.householdExpenseUnifiedV148?.render?.();
    return {suppressed:1,amount:verified.amount};
  }

  window.parseKabuCardV44=parseKabuCard;

  function excludedDuplicates(st=state){
    const rows=[];
    for(const [kind,arr] of [['purchase',st.purchaseEvents||[]],['cash',st.cashExpenses||[]]]){
      for(const [index,x] of arr.entries()){
        if(x?.count_in_spending!==false||!x.kabu_duplicate_reviewed_at_v198)continue;
        rows.push({kind,index,date:x.purchase_date||x.date||'',
          label:String(x.merchant_raw||x.description||x.merchant_normalized||''),
          amount:Math.abs(Number(x.original_amount??x.purchase_total??x.amount)||0),
          canonicalId:String(x.kabu_canonical_purchase_id||'')});
      }
    }
    return rows.sort((a,b)=>b.date.localeCompare(a.date));
  }
  function restoreDuplicate(ref){
    const [kind,indexStr]=String(ref||'').split(':'),index=Number(indexStr);
    if(!['purchase','cash'].includes(kind)||!Number.isSafeInteger(index)||index<0)
      throw Error('復元対象が不正です。');
    const prev=excludedDuplicates().find(x=>x.kind===kind&&x.index===index);
    if(!prev)throw Error('復元できる株アンドの重複除外はありません。');
    if(typeof window.treasuryRecoverySnapshot!=='function'||
       typeof window.replaceTreasuryState!=='function')
      throw Error('安全な保存と復旧履歴が利用できません。');
    if(!window.confirm?.('株アンドの二重計上解除を取り消し、再び計上しますか？\n'+
      prev.date+'　'+prev.label+'　'+prev.amount+'円\n'+
      '本当に別々の購入だった場合に選択してください。'))
      return {cancelled:true};
    const latest=typeof window.getTreasuryStateRaw==='function'?window.getTreasuryStateRaw():state;
    const check=excludedDuplicates(latest).find(x=>x.kind===kind&&x.index===index);
    if(!check||check.canonicalId!==prev.canonicalId||
       check.amount!==prev.amount||check.label!==prev.label||
       check.date!==prev.date)throw Error('明細が更新されています。再確認してください。');
    const next=structuredClone(latest),row=(kind==='purchase'?next.purchaseEvents:next.cashExpenses)[index];
    if(row.kabu_original_count_v198===null||row.kabu_original_count_v198===undefined)
      delete row.count_in_spending;
    else row.count_in_spending=row.kabu_original_count_v198;
    if(row.kabu_original_status_v198===null||row.kabu_original_status_v198===undefined)
      delete row.reconciliation_status;
    else row.reconciliation_status=row.kabu_original_status_v198;
    delete row.kabu_original_count_v198;
    delete row.kabu_original_status_v198;
    delete row.kabu_duplicate_reviewed_at_v198;
    row.kabu_duplicate_restored_at_v198=new Date().toISOString();
    window.treasuryRecoverySnapshot('株アンドCSV重複解除の復元直前');
    if(window.replaceTreasuryState(next)===false)throw Error('復元を保存できませんでした。');
    window.cloudSyncOnLocalSave?.();
    window.householdExpenseUnifiedV148?.render?.();
    return {restored:1,amount:prev.amount};
  }

  window.householdKabuCardV198={usageKey,isKabuCard,scanDuplicates,applyDuplicate,excludedDuplicates,restoreDuplicate};
})();