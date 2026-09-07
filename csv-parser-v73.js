(function(root){
  function parseCsvV73(text, separator=','){
    const src=String(text??'').replace(/^\uFEFF/,'');
    const rows=[];let row=[],field='',quoted=false;
    const pushField=()=>{row.push(field.trim());field=''};
    const pushRow=()=>{pushField();if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[]};
    for(let i=0;i<src.length;i++){
      const c=src[i];
      if(c==='"'){
        if(quoted&&src[i+1]==='"'){field+='"';i++;continue}
        quoted=!quoted;continue;
      }
      if(c===separator&&!quoted){pushField();continue}
      if((c==='\n'||c==='\r')&&!quoted){
        if(c==='\r'&&src[i+1]==='\n')i++;
        pushRow();continue;
      }
      field+=c;
    }
    if(quoted)throw new Error('CSVのダブルクォートが閉じられていません。');
    if(field!==''||row.length)pushRow();
    return rows;
  }
  if(root){
    if(typeof root.parseCsv==='function'&&!root.parseCsvLegacyV8)root.parseCsvLegacyV8=root.parseCsv;
    root.parseCsv=parseCsvV73;
    root.householdCsvParserV73={parseCsv:parseCsvV73};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={parseCsvV73};
})(typeof window!=='undefined'?window:null);
