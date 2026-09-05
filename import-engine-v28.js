(() => {
  const $ = id => document.getElementById(id);
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・]/g, '').toUpperCase();
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);

  function decodeTry(buf, encoding){
    try { return new TextDecoder(encoding, {fatal:false}).decode(buf); } catch { return ''; }
  }
  function replacementPenalty(text){
    return (text.match(/�/g)||[]).length * 5 + (text.match(/\u0000/g)||[]).length * 10;
  }
  const signatures = [
    {type:'bank_main', needles:['取引日','入出金(円)','取引後残高(円)']},
    {type:'bank_yucho', needles:['取引日','入出金明細ＩＤ','受入金額']},
    {type:'rakuten_card', needles:['利用日','利用店名・商品名','利用金額']},
    {type:'mufg_dc_jal_card', needles:['確定情報','ご利用日','ご利用金額']},
    {type:'broker_cashflow', needles:['入出金日','入金額[円]','出金額[円]']},
    {type:'broker_asset_snapshot', needles:['資産合計','預り金合計']}
  ];
  function scoreText(text){
    let score=-replacementPenalty(text);
    for(const sig of signatures) for(const n of sig.needles) if(text.includes(n)) score+=4;
    if(text.charCodeAt(0)===0xFEFF) score+=1;
    return score;
  }
  function detectByContent(text){
    for(const sig of signatures) if(sig.needles.every(n=>text.includes(n))) return sig.type;
    return null;
  }
  function filenameType(name){
    if(/^RB-torihikimeisai.*\.csv$/i.test(name)) return 'bank_main';
    if(/^ゆうちょ.*\.csv$/i.test(name)) return 'bank_yucho';
    if(/^enavi.*\.csv$/i.test(name)) return 'rakuten_card';
    if(/^2026-2025\.csv$/i.test(name)) return 'mufg_dc_jal_card';
    if(/^Withdrawallist_.*\.csv$/i.test(name)) return 'broker_cashflow';
    if(/^assetbalance\(all\)_.*\.csv$/i.test(name)) return 'broker_asset_snapshot';
    if(/^tradehistory\(INVST\)_.*\.csv$/i.test(name)) return 'broker_trade_mutual_fund';
    if(/^tradehistory\(JP\)_.*\.csv$/i.test(name)) return 'broker_trade_jp';
    if(/^tradehistory\(US\)_.*\.csv$/i.test(name)) return 'broker_trade_us';
    return null;
  }

  const previousDetectSource = typeof detectSource === 'function' ? detectSource : null;
  if(previousDetectSource){
    detectSource = function detectSourceV28(file,buf){
      const utf = decodeTry(buf,'utf-8');
      const sjis = decodeTry(buf,'shift-jis');
      const candidates=[{encoding:'utf-8',text:utf,score:scoreText(utf)},{encoding:'shift-jis',text:sjis,score:scoreText(sjis)}].sort((a,b)=>b.score-a.score);
      let chosen=candidates[0], type=detectByContent(chosen.text);
      if(!type){
        const other=candidates[1];
        const otherType=detectByContent(other.text);
        if(otherType){ chosen=other; type=otherType; }
      }
      type = type || filenameType(file.name);
      if(type && type.startsWith('broker_trade_')){
        const byName=filenameType(file.name); if(byName?.startsWith('broker_trade_')) type=byName;
      }
      if(!type) return {type:'unknown',encoding:chosen.encoding,text:chosen.text,detection:'none',encodingScore:chosen.score};
      return {type,encoding:chosen.encoding,text:chosen.text,detection:detectByContent(chosen.text)?'content':'filename',encodingScore:chosen.score};
    };
  }

  function classifyStats(item){
    const confidence=Number(item?.confidence ?? 0);
    const category=String(item?.category||item?.cashflow_type||'UNKNOWN');
    return confidence>=.7 && category!=='UNKNOWN';
  }

  if(typeof parseRakutenCard === 'function'){
    parseRakutenCard = function parseRakutenCardV28(src,file){
      const rows=parseCsv(src.text),hi=findHeader(rows,['利用日','利用店名・商品名']);
      if(hi<0) throw new Error('楽天カードヘッダーを認識できません。');
      const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,''));
      const fileMatch=file.name.match(/enavi(\d{4})(\d{2})/i),billingMonth=fileMatch?`${fileMatch[1]}-${fileMatch[2]}`:'';
      const payHeader=h.find(x=>/^\d{1,2}月支払金額$/.test(String(x).trim()));
      const regular=[],adjustments=[]; let settlementTotal=0,read=0;
      for(const r of rows.slice(hi+1)){
        const o=rowObj(h,r); if(!o['利用日']) continue;
        const merchant=o['利用店名・商品名']||'',amount=number(o['利用金額']); if(amount===null) continue;
        read++;
        const payment=o['支払方法']||'',refi=/ﾍﾝｻｲﾍﾝｺｳ|返済方法変更ＷＥＢ|分割変更/i.test(merchant+' '+payment),c=classifyMerchant(merchant),inst=(payment.match(/(\d+)回/)||[])[1];
        if(payHeader){const pv=number(o[payHeader]);if(pv!==null)settlementTotal+=pv}
        const rec={purchase_id:hash32(['Rakuten',o['利用日'],normalizeText(merchant),amount].join('|')),card:'Rakuten',source_file:file.name,purchase_date:parseDate(o['利用日']),merchant_raw:merchant,merchant_normalized:normalizeText(merchant),original_amount:Math.abs(amount),category:c.category,ordinary_or_special:c.ordinary_or_special,payment_method:payment,installment_count:inst?+inst:null,installment_number:null,is_refinanced:refi,billing_month:billingMonth||ym(parseDate(o['利用日'])),confidence:c.confidence,note:refi?'返済方法変更行。新規購入として集計しない。':''};
        (refi?adjustments:regular).push(rec);
      }
      let added=0,duplicates=0,review=0,linkedAdjustments=0; const withinFile={};
      for(const x of regular){
        const base=purchaseBaseKey(x),sameExisting=state.purchaseEvents.filter(p=>purchaseBaseKey(p)===base),isInstallment=/分割|リボ|回/.test(x.payment_method||'');
        if(isInstallment&&sameExisting.length){duplicates++;continue}
        const idx=(withinFile[base]||0)+1;withinFile[base]=idx;
        const exact=sameExisting.find(p=>p.source_file===x.source_file&&Number(p.occurrence_index||1)===idx);if(exact){duplicates++;continue}
        x.occurrence_index=idx;state.purchaseEvents.push(x);if(x.confidence<.7){addReview({source:x.card,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});review++}added++;
      }
      for(const adj of adjustments){
        const candidates=state.purchaseEvents.filter(p=>p.card==='Rakuten'&&p.purchase_date===adj.purchase_date&&Number(p.original_amount)===Number(adj.original_amount));
        if(candidates.length===1){
          const p=candidates[0];p.is_refinanced=true;p.refinance_adjustments=p.refinance_adjustments||[];
          const key=[file.name,adj.billing_month,adj.payment_method].join('|');
          if(!p.refinance_adjustments.some(x=>x.key===key))p.refinance_adjustments.push({key,source_file:file.name,billing_month:adj.billing_month,payment_method:adj.payment_method,merchant_raw:adj.merchant_raw});
          linkedAdjustments++;
        }else{
          addReview({source:'Rakuten',date:adj.purchase_date,merchant:adj.merchant_raw,confidence:.5,note:'返済方法変更の元購入を一意に特定できません。'});review++;
        }
      }
      if(billingMonth&&payHeader&&settlementTotal){
        const [y,m]=billingMonth.split('-').map(Number),due=ruleDate(y,m,27),sid=`rakuten:${billingMonth}`;
        const rec={settlement_id:sid,card:'Rakuten',due_date:due,amount:Math.abs(settlementTotal),principal:null,fee_interest:null,remaining_balance:null,source_file:file.name,confidence:.95};
        const old=state.cardSettlements.find(x=>x.settlement_id===sid);if(old)Object.assign(old,rec);else state.cardSettlements.push(rec);
      }
      const autoClassified=regular.filter(classifyStats).length;
      return{read,added,duplicates,review,autoClassified,linkedAdjustments,refinanced:adjustments.length,source:'楽天カード',latest:regular.map(x=>x.purchase_date).sort().at(-1)||''};
    };
  }

  if(typeof parseMufg === 'function'){
    parseMufg = function parseMufgV28(src,file){
      const rows=parseCsv(src.text),hi=findHeader(rows,['確定情報','ご利用日','ご利用金額（円）']);
      if(hi<0) throw new Error('MUFG/DC/JALカードヘッダーを認識できません。');
      const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,'')),raw=[],exact=new Set();let read=0,duplicates=0,review=0,added=0;
      for(const r of rows.slice(hi+1)){
        const o=rowObj(h,r);if(o['確定情報']!=='確定'||!o['ご利用日']||!o['ご利用店名（海外ご利用店名／海外都市名）'])continue;
        const amount=number(o['ご利用金額（円）']);if(amount===null)continue;read++;
        const rowKey=JSON.stringify(r);if(exact.has(rowKey)){duplicates++;continue}exact.add(rowKey);
        const merchant=o['ご利用店名（海外ご利用店名／海外都市名）'],c=classifyMerchant(merchant);
        raw.push({purchase_id:hash32(['MUFG/DC/JAL',o['ご利用日'],normalizeText(merchant),amount].join('|')),card:'MUFG/DC/JAL',source_file:file.name,purchase_date:parseDate(o['ご利用日']),merchant_raw:merchant,merchant_normalized:normalizeText(merchant),original_amount:Math.abs(amount),category:c.category,ordinary_or_special:c.ordinary_or_special,payment_method:`${o['支払回数']||''} ${o['何回目']||''}`.trim(),installment_count:number(o['支払回数']),installment_number:number(o['何回目']),billing_month:parseDate(o['お支払日']).slice(0,7),confidence:c.confidence});
      }
      const counts={};for(const p of state.purchaseEvents)counts[purchaseBaseKey(p)]=(counts[purchaseBaseKey(p)]||0)+1;
      for(const x of raw){
        const base=purchaseBaseKey(x),same=state.purchaseEvents.filter(p=>purchaseBaseKey(p)===base),isInstallment=Number(x.installment_count)>1||Number(x.installment_number)>1;
        if(isInstallment&&same.length){duplicates++;continue}
        const exactExisting=same.find(p=>p.source_file===x.source_file&&p.installment_number===x.installment_number&&p.billing_month===x.billing_month);if(exactExisting){duplicates++;continue}
        x.occurrence_index=(counts[base]||0)+1;counts[base]=x.occurrence_index;state.purchaseEvents.push(x);if(x.confidence<.7){addReview({source:x.card,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});review++}added++;
      }
      return{read,added,duplicates,review,autoClassified:raw.filter(classifyStats).length,source:'MUFG/DC/JAL',latest:raw.map(x=>x.purchase_date).sort().at(-1)||''};
    };
  }

  function daysBetween(a,b){const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)?Math.round(Math.abs(x-y)/86400000):9999}
  function cardHint(t){
    const n=norm(t?.description_raw);
    if(n.includes(norm('ラクテンカ－ト゛サ－ヒ゛ス')))return 'Rakuten';
    if(n.includes(norm('ＤＣカ－ト゛')))return 'DC';
    if(n.includes(norm('ミツヒ゛シＵＦＪニコス')))return 'MUFG';
    if(n.includes(norm('シ゛エ－シ－ヒ゛－')))return 'JCB';
    return '';
  }
  function cardCompatible(settlement,cash){
    const h=cardHint(cash),c=norm(settlement?.card);
    if(!h)return false;
    if(h==='Rakuten')return c.includes('RAKUTEN');
    if(h==='DC')return c.includes('DC')||c.includes('MUFG');
    if(h==='MUFG')return c.includes('MUFG');
    if(h==='JCB')return c.includes('JCB');
    return false;
  }
  function reconcileCardSettlements(){
    let linked=0;
    for(const s of state.cardSettlements||[]){
      if(s.bank_transaction_id)continue;
      const candidates=(state.cashTransactions||[]).filter(t=>t.amount<0&&Math.abs(Number(t.amount))===Math.abs(Number(s.amount))&&daysBetween(t.date,s.due_date)<=5&&cardCompatible(s,t));
      if(candidates.length!==1)continue;
      const t=candidates[0];s.bank_transaction_id=t.id;t.linked_event_id=s.settlement_id;t.cashflow_type='CARD_SETTLEMENT';t.category='CARD_SETTLEMENT';linked++;
    }
    return linked;
  }
  function reconcileBrokerTransfers(){
    let linked=0;
    const bank=(state.cashTransactions||[]).filter(t=>t.source!=='Rakuten Securities'&&t.is_transfer&&norm(t.description_raw).includes(norm('ラクテンショウケン')));
    const broker=(state.cashTransactions||[]).filter(t=>t.source==='Rakuten Securities'&&t.is_transfer);
    for(const b of bank){
      if(b.transfer_group_id)continue;
      const cands=broker.filter(x=>!x.transfer_group_id&&Number(x.amount)===-Number(b.amount)&&daysBetween(x.date,b.date)<=2);
      if(cands.length!==1)continue;
      const x=cands[0],gid=`transfer:${hash32([b.date,b.amount,x.date,x.amount].join('|'))}`;b.transfer_group_id=gid;x.transfer_group_id=gid;b.linked_event_id=x.id;x.linked_event_id=b.id;linked++;
    }
    return linked;
  }
  function reconcileBrokerTrades(){
    let linked=0;
    const cash=(state.cashTransactions||[]).filter(t=>t.source==='Rakuten Securities'&&t.is_transfer&&!t.linked_investment_id);
    const buys=(state.investmentEvents||[]).filter(x=>!/売|SELL/i.test(String(x.side||''))&&!x.funding_cash_transaction_id&&Math.abs(Number(x.amount)||0)>0);
    for(const c of cash){
      const cands=buys.filter(x=>Math.abs(Number(x.amount))===Math.abs(Number(c.amount))&&daysBetween(x.date,c.date)<=3);
      if(cands.length!==1)continue;
      const x=cands[0];c.linked_investment_id=x.investment_id;x.funding_cash_transaction_id=c.id;linked++;
    }
    return linked;
  }

  function fixedCandidates(){
    const groups=new Map(),known=new Set();
    for(const x of state.masters?.fixedExpenses||[])known.add(norm(x.name));
    for(const x of state.rules||[])known.add(norm(x.name));
    const add=(name,amount,source)=>{
      const key=norm(name);if(!key||known.has(key)||!Number.isFinite(Number(amount))||Number(amount)<=0)return;
      const g=groups.get(key)||{name,amounts:[],sources:new Set()};g.amounts.push(Math.abs(Number(amount)));g.sources.add(source);groups.set(key,g);
    };
    for(const t of state.cashTransactions||[]){
      if(Number(t.amount)>=0||t.is_transfer||['CARD_SETTLEMENT','INVESTMENT_CONTRIBUTION','DEBT_PRINCIPAL','DEBT_INTEREST'].includes(t.cashflow_type))continue;
      add(t.description_raw,Math.abs(Number(t.amount)),t.source||'bank');
    }
    for(const p of state.purchaseEvents||[]){add(p.merchant_raw,p.original_amount,p.card||'card')}
    const out=[];
    for(const [key,g] of groups){
      if(g.amounts.length<2)continue;
      const min=Math.min(...g.amounts),max=Math.max(...g.amounts),avg=g.amounts.reduce((a,b)=>a+b,0)/g.amounts.length;
      if(min<=0||max/min>1.18)continue;
      out.push({key,name:g.name,count:g.amounts.length,average:Math.round(avg),sources:[...g.sources]});
    }
    return out.sort((a,b)=>b.count-a.count||b.average-a.average).slice(0,12);
  }
  function reconcileAll(){
    const card=reconcileCardSettlements(),transfer=reconcileBrokerTransfers(),investment=reconcileBrokerTrades();
    state.importCandidates=state.importCandidates||{};state.importCandidates.fixedExpenses=fixedCandidates();
    return{card,transfer,investment,fixed:state.importCandidates.fixedExpenses.length};
  }

  if(typeof importOne === 'function'){
    const originalImportOne=importOne;
    importOne=async function importOneV28(file){
      const buf=await file.arrayBuffer(),detected=detectSource(file,buf);
      const beforeReview=(state.reviewQueue||[]).length;
      const result=await originalImportOne(file);
      if(result?.skipped)return{...result,read:0,autoClassified:0,newFixedCandidates:0,encoding:detected.encoding,detectedType:detected.type};
      const links=reconcileAll();
      const read=Number(result.read ?? ((result.added||0)+(result.duplicates||0)+(result.refinanced||0)));
      const review=Math.max(Number(result.review||0),(state.reviewQueue||[]).length-beforeReview);
      const autoClassified=Number(result.autoClassified ?? Math.max(0,(result.added||0)-review));
      const enriched={...result,read,review,autoClassified,newFixedCandidates:links.fixed,linkedCount:(links.card||0)+(links.transfer||0)+(links.investment||0),linkDetail:links,encoding:detected.encoding,detectedType:detected.type};
      const rec=(state.imports||[]).find(x=>x.file===file.name);if(rec)Object.assign(rec,enriched,{encoding:detected.encoding,detection:detected.detection});
      save();return enriched;
    };
  }

  if(typeof readCsv === 'function'){
    readCsv=async function readCsvV28(files){
      for(const file of [...files]){
        const div=document.createElement('div');div.className='card';div.style.marginTop='10px';div.innerHTML=`<div class="title">${esc(file.name)}</div><div class="muted">解析中...</div>`;$('importResults').prepend(div);
        try{
          const r=await importOne(file);
          div.innerHTML=`<div class="title">${esc(file.name)} <span class="tag">${esc(r.source||r.detectedType||'')}</span></div>
            <div class="row"><span>読み込んだ件数</span><b>${r.read||0}件</b></div>
            <div class="row"><span>新規件数</span><b>${r.added||0}件</b></div>
            <div class="row"><span>重複除外</span><b>${r.duplicates||0}件</b></div>
            <div class="row"><span>自動分類</span><b>${r.autoClassified||0}件</b></div>
            <div class="row"><span>要確認</span><b>${r.review||0}件</b></div>
            <div class="row"><span>新しい固定費候補</span><b>${r.newFixedCandidates||0}件</b></div>
            <div class="row"><span>自動リンク</span><b>${r.linkedCount||0}件</b></div>
            <div class="tiny" style="margin-top:8px">判定 ${esc(r.detectedType||'')} · ${esc(r.encoding||'')}</div>
            ${r.balance!==undefined?`<div class="row"><span>最新残高</span><b>${yen(r.balance)}</b></div>`:''}`;
          render();
        }catch(e){div.innerHTML=`<div class="title bad">${esc(file.name)} · 取込停止</div><div class="note">${esc(e.message)}</div>`}
      }
    };
  }

  if(typeof renderImportSummary === 'function'){
    renderImportSummary=function renderImportSummaryV28(){
      if(!$('importSummary'))return;const last=state.imports?.[0];
      $('importSummary').innerHTML=last?`<div class="row"><span>最終取込</span><b>${esc(last.source||last.kind||last.type||'')}</b></div>
        <div class="row"><span>読込 / 新規 / 重複</span><b>${last.read||0} / ${last.added||0} / ${last.duplicates||0}</b></div>
        <div class="row"><span>自動分類 / 要確認</span><b>${last.autoClassified||0} / ${last.review||0}</b></div>
        <div class="row"><span>固定費候補 / 自動リンク</span><b>${last.newFixedCandidates||0} / ${last.linkedCount||0}</b></div>
        <div class="tiny">${esc(last.file||'')} · ${esc(last.encoding||'')} · ${last.at?new Date(last.at).toLocaleString('ja-JP'):''}</div>`:'まだ取込はありません。';
      const candidates=state.importCandidates?.fixedExpenses||[];
      const candidateHtml=candidates.length?`<div class="note" style="margin-top:10px"><b>固定費候補</b><br>${candidates.slice(0,6).map(x=>`${esc(x.name)} · 約${yen(x.average)} · ${x.count}回`).join('<br>')}</div>`:'';
      $('reviewQueue').innerHTML=candidateHtml+(state.reviewQueue||[]).slice(0,20).map((x,i)=>`<div class="row"><div><b>${esc(x.description||x.merchant||x.source||'要確認')}</b><div class="tiny">${esc(x.date||'')} · confidence ${Number(x.confidence||0).toFixed(2)}${x.note?` · ${esc(x.note)}`:''}</div></div><button class="btn secondary" onclick="dismissReview(${i})">確認済み</button></div>`).join('');
    };
  }

  const previousRender=typeof render==='function'?render:null;
  if(previousRender){render=function renderWithImportEngineV28(){previousRender();try{renderImportSummary()}catch{}}}
  try{reconcileAll();render()}catch{}
})();
