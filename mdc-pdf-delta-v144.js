(() => {
  'use strict';
  if (window.__mdcPdfDeltaV144) return;
  window.__mdcPdfDeltaV144 = true;
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=>typeof state!=='undefined'?state:(window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const hName='MDCカード識別子';
  const oldName='MDC旧版CSVファイル';
  const altName='MDC別カードとして登録';
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  const signature=(date,merchant,amount,billing,installment)=>[
    String(date||''),norm(merchant),Math.abs(Number(amount)||0),
    String(billing||''),Number(installment)||0
  ].join('|');
  const rowSig=x=>x.mdc_pdf_signature_v168||signature(x.purchase_date,x.merchant_raw||x.merchant_normalized,x.original_amount,x.billing_month,x.installment_number);
  const cardId=x=>String(x.pdf_card_identity||'').normalize('NFKC').trim();
  const pdfSource=x=>/^MDC_PDF_/i.test(String(x?.source_file||''))||!!x?.pdf_card_identity;
  const isMdcCard=x=>norm(x?.card||'')==='MUFGDCJAL'||pdfSource(x);
  const parse=(src,file)=>{
    const rows=parseCsv(src?.text||''),hi=findHeader(rows,['確定情報','ご利用日','ご利用金額（円）']);
    if(hi<0)return null;
    const heads=rows[hi].map(x=>String(x).replace(/^\uFEFF/,''));
    if(!heads.includes(hName))return null;
    const collected=[],counts=new Map();
    for(let i=hi+1;i<rows.length;i++){
      const o=rowObj(heads,rows[i]);
      if(!Object.values(o).some(x=>String(x||'').trim()))continue;
      if(String(o['確定情報']||'').trim()!=='確定')throw Error('MDC-D01: '+(i+1)+'行目が確定明細ではありません。');
      const date=parseDate(o['ご利用日']);
      const merchant=String(o['ご利用店名（海外ご利用店名／海外都市名）']||'').trim();
      const amount=number(o['ご利用金額（円）']);
      const payDate=parseDate(o['お支払日']);
      const identity=String(o[hName]||'').normalize('NFKC').trim().slice(0,70);
      if(!datePattern.test(date)||!datePattern.test(payDate)||!merchant||!(amount>0)||!Number.isSafeInteger(amount)||!identity)
        throw Error('MDC-D02: '+(i+1)+'行目の利用日・金額・カード・支払日が不正です。');
      const rawInst=String(o['何回目']||'').trim(),inst=rawInst?number(rawInst):null;
      const rawCount=String(o['支払回数']||'').trim(),count=rawCount?number(rawCount):1;
      if((rawInst&&!(inst>0))||!(count>0))throw Error('MDC-D03: 分割回数が不正です。');
      const billing=payDate.slice(0,7),key=signature(date,merchant,amount,billing,inst);
      const occurrence=(counts.get(identity+'|'+key)||0)+1;
      counts.set(identity+'|'+key,occurrence);
      collected.push({identity,date,merchant,amount,billing,payDate,inst,count,key,occurrence,
        oldFilename:String(o[oldName]||'').trim(),
        differentCard:String(o[altName]||'').trim().toUpperCase()==='YES'});
    }
    if(!collected.length)throw Error('MDC-D04: 有効なPDF明細がありません。');
    if(new Set(collected.map(x=>x.identity)).size!==1||new Set(collected.map(x=>x.payDate)).size!==1)
      throw Error('MDC-D05: 別カード・別請求月が混在しています。');
    return collected;
  };
  function receiptMatch(st,r,used){
    // Payment settlement itself is never a purchase. Absorb only a confirmed
    // JAL/QUICPay receipt and only if the PDF evidence is unique.
    const name=norm(r.merchant),day=Date.parse(r.date+'T00:00:00Z');
    const rows=(st.purchaseEvents||[]).map((x,i)=>({x,i})).filter(({x,i})=>{
      if(used.has(i)||pdfSource(x)||x.count_in_spending===false||
        x.reconciliation_status==='ABSORBED_DUPLICATE')return false;
      const master=(st.masters?.cards||[]).find(c=>x.card_master_id&&String(c.id)===String(x.card_master_id));
      const linkedJal=Boolean(master&&window.householdCardCycleV81?.canonicalCard?.(master.name)==='JAL');
      if((String(x.card||'')!=='MUFG/DC/JAL'&&!linkedJal)||String(x.payment_method||'').toUpperCase()!=='QUICPAY')return false;
      if(Math.abs(Number(x.original_amount)||0)!==r.amount)return false;
      if(!Number.isFinite(day)||!Number.isFinite(Date.parse(x.purchase_date+'T00:00:00Z'))||
         Math.abs(Date.parse(x.purchase_date+'T00:00:00Z')-day)>3*86400000)return false;
      const receipt=norm(x.merchant_raw||x.merchant_normalized);
      if(!receipt||!name)return false;
      if(receipt.includes('セブンイレブン')&&name.includes('セブンイレブン'))return true;
      return receipt.length>=5&&(receipt.includes(name)||name.includes(receipt));
    });
    return rows;
  }
  const groupBy=(xs,fn)=>{
    const m=new Map();for(const x of xs){const k=fn(x),l=m.get(k)||[];l.push(x);m.set(k,l)}return m;
  };
  // Distinct physical cards can have identical purchases. The fallback below
  // never silently assigns a different scoped card to the incoming file.
  function identityConflicts(st,entries){
    const direct=String(entries[0].identity||'').normalize('NFKC').trim();
    const matching=new Map();
    for(const old of st.purchaseEvents||[]){
      if(!pdfSource(old)||!cardId(old)||cardId(old)===direct)continue;
      for(const r of entries){
        if(r.key===rowSig(old)){
          const id=cardId(old),set=matching.get(id)||new Set();
          set.add(r.key);matching.set(id,set);
        }
      }
    }
    return [...matching].map(([identity,set])=>({identity,count:set.size})).sort((a,b)=>b.count-a.count);
  }
  function plan(st,entries,fileName=''){
    const existing=st.purchaseEvents||[],updates=[],additions=[],issues=[];
    const conflicts=identityConflicts(st,entries),identity=String(entries[0].identity||'').normalize('NFKC').trim();
    const direct=entries.filter(r=>existing.some(x=>cardId(x)===identity&&rowSig(x)===r.key)).length;
    if(conflicts.length && direct===0 && !entries[0].differentCard){
      issues.push('MDC-D11: 既存カード「'+conflicts[0].identity+'」と同一明細が'+conflicts[0].count+
        '種類あります。カード識別名が変わった可能性があるため取込を停止しました。以前と同じカードなら、その識別名を入力してください。別カードなら「別カードとして登録」を明示してください。');
    }
    const grouped=groupBy(entries,r=>r.key),used=new Set();
    let duplicate=0,upgraded=0,receiptAbsorbed=0;
    for(const [key,group] of grouped){
      const r=group[0];
      const candidates=existing.map((x,i)=>({x,i})).filter(({x})=>isMdcCard(x)&&rowSig(x)===key&&
        (String(x.payment_method||'').toUpperCase()!=='QUICPAY'||!!x.mdc_pdf_signature_v168));
      const scoped=candidates.filter(({x})=>cardId(x)===identity);
      const legacy=candidates.filter(({x})=>!cardId(x) && (
        String(x.source_file||'')===r.oldFilename||
        (/^MDC_PDF_/i.test(String(x.source_file||'')))||
        norm(x.card)==='MUFGDCJAL'));
      const allowedLegacy=!r.differentCard&&!candidates.some(({x})=>cardId(x)&&cardId(x)!==identity);
      for(const occurrenceRow of group){
        // Only an existing identical ordinal is authoritative; unlike whole-PDF
        // SHA this is stable when a statement gains new rows.
        const match=scoped.find(({x,i})=>!used.has(i)&&Number(x.occurrence_index||1)===occurrenceRow.occurrence)
          ||(allowedLegacy?legacy.find(({x,i})=>!used.has(i)&&
              (String(x.source_file||'')===r.oldFilename||
               Number(x.occurrence_index||1)===occurrenceRow.occurrence)):null);
        if(match){
          used.add(match.i);duplicate++;
          if(!cardId(match.x)){updates.push({index:match.i,identity});upgraded++}
          continue;
        }
        const receipts=receiptMatch(st,r,used);
        if(receipts.length>1){
          issues.push('MDC-R18: '+r.date+' '+r.merchant+' '+r.amount+
            '円の領収書が複数一致します。自動吸収を中止し、元明細を確認してください。');
          continue;
        }
        if(receipts.length===1){
          const candidate=receipts[0],old=candidate.x;
          const cardTail=(identity.match(/(?:末尾|last4|下4桁)\D*(\d{4})$/i)||identity.match(/^(\d{4})$/)||[])[1];
          if(old.card_last4&&cardTail&&cardTail!==String(old.card_last4)){
            issues.push('MDC-R18: カード末尾が一致しません。'+r.date+' '+r.merchant);
            continue;
          }
          used.add(candidate.i);
          updates.push({index:candidate.i,identity,
            receiptPdf:{key:r.key,date:r.date,merchant:r.merchant,amount:r.amount,
              billing:r.billing,payDate:r.payDate,inst:r.inst,count:r.count,occurrence:occurrenceRow.occurrence,
              sourceFile:fileName}});
          duplicate++;receiptAbsorbed++;
          continue;
        }
        // A prior duplicated import may already contain this ordinal twice.
        // Never append more data into a suspect group before user review.
        if(scoped.length>=group.length){
          duplicate++;issues.push('同一明細に既存の登録超過があります。既存重複の確認が必要です：'+r.date+' '+r.merchant+' '+r.amount+'円');
          continue;
        }
        const id=hash32(['MDC-PDF-ROW-V144',identity,key,occurrenceRow.occurrence].join('|'));
        const c=classifyMerchant(r.merchant),special=String(c.ordinary_or_special||'').toUpperCase()==='SPECIAL';
        additions.push({
          purchase_id:'mdc:'+id,occurrence_index:occurrenceRow.occurrence,
          card:'MUFG/DC/JAL',pdf_card_identity:identity,source_file:fileName,
          purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:normalizeText(r.merchant),
          original_amount:r.amount,billing_month:r.billing,installment_count:r.count,
          installment_number:r.inst,payment_method:String(r.count)+(r.inst?' '+r.inst:''),
          record_kind:'CARD_PURCHASE',economic_type:'EXPENSE',ordinary_or_special:special?'SPECIAL':'ORDINARY',
          expense_scope:special?'SPECIAL':'NORMAL',spending_class:special?'SPECIAL':'NORMAL',
          category:c.category||'UNKNOWN',subcategory:null,confidence:Number(c.confidence)||.4,
          mdc_import_v144:true
        });
      }
    }
    return {read:entries.length,added:additions.length,duplicates:duplicate,upgraded,issues:[...new Set(issues)],additions,updates,
      billing_month:entries[0].billing,identity,conflicts,
      importedMonths:[...new Set(entries.map(x=>x.date.slice(0,7)))].sort(),receiptAbsorbed};
  }
  function dryRun(st,entries,sourceFile){return plan(st,entries,sourceFile)}
  function importScoped(src,file){
    const entries=parse(src,file);
    if(!entries)return null;
    const st=stateNow();
    if(!st||!Array.isArray(st.purchaseEvents))throw Error('MDC-D06: 保存先の取引データが取得できません。');
    const result=plan(st,entries,file?.name||'');
    if(result.issues.some(x=>x.startsWith('MDC-D11:')))throw Error(result.issues.find(x=>x.startsWith('MDC-D11:')));
    if(result.issues.some(x=>x.startsWith('MDC-R18:')))throw Error(result.issues.find(x=>x.startsWith('MDC-R18:')));
    // Transactional: validation and dedup decisions precede all mutations.
    for(const u of result.updates){
      const x=st.purchaseEvents[u.index];
      if(!x)throw Error('MDC-R19: 照合対象の取引を取得できません');
      if(u.receiptPdf){
        const evidence=u.receiptPdf;
        x.mdc_pdf_signature_v168=evidence.key;
        x.mdc_pdf_purchase_date=evidence.date;
        x.mdc_pdf_merchant_raw=evidence.merchant;
        x.mdc_pdf_source_file=evidence.sourceFile;
        x.mdc_pdf_statement_ordinal=evidence.occurrence;
        x.mdc_import_v144=true;
        x.pdf_card_identity=u.identity;
        x.receipt_reconciliation_pending=false;
        x.receipt_absorbed_v168=true;
        x.billing_month=evidence.billing;
        x.expected_settlement_date=evidence.payDate;
        x.settlement_due_date=evidence.payDate;
        x.installment_count=evidence.count;
        x.installment_number=evidence.inst;
        // Preserve the original receipt date/merchant and source_file.
        // The statement evidence is stored separately and reimports use
        // mdc_pdf_signature_v168 instead of changing economic purchase date.
      }else if(!cardId(x)){x.pdf_card_identity=u.identity;x.pdf_statement_migrated_v144=true}
    }
    for(const row of result.additions){
      st.purchaseEvents.push(row);
      if(row.confidence<.7&&typeof addReview==='function')addReview({
        source:row.card,date:row.purchase_date,merchant:row.merchant_raw,confidence:row.confidence
      });
    }
    return {source:'MDC/JAL PDF',detectedType:'mdc_pdf',read:result.read,added:result.added,
      duplicates:result.duplicates,upgraded:result.upgraded,receiptAbsorbed:result.receiptAbsorbed,review:result.additions.filter(x=>x.confidence<.7).length,
      latest:entries.map(x=>x.date).sort().at(-1)||'',billing_month:result.billing_month,
      importedMonths:result.importedMonths,issues:result.issues,incrementalDedup:true};
  }
  // This final wrapper supersedes the V139 PDF parser, but delegates d-card and
  // generic MUFG/JAL CSV to their existing handlers without modifying behavior.
  if(typeof parseMufg==='function'){
    const previous=parseMufg;
    parseMufg=function parseMufgIncrementalV144(src,file){
      const parsed=parse(src,file);
      if(!parsed)return previous(src,file);
      return importScoped(src,file);
    };
  }
  // Render a non-mutating import preview with the statement parser's entries.
  function previewPdf(p,identity,forceDifferent=false){
    const st=stateNow(),seen=new Map();
    const entries=(p?.entries||[]).map(e=>{
      const key=signature(e.date,e.merchant,e.amount,String(p.paymentDate).slice(0,7),null);
      const occurrence=(seen.get(key)||0)+1;seen.set(key,occurrence);
      return {identity,date:e.date,merchant:e.merchant,amount:e.amount,billing:String(p.paymentDate).slice(0,7),
        payDate:p.paymentDate,inst:null,count:e.count||1,key,occurrence,
        differentCard:forceDifferent,oldFilename:''};
    });
    if(!entries.length)throw Error('PDFの明細がありません。');
    return plan(st,entries,'');
  }
  // Very conservative repair candidates: identical PDF records with the same
  // physical-card scope AND occurrence ordinal, imported from different files.
  function duplicatesAudit(st){
    const rows=(st.purchaseEvents||[]).map((x,i)=>({x,i})).filter(({x})=>pdfSource(x)&&!!cardId(x));
    const groups=groupBy(rows,({x})=>cardId(x)+'|'+rowSig(x)+'|'+Number(x.occurrence_index||1));
    const candidates=[];
    for(const group of groups.values()){
      if(group.length<2)continue;
      const ordered=[...group].sort((a,b)=>a.i-b.i);
      const original=ordered[0];
      for(const extra of ordered.slice(1)){
        if(String(extra.x.source_file||'')===String(original.x.source_file||''))continue;
        candidates.push({index:extra.i,keepIndex:original.i,record:extra.x,original:original.x});
      }
    }
    return candidates;
  }
  function crossCardWarnings(st){
    const rows=(st.purchaseEvents||[]).filter(x=>pdfSource(x)&&cardId(x));
    const groups=groupBy(rows,rowSig);
    const out=[];
    for(const group of groups.values()){
      const ids=[...new Set(group.map(cardId))];
      if(ids.length>1)out.push({record:group[0],identities:ids});
    }
    return out;
  }
  function mountAudit(){
    const root=document.querySelector('#imports .grid');
    if(!root)return;
    let box=document.getElementById('mdcDuplicateAuditV144');
    if(!box){
      box=document.createElement('div');box.id='mdcDuplicateAuditV144';box.className='card full';
      root.appendChild(box);
    }
    const items=duplicatesAudit(stateNow()),cross=crossCardWarnings(stateNow());
    box.innerHTML='<div class="title">MDC PDF 重複登録の点検</div>'+
      '<div class="tiny">既存データを自動削除しません。別ファイルから取り込まれた、同一カード・請求月・利用日・店舗・金額・同一出現番号の重複候補だけ表示します。</div>'+
      (cross.length?'<div class="note" style="margin-top:8px">カード識別名が異なる明細で '+cross.length+
        '組の一致候補があります。実際に別カードの可能性もあるため自動整理しません。'+
        cross.slice(0,8).map(x=>'<div class="tiny">'+esc(x.record.purchase_date)+' '+esc(x.record.merchant_raw)+
          ' '+yen(x.record.original_amount)+' / '+x.identities.map(esc).join(' と ')+'</div>').join('')+'</div>':'')+
      (items.length?'<div class="note" style="margin-top:8px">'+items.length+'件の重複候補。残す明細を確認してから整理してください。</div>'+
        '<div style="max-height:260px;overflow:auto">'+items.slice(0,100).map((v,j)=>
          '<label class="row"><span><input type="checkbox" data-mdc-duplicate-index="'+v.index+'"> '+
          esc(v.record.purchase_date)+' '+esc(v.record.merchant_raw)+'（'+esc(cardId(v.record))+'）'+
          '<div class="tiny">削除候補: '+esc(v.record.source_file)+' / 保持: '+esc(v.original.source_file)+'</div></span><b>'+yen(v.record.original_amount)+'</b></label>').join('')+'</div>'+
        '<button type="button" class="btn danger" id="mdcRepairSelectedV144">選択した重複候補だけ削除</button>'+
        '<div class="tiny">バックアップを保存してから明細を削除します。異なるカード・判定不能の重複は対象外です。</div>'
      :'<div class="tiny" style="margin-top:8px">同一カード内の明確な重複候補は見つかりませんでした。カード識別名が変わったケースは別途確認が必要です。</div>');
    const button=box.querySelector('#mdcRepairSelectedV144');
    if(button)button.onclick=()=>{
      const selected=[...box.querySelectorAll('input[data-mdc-duplicate-index]:checked')].map(x=>Number(x.dataset.mdcDuplicateIndex));
      if(!selected.length){alert('削除候補を選択してください。');return;}
      const fresh=duplicatesAudit(stateNow()),allowed=new Set(fresh.map(x=>x.index));
      if(selected.some(x=>!allowed.has(x))){alert('データが更新されています。再読み込みして確認してください。');mountAudit();return;}
      if(!confirm('重複候補'+selected.length+'件を家計データから削除します。復元可能なバックアップを作成してから実行しますか？'))return;
      if(typeof window.treasuryRecoverySnapshot!=='function'||typeof window.replaceTreasuryState!=='function'){
        alert('バックアップ機能または保存機能が使用できないため、削除を中止しました。');return;
      }
      const st=structuredClone(stateNow());
      window.treasuryRecoverySnapshot('MDC PDF重複候補整理の直前');
      const kill=new Set(selected);
      st.purchaseEvents=st.purchaseEvents.filter((_,i)=>!kill.has(i));
      window.replaceTreasuryState(st);
      window.cloudSyncOnLocalSave?.();
      window.dispatchEvent(new CustomEvent('treasury:expenses-imported',{detail:{months:[],source:'MDC_PDF_REPAIR'}}));
      mountAudit();
    };
    // Keep CSV/PDF reconciliation in the existing PDF audit surface,
    // not a version-specific extra Import picker.
    window.householdJalCrossSourceV166?.mountInto?.(box);
  }
  window.householdMdcPdfDeltaV144={signature,parse,plan,dryRun,previewPdf,duplicatesAudit,crossCardWarnings,mountAudit};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountAudit,{once:true});
  else setTimeout(mountAudit,0);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-page="imports"]'))setTimeout(mountAudit,0);
  });
  window.addEventListener('treasury:expenses-imported',()=>setTimeout(mountAudit,0));
})();