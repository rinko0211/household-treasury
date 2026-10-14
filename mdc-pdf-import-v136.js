(() => {
  if(window.__mdcPdfImportV136)return;
  window.__mdcPdfImportV136=true;
  const cdn='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
  const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]/g,'');
  function items(page){
    return (page.items||[]).filter(p=>p&&String(p.text||'').trim()).map(p=>({
      x:Number(p.x)*595/Number(page.width||595),y:Number(p.y),text:String(p.text)
    })).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))
      .sort((a,b)=>a.y-b.y||a.x-b.x);
  }
  function lines(page,tolerance=5.3){
    const rows=[];
    for(const part of items(page)){
      const found=rows.findLast(r=>Math.abs(r.y-part.y)<=tolerance);
      if(found)found.parts.push(part);
      else rows.push({y:part.y,parts:[part]});
    }
    rows.forEach(r=>r.parts.sort((a,b)=>a.x-b.x));
    return rows;
  }
  function nearField(page,label){
    const ps=items(page);
    const found=ps.find(p=>norm(p.text).includes(label));
    if(!found)return '';
    return norm(ps.filter(p=>Math.abs(p.y-found.y)<8&&p.x>=found.x)
      .sort((a,b)=>a.x-b.x).map(p=>p.text).join(''));
  }
  function readStatement(pages){
    if(!Array.isArray(pages)||pages.length<2)throw Error('MDC-P01: 明細ページが不足しています。');
    const head=lines(pages[0]).map(row=>norm(row.parts.map(p=>p.text).join('')));
    const all=head.join('');
    if(!all.includes('ご利用明細書')||!all.includes('当月ご請求額')||!all.includes('お支払日'))
      throw Error('MDC-P02: MDCのご利用明細書を認識できません。');
    let pay=head.find(s=>s.includes('お支払日')&&/令和\d+年\d+月\d+日/.test(s))||'';
    if(!pay)pay=nearField(pages[0],'お支払日');
    const p=pay.match(/お支払日.*?令和(\d+)年(\d+)月(\d+)日/);
    if(!p)throw Error('MDC-P03: 支払日が判読できません。');
    const paymentDate=[2018+Number(p[1]),String(Number(p[2])).padStart(2,'0'),String(Number(p[3])).padStart(2,'0')].join('-');
    let summary=head.find(s=>s.includes('当月ご請求額')&&/[\d,]+円/.test(s))||'';
    if(!/当月ご請求額[\d,]+円/.test(summary))summary=nearField(pages[0],'当月ご請求額');
    const match=summary.match(/当月ご請求額([\d,]+)円/);
    if(!match)throw Error('MDC-P04: 請求合計が判読できません。');
    const total=Number(match[1].replace(/,/g,''));
    if(!Number.isSafeInteger(total)||total<0)throw Error('MDC-P05: 請求合計が不正です。');
    const entries=[];
    for(const page of pages.slice(1)){
      const ps=items(page), dates=[];
      // Associate each purchase with its date row, not the preceding/following fee annotation.
      const dateParts=ps.filter(x=>x.x<57),dateRows=[];
      for(const part of dateParts){
        const hit=dateRows.findLast(r=>Math.abs(r.y-part.y)<=4.7);
        if(hit)hit.parts.push(part);
        else dateRows.push({y:part.y,parts:[part]});
      }
      for(const row of dateRows){
        const dateRaw=norm(row.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(''));
        const d=dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2})$/);
        if(!d)continue;
        const year=2018+Number(d[1]),month=Number(d[2]),day=Number(d[3]);
        const dt=new Date(year,month-1,day);
        if(dt.getFullYear()!==year||dt.getMonth()+1!==month||dt.getDate()!==day)
          throw Error('MDC-P06: 利用日が不正です ('+dateRaw+')');
        const date=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
        const line=ps.filter(x=>Math.abs(x.y-row.y)<5.1).sort((a,b)=>a.x-b.x);
        const merchant=line.filter(x=>x.x>=57&&x.x<268).map(x=>x.text).join('').trim();
        const num=norm(line.filter(x=>x.x>=299&&x.x<354).map(x=>x.text).join('')).replace(/,/g,'');
        const amount=/^\d+$/.test(num)?Number(num):NaN;
        const count=Number(norm(line.filter(x=>x.x>=268&&x.x<299).map(x=>x.text).join('')))||1;
        if(!merchant||!Number.isSafeInteger(amount)||amount<=0)
          throw Error('MDC-P07: 利用明細の行が判読できません ('+date+'、'+entries.length+'件目の次)');
        entries.push({date,merchant,amount,count});
      }
    }
    if(!entries.length)throw Error('MDC-P08: 利用明細の文字を抽出できません。');
    if(entries.length>400)throw Error('MDC-P09: 明細件数が上限を超えています。');
    const sum=entries.reduce((n,e)=>n+e.amount,0);
    if(sum!==total)throw Error('MDC-P10: 明細'+entries.length+'件の合計 '+yen(sum)+' と請求額 '+yen(total)+' が不一致。保存は実行していません。');
    return {entries,paymentDate,total,card:all.includes('JALカード')?'JALカード':'MDCカード'};
  }
  function toCsv(p){
    const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const header=['確定情報','ご利用日','ご利用店名（海外ご利用店名／海外都市名）','ご利用金額（円）','支払回数','何回目','お支払日'];
    return [header,...p.entries.map(e=>['確定',e.date.replace(/-/g,'/'),e.merchant,e.amount,e.count,'',p.paymentDate.replace(/-/g,'/')])]
      .map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  async function parseFile(file){
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw Error('MDC-F01: PDFを選択してください。');
    if(file.size>20*1024*1024)throw Error('MDC-F02: 20MBを超えるPDFは対応していません。');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const providers=[
      {module:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',
       worker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'},
      {module:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs',
       worker:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'},
      {module:'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.min.mjs',
       worker:'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'}
    ];
    const failures=[];
    for(let i=0;i<providers.length;i++){
      const provider=providers[i];
      let doc;
      try{
        const pdfjs=await import(provider.module);
        pdfjs.GlobalWorkerOptions.workerSrc=provider.worker;
        doc=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
        if(doc.numPages>30)throw Error('ページ数が多すぎます。');
        const pages=[];
        for(let j=1;j<=doc.numPages;j++){
          const page=await doc.getPage(j),content=await page.getTextContent();
          const width=page.view[2]-page.view[0],height=page.view[3]-page.view[1];
          pages.push({width,items:content.items.filter(t=>typeof t.str==='string').map(t=>({
            x:t.transform[4]-page.view[0],y:height-(t.transform[5]-page.view[1]),text:t.str
          }))});
          page.cleanup();
        }
        if(pages.reduce((n,page)=>n+page.items.length,0)<25)
          throw Error('PDFの文字情報が不足しています。画像のみのPDFには対応していません。');
        return readStatement(pages);
      }catch(e){
        const message=String(e?.message||e||'不明なエラー').slice(0,160);
        // Data and statement-structure errors will not improve by trying a different CDN.
        if(/^MDC-P\d+:/.test(message))throw e;
        failures.push((i+1)+':'+message);
      }finally{if(doc)try{await doc.destroy()}catch{}}
    }
    throw Error('MDC-F03: PDF解析ライブラリの起動に失敗しました。'+failures.join(' / '));
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