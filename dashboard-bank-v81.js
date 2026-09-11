(() => {
  if(window.__dashboardBankV81)return;window.__dashboardBankV81=true;
  const $=id=>document.getElementById(id),stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let timer=null;

  function keyOf(source){const s=norm(source);if(!s)return null;if(s.includes('SECURITIES')||s.includes('証券'))return null;if(s.includes('RAKUTENBANK')||s.includes('楽天銀行'))return'rakuten';if(s.includes('YUCHO')||s.includes('ゆうちょ')||s.includes('郵貯'))return'yucho';if(s.includes('BANK')||s.includes('銀行'))return'other';return null}
  const label={rakuten:'楽天銀行',yucho:'ゆうちょ',other:'その他銀行'};
  function balances(){
    const st=stateNow(),latest={};
    (st.cashTransactions||[]).forEach((t,i)=>{const k=keyOf(t.source);if(!k||t.balance_after===null||t.balance_after===''||!Number.isFinite(Number(t.balance_after))||!t.date)return;const cand={key:k,label:label[k],value:Number(t.balance_after),date:String(t.date),source:String(t.source||''),index:i},cur=latest[k];if(!cur||cand.date>cur.date||(cand.date===cur.date&&cand.index>cur.index))latest[k]=cand});
    const rows=['rakuten','yucho','other'].map(k=>latest[k]).filter(Boolean),sum=rows.reduce((a,x)=>a+x.value,0),cash=Number(st.settings?.cash)||0;return{rows,sum,cash};
  }
  function ensure(){const root=$('dashboardPlanningV79');if(!root)return null;let card=$('dashboardBankV81');if(card)return card;card=document.createElement('div');card.id='dashboardBankV81';card.className='card full';card.innerHTML='<div class="title">銀行口座残高 <span class="tag">v81</span></div><div id="dashboardBankRowsV81"></div>';const minima=$('dashMinimaV79')?.closest('.card.full');minima?.after(card);if(!minima)root.prepend(card);return card}
  function render(){const card=ensure(),host=$('dashboardBankRowsV81');if(!card||!host)return;const b=balances();host.innerHTML=b.rows.length?`${b.rows.map(r=>`<div class="row"><div><b>${esc(r.label)}</b><div class="tiny">最新残高 ${esc(r.date)}${r.source&&norm(r.source)!==norm(r.label)?` · ${esc(r.source)}`:''}</div></div><b class="amt">${yen(r.value)}</b></div>`).join('')}<div class="row"><span>口座明細の最新合計</span><b>${yen(b.sum)}</b></div><div class="row"><span>Cash Flow開始残高</span><b>${yen(b.cash)}</b></div>${Math.abs(b.sum-b.cash)>1?`<div class="note warn" style="margin-top:8px">口座明細合計とCash Flow開始残高に ${yen(b.cash-b.sum)} の差があります。未取込口座・現金・最新明細時点の違いが考えられます。</div>`:''}`:`<div class="row"><span>現在の流動資金</span><b>${yen(b.cash)}</b></div><div class="tiny">残高付き銀行CSVを取り込むと、銀行別の預金額をここに表示します。</div>`}
  }
  function schedule(ms=120){clearTimeout(timer);timer=setTimeout(render,ms)}
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="dashboard"]'))schedule(150)},false);window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='dashboard')schedule(160)});window.addEventListener('pageshow',()=>schedule(220));
  const prev=window.replaceTreasuryState;if(typeof prev==='function'&&!window.__dashboardBankReplaceV81){window.__dashboardBankReplaceV81=true;window.replaceTreasuryState=function(n){const r=prev(n);schedule(180);return r}}
  setTimeout(()=>schedule(260),0);window.householdDashboardBankV81={render,balances};
})();
