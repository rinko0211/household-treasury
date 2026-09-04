import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL='https://vqgofvnqmformckkkyur.supabase.co';
const SUPABASE_KEY='sb_publishable_X0PF6BYxBWXtZPQtU6wzgQ_ud7nY-eO';
const SESSION_PASS_KEY='householdTreasuryVaultPassphrase';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const enc=new TextEncoder(),dec=new TextDecoder();
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let user=null,channel=null;

async function deriveKey(secret,salt){
  const base=await crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
}
async function decryptState(row,secret){
  const key=await deriveKey(secret,unb64(row.salt));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv)},key,unb64(row.ciphertext));
  return JSON.parse(dec.decode(plain));
}
async function archiveRow(row){
  if(!user||!row?.revision)return;
  const payload={user_id:user.id,revision:Number(row.revision),ciphertext:row.ciphertext,iv:row.iv,salt:row.salt,kdf_iterations:row.kdf_iterations||250000,version:row.version||1,writer_device:row.writer_device||null,updated_at:row.updated_at||new Date().toISOString()};
  const{error}=await supabase.from('household_sync_history').insert(payload);
  if(error&&error.code!=='23505')console.warn('history archive failed',error.message);
  renderHistory();
}
function ensureUi(){
  if(document.getElementById('cloudRevisionHistory'))return;
  const detail=document.getElementById('cloudDetail');if(!detail)return;
  const box=document.createElement('div');box.id='cloudRevisionHistory';box.className='note';box.style.marginTop='12px';box.innerHTML='<div class="title">クラウド世代履歴</div><div class="muted">履歴を確認中...</div>';detail.parentElement.appendChild(box);
}
async function restoreRevision(revision){
  if(!user)return;
  const pass=document.getElementById('vaultPassphrase')?.value||sessionStorage.getItem(SESSION_PASS_KEY)||'';
  if(pass.length<8){alert('暗号化パスフレーズを入力してください。');return}
  const{data,error}=await supabase.from('household_sync_history').select('*').eq('user_id',user.id).eq('revision',revision).maybeSingle();
  if(error||!data){alert(error?.message||'履歴を取得できませんでした。');return}
  if(!confirm(`revision ${revision} を復元します。現在状態は端末復旧履歴へ退避します。よろしいですか？`))return;
  try{
    window.treasuryRecoverySnapshot?.(`クラウド revision ${revision} 復元直前`);
    const state=await decryptState(data,pass);
    window.__treasuryRecoveryRestoring=true;
    try{window.replaceTreasuryState(state);window.repairTreasuryBankBalances?.()}finally{window.__treasuryRecoveryRestoring=false}
    window.setTreasurySaveStatus?.(`revision ${revision} を復元済み・再同期中`);
    window.cloudSyncOnLocalSave?.();
  }catch(e){alert(e.name==='OperationError'?'暗号化パスフレーズが違います。':e.message)}
}
async function renderHistory(){
  ensureUi();const box=document.getElementById('cloudRevisionHistory');if(!box)return;
  if(!user){box.innerHTML='<div class="title">クラウド世代履歴</div><div class="muted">サインイン後に表示します。</div>';return}
  const{data,error}=await supabase.from('household_sync_history').select('revision,updated_at,writer_device').eq('user_id',user.id).order('revision',{ascending:false}).limit(12);
  if(error){box.innerHTML=`<div class="title">クラウド世代履歴</div><div class="bad">${error.message}</div>`;return}
  const rows=(data||[]).map(x=>`<div class="row"><div><b>revision ${x.revision}</b><div class="tiny">${new Date(x.updated_at).toLocaleString('ja-JP')}</div></div><button class="btn secondary" data-cloud-rev="${x.revision}">復元</button></div>`).join('');
  box.innerHTML=`<div class="title">クラウド世代履歴 <span class="tag">${(data||[]).length}件表示</span></div>${rows||'<div class="muted">履歴はまだありません。</div>'}`;
  box.querySelectorAll('[data-cloud-rev]').forEach(b=>b.addEventListener('click',()=>restoreRevision(Number(b.dataset.cloudRev))));
}
async function captureCurrent(){
  if(!user)return;
  const{data,error}=await supabase.from('household_sync_state').select('*').eq('user_id',user.id).maybeSingle();
  if(!error&&data)await archiveRow(data);
}
async function subscribe(){
  if(channel){await supabase.removeChannel(channel);channel=null}
  if(!user)return;
  channel=supabase.channel(`household-history-${user.id}-${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'household_sync_state',filter:`user_id=eq.${user.id}`},async payload=>{if(payload.new)await archiveRow(payload.new)}).subscribe();
}
async function start(session){
  user=session?.user||null;ensureUi();await renderHistory();if(!user)return;await captureCurrent();await subscribe();
}
supabase.auth.onAuthStateChange(async(_event,session)=>start(session));
(async()=>{const{data}=await supabase.auth.getSession();await start(data.session)})();
