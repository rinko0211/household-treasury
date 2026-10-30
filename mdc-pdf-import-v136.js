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
    const card=all.includes('JALカード')?'JALカード':'MDCカード';
    const numberLine=head.find(x=>x.includes('会員番号'))||'';
    const memberToken=String(numberLine.split('会員番号')[1]||'').slice(0,35).replace(/[^0-9Xx]/g,'').toUpperCase();
    const fingerprint=s=>{
      let h=2166136261;
      for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
      return (h>>>0).toString(16).padStart(8,'0').toUpperCase();
    };
    const cardLabel=memberToken.length>=12?card+'-'+fingerprint(memberToken).slice(-6):card+'①';
    return {entries,paymentDate,total,card,cardLabel,cardIdentityDetected:memberToken.length>=12};
  }
  function toLegacyCsv(p){
    const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const header=['確定情報','ご利用日','ご利用店名（海外ご利用店名／海外都市名）','ご利用金額（円）','支払回数','何回目','お支払日'];
    return [header,...p.entries.map(e=>['確定',e.date.replace(/-/g,'/'),e.merchant,e.amount,e.count,'',p.paymentDate.replace(/-/g,'/')])]
      .map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  function toCsv(p,identity=p.cardLabel||'JALカード①',oldFilename='',differentCard=false){
    const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const header=['確定情報','ご利用日','ご利用店名（海外ご利用店名／海外都市名）','ご利用金額（円）','支払回数','何回目','お支払日','MDCカード識別子','MDC旧版CSVファイル','MDC別カードとして登録'];
    return [header,...p.entries.map(e=>['確定',e.date.replace(/-/g,'/'),e.merchant,e.amount,e.count,'',p.paymentDate.replace(/-/g,'/'),identity,oldFilename,differentCard?'YES':''])]
      .map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  async function syntheticFilename(p,csv){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(csv));
    const shortHash=Array.from(new Uint8Array(digest).slice(0,8),x=>x.toString(16).padStart(2,'0')).join('');
    return 'MDC_PDF_'+p.paymentDate.slice(0,7)+'_'+shortHash+'.csv';
  }
  async function parseFile(file){
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw Error('MDC-F01: PDFを選択してください。');
    if(file.size>20*1024*1024)throw Error('MDC-F02: 20MBを超えるPDFは対応していません。');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const providers=[
      {module:'./vendor/pdfjs/pdf.min.mjs?v=137',worker:'./vendor/pdfjs/pdf.worker.min.mjs?v=137'},
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
        doc=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,useSystemFonts:true}).promise;
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
        const itemCounts=pages.map(page=>page.items.filter(x=>String(x.text||'').trim()).length);
        if(!itemCounts.some(Boolean))
          throw Error('MDC-F04: PDFから文字を抽出できません。ページ別文字項目数: '+itemCounts.join(',')+'。この形式では日本語CMapが必要です。');
        return readStatement(pages);
      }catch(e){
        const message=String(e?.message||e||'不明なエラー').slice(0,160);
        // Data and statement-structure errors will not improve by trying a different CDN.
        if(/^MDC-[PF]\d+:/.test(message))throw e;
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
          '<div class="tiny" style="margin-top:9px">カード識別名（異なるJALカードは別名、同じカードは同じ名前）</div>'+
          '<input id="mdcPdfCardLabelV139" type="text" maxlength="70" value="'+esc(p.cardLabel)+'" style="width:100%;margin-top:4px">'+
          '<div class="tiny">'+(p.cardIdentityDetected?'カード番号の伏字部分から自動識別。必要なら変更できます。':'カード番号を自動識別できません。別カードなら識別名を変更してください。')+'</div>'+
          '<div class="tiny" style="margin-top:6px">支出は引落月ではなく利用月に計上されます。'+[...new Set(p.entries.map(e=>e.date.slice(0,7)))].sort().join('、')+'の明細が対象です。</div>'+
          '<details><summary>明細プレビュー（6件）</summary>'+list+'</details>'+
          '<div class="note" id="mdcPdfDeltaPreviewV144" style="margin-top:9px">登録済み明細との差分を照合中…</div>'+
          '<label class="tiny" style="display:block;margin:9px 0"><input type="checkbox" id="mdcPdfDifferentCardV144"> 既存と明細が重なりますが、実際に別のカードとして登録する（確認が必要な場合のみ）</label>'+
          '<div class="note" style="margin:9px 0">まだ支出へ登録していません。次の「確認して取り込む」で保存します。</div>'+
          '<button class="btn" id="mdcPdfCommitV136" type="button">確認して取り込む</button>'+
          '<div class="tiny" id="mdcPdfResultV136" style="margin-top:8px"></div>';
        const saveBtn=card.querySelector('#mdcPdfCommitV136'),status=card.querySelector('#mdcPdfResultV136');
        const labelInput=card.querySelector('#mdcPdfCardLabelV139'),
          otherCard=card.querySelector('#mdcPdfDifferentCardV144'),
          previewBox=card.querySelector('#mdcPdfDeltaPreviewV144');
        const approvals={};
        const checkDelta=()=>{
          const identity=String(labelInput.value||'').normalize('NFKC').trim();
          if(!identity){saveBtn.disabled=true;previewBox.textContent='カード識別名が必要です。';return null}
          const engine=window.householdMdcPdfDeltaV144;
          if(!engine?.previewPdf){saveBtn.disabled=true;previewBox.textContent='差分照合機能が読み込まれていません。';return null}
          try{
            const delta=engine.previewPdf(p,identity,otherCard.checked,approvals);
            const cross=window.householdJalCrossSourceV166?.scanPdfPreview?.(p)||[];
            const blocked=delta.pending?.length||delta.issues.some(x=>
              x.startsWith('MDC-D11:')||x.startsWith('MDC-R18:')||x.startsWith('MDC-X3'));
            const overlapUI=(delta.overlaps||[]).map(item=>{
              const choices=item.candidates.map(c=>
                '<option value="'+esc(c.ref)+'"'+(approvals[item.token]===c.ref?' selected':'')+'>'+
                esc((c.kind==='cash'?'旧CSV/現金':'旧CSV/カード')+'：'+c.label+
                  '（'+c.payment+'）')+'</option>').join('');
              return '<label class="field" style="margin:8px 0">'+
                '<span>'+esc(item.date+' '+item.merchant)+' '+yen(item.amount)+'</span>'+
                '<select data-mdc-csv-choice="'+esc(item.token)+'" style="width:100%">'+
                '<option value="">未確認（保存不可）</option>'+choices+
                '<option value="separate"'+(approvals[item.token]==='separate'?' selected':'')+
                '>別の支出なので新規登録</option></select></label>';
            }).join('');
            previewBox.innerHTML=
              '<b>今回の差分：新規 '+delta.added+'件／登録済み '+delta.duplicates+
              '件／旧CSVから置換 '+(delta.migratedCash||0)+'件／未確認 '+(delta.pending?.length||0)+'件</b>'+
              '<div class="tiny">CSVとPDFは取り込む前に1対1で照合します。旧CSVが現金扱いでも、カード払いと確認した取引だけ置換し、二重計上を防ぎます。</div>'+
              (overlapUI?'<details open style="margin-top:10px"><summary>既存CSVとの照合 '+(delta.overlaps||[]).length+'件</summary>'+
                '<div class="tiny">支払先が異なる同日・同額の明細は、自動で重複扱いにしません。対応する旧明細を選ぶか、別取引として新規登録を選択してください。</div>'+
                overlapUI+'</details>':'')+
              (delta.pending?.length?'<div class="note" style="margin-top:8px;color:#ffc78d">CSVとの照合が残っています。選択が完了するまで保存できません。</div>':'')+
              (delta.issues.length?'<div class="tiny" style="margin-top:7px">'+
                delta.issues.map(esc).join(' / ')+'</div>':'')+
              (delta.conflicts?.length&&blocked?'<button class="btn secondary" id="mdcPdfUseExistingV144" type="button" style="margin-top:8px">以前のカード識別名「'+esc(delta.conflicts[0].identity)+'」を使う</button>':'');
            previewBox.querySelectorAll('[data-mdc-csv-choice]').forEach(sel=>sel.addEventListener('change',()=>{
              if(sel.value)approvals[sel.dataset.mdcCsvChoice]=sel.value;
              else delete approvals[sel.dataset.mdcCsvChoice];
              checkDelta();
            }));
            const useExisting=card.querySelector('#mdcPdfUseExistingV144');
            if(useExisting)useExisting.onclick=()=>{labelInput.value=delta.conflicts[0].identity;otherCard.checked=false;checkDelta()};
            saveBtn.disabled=blocked;
            return blocked?null:delta;
          }catch(e){saveBtn.disabled=true;previewBox.textContent='差分照合できません: '+String(e?.message||e);return null}
        };
        labelInput.addEventListener('input',checkDelta);
        otherCard.addEventListener('change',checkDelta);
        checkDelta();
        saveBtn.onclick=async()=>{
          if(saveBtn.disabled)return;
          if(typeof importOne!=='function'){status.textContent='既存の取込エンジンが利用できません。';return;}
          const verifiedDelta=checkDelta();
          if(!verifiedDelta)return;
          // Unresolved CSV overlaps are blocked in checkDelta(), not merely
          // warned about after the duplicate has already been imported.
          saveBtn.disabled=true;status.textContent='差分照合と登録中…';
          try{
            const identity=String(card.querySelector('#mdcPdfCardLabelV139')?.value||'').normalize('NFKC').trim();
            if(!identity)throw Error('カード識別名を入力してください。');
            const oldName=await syntheticFilename(p,toLegacyCsv(p));
            const csv=toCsv(p,identity,oldName,otherCard.checked);
            const name=await syntheticFilename(p,csv);
            const synthetic=new File([csv],name,{type:'text/csv;charset=utf-8'});
            window.householdMdcPdfDeltaV144?.setImportApprovals?.(p,identity,approvals);
            let result;
            try{result=await importOne(synthetic)}
            finally{window.householdMdcPdfDeltaV144?.setImportApprovals?.(null)}

            // The ledger was saved; never silently drop an existing receipt.
            // Prompt a manual one-to-one cross-source review.
            const remainingCross=window.householdJalCrossSourceV166?.scan?.()||[];

            const months=[...new Set(p.entries.map(e=>e.date.slice(0,7)))].sort();
            const counts=Object.fromEntries(months.map(month=>[month,p.entries.filter(e=>e.date.startsWith(month)).length]));
            status.innerHTML='<b>取込済み</b>：新規'+Number(result.added||0)+'件、既存'+Number(result.duplicates||0)+'件、旧CSVから置換'+Number(result.migratedCash||0)+'件、旧版データ識別更新'+Number(result.upgraded||0)+'件。'+
              ((result.issues||[]).length?'<div class="tiny">'+(result.issues||[]).map(esc).join(' / ')+'</div>':'')+
              (remainingCross.length?'<div class="note" style="color:#ffd38e">取込後にも未照合の候補 '+remainingCross.length+'組があります。二重計上の点検欄を確認してください。</div>':'')+
              '<div class="tiny">利用月：'+months.map(m=>m+'（'+counts[m]+'件）').join('、')+'。支払月'+p.paymentDate.slice(0,7)+'ではありません。</div>'+
              '<div class="controls" id="mdcPdfMonthLinksV139"></div>';
            const host=card.querySelector('#mdcPdfMonthLinksV139');
            for(const month of months){
              const button=document.createElement('button');button.type='button';button.className='btn secondary';
              button.textContent=month.slice(0,4)+'年'+Number(month.slice(5,7))+'月の支出を見る';
              button.addEventListener('click',()=>{
                const tab=document.querySelector('[data-page="expenses"]');
                if(tab)tab.click();
                window.householdExpenseTabV130?.render?.(month);
              });
              host.appendChild(button);
            }
            window.dispatchEvent(new CustomEvent('treasury:expenses-imported',{detail:{months,source:'MDC_PDF'}}));
            if(typeof render==='function')render();
            checkDelta();
          }catch(e){saveBtn.disabled=false;status.textContent='取込失敗: '+String(e?.message||e);}
        };
      }catch(e){output.textContent='解析停止: '+String(e?.message||e);}
      finally{input.value='';}
    };
  }
  window.householdMdcPdfImportV136={readStatement,toCsv,toLegacyCsv,syntheticFilename,mount};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else setTimeout(mount,0);
})();