(() => {
  const CARD_NAME='KABU&';
  const SOURCE_LABEL='KABU&カード';
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/]/g,'').toUpperCase();
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
    const within={};
    for(const x of raw){
      const base=[CARD_NAME,x.purchase_date,x.merchant_normalized,x.original_amount,x.payment_method].join('|'),same=(state.purchaseEvents||[]).filter(p=>norm(p.card)===norm(CARD_NAME)&&p.purchase_date===x.purchase_date&&normalizeText(p.merchant_raw||p.merchant_normalized||'')===x.merchant_normalized&&Number(p.original_amount)===Number(x.original_amount)&&String(p.payment_method||'')===x.payment_method),idx=(within[base]||0)+1;within[base]=idx;
      if(same.some(p=>Number(p.occurrence_index||1)===idx)){duplicates++;continue}
      x.occurrence_index=idx;x.purchase_id=`kabu:${hash32(base)}:${idx}`;state.purchaseEvents.push(x);if(Number(x.confidence)<.7){addReview({source:SOURCE_LABEL,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});review++}added++;
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

  window.parseKabuCardV44=parseKabuCard;
})();