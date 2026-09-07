(() => {
  if(window.__mobileImportV73||!window.matchMedia?.('(max-width:820px)').matches)return;
  window.__mobileImportV73=true;
  const $=id=>document.getElementById(id);
  function install(){
    const drop=$('drop'),input=$('csvInput');if(!drop||!input)return;
    if(drop.dataset.mobileNativePickerV73==='1')return;
    drop.dataset.mobileNativePickerV73='1';
    // Remove the old parent onclick -> input.click() recursion. A native label is
    // more reliable in iOS/PWA and keeps the file chooser inside a trusted tap.
    drop.onclick=null;
    input.classList.remove('hidden');
    Object.assign(input.style,{position:'fixed',left:'-10000px',top:'0',width:'1px',height:'1px',opacity:'0'});
    const label=document.createElement('label');
    label.id='mobileCsvPickerV73';label.htmlFor='csvInput';label.className='btn';
    label.style.cssText='display:flex;min-height:68px;width:100%;align-items:center;justify-content:center;flex-direction:column;gap:5px;text-align:center;cursor:pointer';
    label.innerHTML='<b>CSV / TSVを選択</b><span class="tiny">銀行・カード明細。複数ファイル選択可</span>';
    drop.replaceChildren(label,input);
    drop.style.padding='0';drop.style.border='0';drop.style.cursor='default';
  }
  window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='imports')install()});
  window.addEventListener('pageshow',install);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
