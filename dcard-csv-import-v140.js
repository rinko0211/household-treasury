(() => {
  if (window.__householdDCardCsvV140) return;
  window.__householdDCardCsvV140 = true;

  const HEADER = ['請求月','利用日','利用先','金額(円)','支払方法','利用者','備考'];
  const isoMonth = /^\d{4}-(0[1-9]|1[0-2])$/;
  const isoDate = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const norm = s => String(s ?? '').normalize('NFKC').trim();
  const normName = s => norm(s).replace(/[\s　]+/g,'').toUpperCase();
  const validCalendarDate = s => {
    if(!isoDate.test(s))return false;
    const [y,m,d]=s.split('-').map(Number);
    const x=new Date(y,m-1,d);
    return x.getFullYear()===y&&x.getMonth()+1===m&&x.getDate()===d;
  };
  const isDCard = s => {
    const n=normName(s).replace(/カード|CARD/g,'').replace(/[\-_]/g,'');
    return n==='D'||n==='DCMX'||n==='DOCOMO';
  };
  const stateNow = () => (typeof state !== 'undefined' ? state : (window.getTreasuryStateRaw || window.getTreasuryState)?.());
  const rowSignature = (month,date,merchant,amount,user) =>
    [month,date,normName(merchant),Number(amount),normName(user)].join('|');
  const rowKeyOf = p => rowSignature(
    p.billing_month,p.purchase_date,p.merchant_raw||p.merchant_normalized,
    p.original_amount,p.dcard_user||''
  );
  const readAmount = value => {
    const s=norm(value).replace(/[¥￥,\s]/g,'');
    return /^\d+$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)>0?Number(s):null;
  };
  const normalizeHeader = fields => fields.map(x=>norm(x).replace(/^\uFEFF/,''));
  const dCardHeaderIndex = rows => {
    for(let i=0;i<Math.min(rows.length,8);i++){
      const cols=normalizeHeader(rows[i]);
      if(HEADER.every(col=>cols.includes(col)))return i;
    }
    return -1;
  };
  function parseRows(text) {
    if(typeof parseCsv!=='function')throw Error('CSVの読取機能がありません。');
    const rows=parseCsv(text);
    const hi=dCardHeaderIndex(rows);
    if(hi<0)throw Error('dカードのヘッダーが見つかりません。必要列: '+HEADER.join('、'));
    const columns=normalizeHeader(rows[hi]),parsed=[],occ=new Map();
    for(let i=hi+1;i<rows.length;i++){
      const row=rows[i];
      if(!row.some(x=>String(x||'').trim()))continue;
      const pick=col=>String(row[columns.indexOf(col)]??'').trim();
      const billing=norm(pick('請求月')),date=norm(pick('利用日'));
      const merchant=pick('利用先'),amount=readAmount(pick('金額(円)'));
      const method=pick('支払方法'),user=pick('利用者'),note=pick('備考');
      if(!isoMonth.test(billing))throw Error((i+1)+'行目: 請求月はYYYY-MMで入力してください。');
      if(!validCalendarDate(date))throw Error((i+1)+'行目: 利用日が不正です。');
      if(!merchant)throw Error((i+1)+'行目: 利用先が空です。');
      if(amount===null)throw Error((i+1)+'行目: 金額が不正、または返金行です。返金は現段階では自動登録しません。');
      if(/分割|リボ|ボーナス|据置|後から/i.test(norm(method))||
        (/(\d+)回/.test(norm(method))&&Number((norm(method).match(/(\d+)回/)||[])[1])>1))
        throw Error((i+1)+'行目: 分割・リボ等の明細は経済支出の重複防止を検証できないため、取込を停止しました。');
      const installment=(norm(method).match(/(\d+)回/)||[])[1];
      const cardTopup=/PASMO|SUICA|スイカ|パスモ/i.test(norm(merchant)) &&
        /チャージ|CHARGE|入金/i.test(norm(merchant)+' '+norm(note));
      const isExplicitTransfer=/資金移動|二重計上しない|支出に含めない/i.test(note);
      const transfer=cardTopup||isExplicitTransfer;
      const signature=rowSignature(billing,date,merchant,amount,user);
      const occurrence=(occ.get(signature)||0)+1;occ.set(signature,occurrence);
      parsed.push({billing,date,merchant,amount,method,user,note,installment:installment?Number(installment):null,
        transfer,occurrence,signature,review:note.includes('名称省略表示')||merchant.includes('…')});
    }
    if(!parsed.length)throw Error('dカードの有効な明細がありません。');
    return parsed;
  }
  function classify(entry){
    if(entry.transfer)return {economic_type:'TRANSFER',category:null,subcategory:null,scope:null,confidence:1};
    const text=normName(entry.merchant);
    let category=null,subcategory=null,scope='NORMAL',confidence=.65;
    if(/スターバックス|STARBUCKS/.test(text)){
      category='FOOD';subcategory='CAFE';confidence=.95;
    }else if(/NUMBERSUGAR|ＮＵＭＢＥＲＳＵＧＡＲ/.test(text)){
      category='FOOD';subcategory='OTHER';confidence=.8;
    }else if(/JAL国内線|ＪＡＬ国内線|航空券|AIRLINE/.test(text)){
      category='TRAVEL';subcategory='AIR';scope='SPECIAL';confidence=.95;
    }else{
      const sem=window.householdSemanticV47;
      category=sem?.inferCategory?.(entry.merchant)||null;
      subcategory=category?sem?.inferSubcategory?.(category,entry.merchant)||'OTHER':null;
      scope=category==='TRAVEL'?'SPECIAL':'NORMAL';
      confidence=category?.75:.4;
    }
    return {economic_type:'EXPENSE',category:category||'OTHER',subcategory:subcategory||'OTHER',scope,
      confidence:entry.review?Math.min(confidence,.6):confidence};
  }
  function importDCard(src,file){
    const entries=parseRows(src.text),st=stateNow();
    if(!st||!Array.isArray(st.purchaseEvents))throw Error('家計データが取得できません。');
    // Parse and validate every row before modifying state; malformed files are atomic.
    const newOnes=[],known=new Map(),addedByMonth={},addedByBillMonth={};
    for(const p of st.purchaseEvents){
      if(!isDCard(p.card))continue;
      const k=rowKeyOf(p),arr=known.get(k)||[];
      arr.push(p);known.set(k,arr);
    }
    let duplicates=0,read=entries.length,review=0,transfer=0,expense=0;
    let newBillTotal=0,sourceTotal=0,sourceExpense=0,sourceTransfer=0;
    for(const e of entries){
      sourceTotal+=e.amount;
      if(e.transfer)sourceTransfer+=e.amount;else sourceExpense+=e.amount;
      const same=known.get(e.signature)||[];
      if(same.some(x=>Number(x.occurrence_index||1)===e.occurrence)){
        duplicates++;continue;
      }
      const receiptStatement={
        card:'dカード',purchase_date:e.date,original_amount:e.amount,
        merchant_raw:e.merchant,billing_month:e.billing,source_file:file.name
      };
      const matchedReceipt=window.householdReceiptCycleV158?.matchExistingReceipt?.(st,receiptStatement);
      if(matchedReceipt){
        window.householdReceiptCycleV158.mergeStatement(st,receiptStatement);
        duplicates++;continue;
      }
      const c=classify(e);
      const p={
        purchase_id:'dcard:'+hash32(['dcard',e.signature,e.occurrence].join('|')),
        card:'dカード',dcard_user:e.user||'',source_file:file.name,record_kind:'CARD_PURCHASE',
        purchase_date:e.date,merchant_raw:e.merchant,merchant_normalized:normalizeText(e.merchant),
        original_amount:e.amount,billing_month:e.billing,occurrence_index:e.occurrence,
        payment_method:e.method,installment_count:e.installment,installment_number:null,
        economic_type:c.economic_type,spending_class:c.scope,
        expense_scope:c.scope,ordinary_or_special:c.scope||'TRANSFER',
        category:c.category,subcategory:c.subcategory,confidence:c.confidence,
        dcard_source_note:e.note,prepaid_topup:e.transfer,dcard_csv_import_v140:true
      };
      newOnes.push(p);
      const list=known.get(e.signature)||[];list.push(p);known.set(e.signature,list);
      addedByMonth[e.date.slice(0,7)]=(addedByMonth[e.date.slice(0,7)]||0)+1;
      addedByBillMonth[e.billing]=(addedByBillMonth[e.billing]||0)+e.amount;
      newBillTotal+=e.amount;
      if(e.transfer)transfer+=e.amount;else expense+=e.amount;
      if(e.review||c.confidence<.7)review++;
    }
    // Only fully validated records are committed. Do not create settlement
    // records from a possibly partial statement or assume its actual due date.
    for(const p of newOnes){
      st.purchaseEvents.push(p);
      if(p.confidence<.7&&typeof addReview==='function')
        addReview({source:'dカード',date:p.purchase_date,merchant:p.merchant_raw,confidence:p.confidence});
    }
    return {
      source:'dカード',detectedType:'dcard_csv',read,added:newOnes.length,duplicates,review,
      autoClassified:newOnes.length-review,latest:entries.map(x=>x.date).sort().at(-1)||'',
      card:'dカード',spendingTotal:expense,transferTotal:transfer,cardUsageTotal:newBillTotal,
      fileSpendingTotal:sourceExpense,fileTransferTotal:sourceTransfer,fileUsageTotal:sourceTotal,
      months:entries.map(x=>x.date.slice(0,7)).filter((v,i,a)=>a.indexOf(v)===i).sort(),
      addedByMonth,addedByBillMonth,partialStatement:true
    };
  }
  const previousDetect=typeof detectSource==='function'?detectSource:null;
  if(previousDetect){
    detectSource=function detectSourceDCardV140(file,buffer){
      const utf=new TextDecoder('utf-8').decode(buffer);
      try{if(dCardHeaderIndex(parseCsv(utf))>=0){
        return {type:'mufg_dc_jal_card',encoding:'utf-8',text:utf,
          detection:'dcard_schema',dcard_source:true};
      }}catch{}
      return previousDetect(file,buffer);
    };
  }
  const previousMufg=typeof parseMufg==='function'?parseMufg:null;
  if(previousMufg){
    parseMufg=function parseCardWithDCardV140(src,file){
      if(src?.dcard_source||dCardHeaderIndex(parseCsv(src?.text||''))>=0)
        return importDCard(src,file);
      return previousMufg(src,file);
    };
  }

  function dryRun(text,st=stateNow()){
    const entries=parseRows(text);
    const existing=(st?.purchaseEvents||[]).filter(p=>isDCard(p.card));
    const grouped=new Map();
    for(const p of existing){
      const k=rowKeyOf(p),list=grouped.get(k)||[];
      list.push(Number(p.occurrence_index||1));grouped.set(k,list);
    }
    let added=0,duplicates=0,hold=0,newConsumption=0,newTransfer=0;
    const previewOccurrences=new Map();
    for(const e of entries){
      const count=(previewOccurrences.get(e.signature)||0)+1;
      previewOccurrences.set(e.signature,count);
      if((grouped.get(e.signature)||[]).includes(count)){duplicates++;continue}
      added++;
      if(e.review)hold++;
      if(e.transfer)newTransfer+=e.amount;
      else newConsumption+=e.amount;
    }
    return {source:'dカード',read:entries.length,added,duplicates,updates:0,hold,
      newConsumption,newTransfer,
      fileTotal:entries.reduce((n,e)=>n+e.amount,0),
      purchaseMonths:[...new Set(entries.map(x=>x.date.slice(0,7)))].sort(),
      billMonths:[...new Set(entries.map(x=>x.billing))].sort()};
  }
  function confirmDryRun(diff) {
    const text=[
      'dカードCSV｜登録前の差分確認',
      '明細 '+diff.read+'件・ファイル収録利用額 '+diff.fileTotal.toLocaleString('ja-JP')+'円',
      '新規 '+diff.added+'件 / 既存重複 '+diff.duplicates+'件 / 更新 '+diff.updates+'件',
      '利用店名等の要確認 '+diff.hold+'件（登録後、明細から編集可）',
      '新規の家計消費 '+diff.newConsumption.toLocaleString('ja-JP')+'円',
      '新規のチャージ等の資金移動 '+diff.newTransfer.toLocaleString('ja-JP')+'円',
      '利用月 '+diff.purchaseMonths.join('、')+'　請求月 '+diff.billMonths.join('、'),
      '※請求額の確定やカード引落明細の作成はしません。',
      '既存の家計データを保持したまま、この差分を登録しますか？'
    ].join('\n');
    if(typeof window.confirm!=='function')
      throw Error('差分の保存確認を表示できないため、登録を停止しました。');
    return window.confirm(text);
  }

  let latestImport=null;
  const previousImport=typeof importOne==='function'?importOne:null;
  if(previousImport){
    importOne=async function importOneWithDCardV140(file){
      const buffer=await file.arrayBuffer(),utf=new TextDecoder('utf-8').decode(buffer);
      let dcard=false;
      try{dcard=dCardHeaderIndex(parseCsv(utf))>=0}catch{}
      if(dcard){
        const preview=dryRun(utf);
        if(!confirmDryRun(preview))return {source:'dカード（キャンセル）',added:0,duplicates:preview.duplicates,review:preview.hold,read:preview.read,cancelled:true,skipped:true};
      }
      const result=await previousImport(file);
      if(result?.detectedType==='dcard_csv'||result?.source==='dカード'){
        latestImport=result;
        try{showSummary(result)}catch(e){console.warn('d-card import summary',e)}
      }
      return result;
    };
  }
  function showSummary(r){
    const grid=document.querySelector('#imports .grid');
    if(!grid)return;
    let el=document.getElementById('dCardImportResultV140');
    if(!el){el=document.createElement('div');el.id='dCardImportResultV140';el.className='card full';grid.appendChild(el)}
    const fmt=n=>new Intl.NumberFormat('ja-JP').format(Number(n)||0)+'円';
    const months=r.months||[];
    el.innerHTML='<div class="title">dカードCSV 取込結果</div>'+
      '<div class="row"><span>検証した明細</span><b>'+r.read+'件</b></div>'+
      '<div class="row"><span>新規登録 / 重複除外</span><b>'+r.added+'件 / '+r.duplicates+'件</b></div>'+
      '<div class="row"><span>今回ファイルの支出対象</span><b>'+fmt(r.fileSpendingTotal)+'</b></div>'+
      '<div class="row"><span>チャージ等の資金移動</span><b>'+fmt(r.fileTransferTotal)+'</b></div>'+
      '<div class="row"><span>取込後の新規支出</span><b>'+fmt(r.spendingTotal)+'</b></div>'+
      '<div class="tiny" style="margin-top:8px">支出は利用月に計上します。請求月の金額はCSV収録分の合計であり、カード請求の確定額とは限りません。</div>'+
      '<div id="dCardImportMonthsV140" class="controls" style="margin-top:8px"></div>';
    const host=el.querySelector('#dCardImportMonthsV140');
    for(const month of months){
      const b=document.createElement('button');b.type='button';b.className='btn secondary';
      b.textContent=month.slice(0,4)+'年'+Number(month.slice(5,7))+'月の支出を見る';
      b.addEventListener('click',()=>{
        document.querySelector('[data-page="expenses"]')?.click();
        window.householdExpenseTabV130?.render?.(month);
      });host.appendChild(b);
    }
    window.dispatchEvent(new CustomEvent('treasury:expenses-imported',{detail:{source:'dcard',months}}));
  }
  window.householdDCardCsvV140={parseRows,importDCard,dryRun,confirmDryRun,showSummary,isDCard};
})();