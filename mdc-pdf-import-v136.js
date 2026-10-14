(() => {
  if(window.__mdcPdfImportV136)return;
  window.__mdcPdfImportV136=true;
  const cdn='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
  const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]/g,'');
  function lines(page){
    const parts=(page.items||[]).filter(p=>p&&String(p.text||'').trim())
      .map(p=>({x:Number(p.x)*595/Number(page.width||595),y:Number(p.y),text:String(p.text)}))
      .sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows=[];
    for(const p of parts){
      const last=rows.at(-1);
      if(last&&Math.abs(last.y-p.y)<2.7)last.parts.push(p);
      else rows.push({y:p.y,parts:[p]});
    }
    rows.forEach(r=>r.parts.sort((a,b)=>a.x-b.x));
    return rows;
  }
  function readStatement(pages){
    if(!Array.isArray(pages)||pages.length<2)throw Error('明細ページが不足しています。');
    const head=lines(pages[0]).map(row=>norm(row.parts.map(p=>p.text).join('')));
    const all=head.join('');
    if(!all.includes('ご利用明細書')||!all.includes('当月ご請求額')||!all.includes('お支払日'))
      throw Error('MDCのご利用明細書を認識できません。');
    const pay=head.find(s=>s.includes('お支払日')&&/令和\d+年\d+月\d+日/.test(s));
    const p=pay&&pay.match(/お支払日.*?令和(\d+)年(\d+)月(\d+)日/);
    if(!p)throw Error('支払日が判読できません。');
    const paymentDate=[2018+Number(p[1]),String(Number(p[2])).padStart(2,'0'),String(Number(p[3])).padStart(2,'0')].join('-');
    const summary=head.find(s=>s.includes('当月ご請求額')&&/[\d,]+円/.test(s));
    const match=summary&&summary.match(/当月ご請求額([\d,]+)円/);
    if(!match)throw Error('請求合計が判読できません。');
    const total=Number(match[1].replace(/,/g,''));
    const entries=[];
    for(const page of pages.slice(1)){
      for(const row of lines(page)){
        const dateRaw=norm(row.parts.filter(x=>x.x<57).map(x=>x.text).join(''));
        const d=dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2})$/);
        if(!d)continue;
        const year=2018+Number(d[1]),month=Number(d[2]),day=Number(d[3]);
        const dt=new Date(year,month-1,day);
        if(dt.getFullYear()!==year||dt.getMonth()+1!==month||dt.getDate()!==day)throw Error('利用日が不正: '+dateRaw);
        const date=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
        const merchant=row.parts.filter(x=>x.x>=57&&x.x<268).map(x=>x.text).join('').trim();
        const num=norm(row.parts.filter(x=>x.x>=299&&x.x<354).map(x=>x.text).join('')).replace(/,/g,'');
        const amount=/^\d+$/.test(num)?Number(num):NaN;
        const count=Number(norm(row.parts.filter(x=>x.x>=268&&x.x<299).map(x=>x.text).join('')))||1;
        if(!merchant||!Number.isSafeInteger(amount)||amount<=0)throw Error('明細行を判読できません: '+date);
        entries.push({date,merchant,amount,count});
      }
    }
    if(!entries.length)throw Error('テキスト明細を抽出できません。画像のみのPDFは非対応です。');
    if(entries.length>400)throw Error('明細件数が上限を超えています。');
    const sum=entries.reduce((n,e)=>n+e.amount,0);
    if(sum!==total)throw Error('明細合計 '+yen(sum)+' と請求額 '+yen(total)+' が不一致のため、取込を停止しました。');
    return {entries,paymentDate,total,card:all.includes('JALカード')?'JALカード':'MDCカード'};
  }
  function toCsv(p){
    const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const header=['確定情報','ご利用日','ご利用店名（海外ご利用店名／海外都市名）','ご利用金額（円）','支払回数','何回目','お支払日'];
    return [header,...p.entries.map(e=>['確定',e.date.replace(/-/g,'/'),e.merchant,e.amount,e.count,'',p.paymentDate.replace(/-/g,'/')])]
      .map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  async function parseFile(file){
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw Error('PDFを選択してください。');
    if(file.size>20*1024*1024)throw Error('20MBを超えるPDFは対応していません。');
    let pdfjs;
    try{pdfjs=await import(cdn+'pdf.min.mjs');}
    catch{throw Error('PDF解析ライブラリを取得できません。ネット接続を確認してください。');}
    pdfjs.GlobalWorkerOptions.workerSrc=cdn+'pdf.worker.min.mjs';
    let doc;
    try{
      doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
      if(doc.numPages>30)throw Error('ページ数が多すぎます。');
      const pages=[];
      for(let i=1;i<=doc.numPages;i++){
        const pg=await doc.getPage(i),content=await pg.getTextContent();
        const w=pg.view[2]-pg.view[0],h=pg.view[3]-pg.view[1];
        pages.push({width:w,items:content.items.filter(x=>typeof x.str==='string').map(t=>({
          x:t.transform[4]-pg.view[0],y:h-(t.transform[5]-pg.view[1]),text:t.str
        }))});
        pg.cleanup();
      }
      return readStatement(pages);
    }finally{if(doc)await doc.destroy();}
  }
  function mount(){
    const grid=document.querySelector('#imports .grid');
    if(!grid||document.getElementById('mdcPdfImportV136'))return;
    const card=document.createElement('div');card.id='mdcPdfImportV136';card.className='card full';
    card.innerHTML='<div class="title">MDC / JALカード PDF明細</div>'+
      '<div class="tiny" style="margin:8px 0">スマホで保存した文字付きPDFに対応。解析・請求額検証は端末内で行い、確認後にのみ明細を保存します。</div>'+
      '<button class="btn secondary" type="button" id="mdcPdfChooseV136">PDFを選択</button>'+
      '<input class="hidden" id="mdcPdfFileV136" type="file" accept=".pdf,application/pdf">'+
      '<div id="mdcPdfOutputV136" style="margin-top:12px"></div>';
    grid.appendChild(card);
    const input=card.querySelector('#mdcPdfFileV136'),output=card.querySelector('#mdcPdfOutputV136');
    card.querySelector('#mdcPdfChooseV136').onclick=()=>input.click();
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      output.textContent='PDFの文字情報を解析中…';
      try{
        const p=await parseFile(file);
        const list=p.entries.slice(0,6).map(e=>'<div class="row"><span>'+esc(e.date)+' '+esc(e.merchant)+'</span><b>'+yen(e.amount)+'</b></div>').join('');
        output.innerHTML='<div class="note">照合成功。データはまだ保存されていません。</div>'+
          '<div class="row"><span>支払日</span><b>'+esc(p.paymentDate)+'</b></div>'+
          '<div class="row"><span>明細</span><b>'+p.entries.length+'件</b></div>'+
          '<div class="row"><span>請求額＝明細合計</span><b>'+yen(p.total)+'</b></div>'+
          '<details><summary>明細プレビュー（6件）</summary>'+list+'</details>'+
          '<button class="btn" id="mdcPdfCommitV136" type="button">確認して取り込む</button>'+
          '<div class="tiny" id="mdcPdfResultV136" style="margin-top:8px"></div>';
        const saveBtn=card.querySelector('#mdcPdfCommitV136'),status=card.querySelector('#mdcPdfResultV136');
        saveBtn.onclick=async()=>{
          if(saveBtn.disabled)return;
          if(typeof importOne!=='function'){status.textContent='既存の取込エンジンが利用できません。';return;}
          saveBtn.disabled=true;status.textContent='重複照合と登録中…';
          try{
            const csv=toCsv(p);
            const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(csv));
            const shortHash=Array.from(new Uint8Array(digest).slice(0,8),x=>x.toString(16).padStart(2,'0')).join('');
            const name='MDC_PDF_'+p.paymentDate.slice(0,7)+'_'+shortHash+'.csv';
            const synthetic=new File([csv],name,{type:'text/csv;charset=utf-8'});
            const result=await importOne(synthetic);
            status.textContent='取込完了: 新規'+(result.added||0)+'件、重複'+(result.duplicates||0)+'件、要確認'+(result.review||0)+'件。';
            if(typeof render==='function')render();
          }catch(e){saveBtn.disabled=false;status.textContent='取込失敗: '+String(e?.message||e);}
        };
      }catch(e){output.textContent='解析停止: '+String(e?.message||e);}
      finally{input.value='';}
    };
  }
  window.householdMdcPdfImportV136={readStatement,toCsv,mount};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else setTimeout(mount,0);
})();