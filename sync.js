import './rakuten-bank.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL='https://vqgofvnqmformckkkyur.supabase.co';
const SUPABASE_KEY='sb_publishable_X0PF6BYxBWXtZPQtU6wzgQ_ud7nY-eO';
const APP_URL='https://rinko0211.github.io/household-treasury/';
const DEVICE_KEY='householdTreasuryDeviceId';
const CONFLICT_KEY='householdTreasuryConflictBackup';
const SESSION_PASS_KEY='householdTreasuryVaultPassphrase';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

let user=null,passphrase='',pushTimer=null,passTimer=null,suppressNextPush=false,remoteRevision=0,syncReady=false,pushInFlight=false,channel=null,initToken=0;
let deviceId=localStorage.getItem(DEVICE_KEY);
if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,deviceId)}

const $=id=>document.getElementById(id),enc=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const stateNow=()=>window.getTreasuryState?.()||{};
function status(tag,detail){if($('cloudStatusTag'))$('cloudStatusTag').textContent=tag;if(detail&&$('cloudDetail'))$('cloudDetail').textContent=detail}
function fingerprint(obj){const s=JSON.stringify(obj);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function metaKey(){return user?`householdTreasurySyncMeta:${user.id}`:''}
function getMeta(){try{return JSON.parse(localStorage.getItem(metaKey()))||{revision:0,syncedFingerprint:''}}catch{return{revision:0,syncedFingerprint:''}}}
function setMeta(revision,obj){localStorage.setItem(metaKey(),JSON.stringify({revision:Number(revision)||0,syncedFingerprint:fingerprint(obj),syncedAt:new Date().toISOString()}))}
function backupLocal(reason,revision){try{localStorage.setItem(CONFLICT_KEY,JSON.stringify({savedAt:new Date().toISOString(),reason,revision,deviceId,state:stateNow()}))}catch{}}
async function deriveKey(secret,salt){const base=await crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encryptState(obj,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveKey(secret,salt);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj)));return{version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher)),kdf_iterations:250000}}
async function decryptState(row,secret){const key=await deriveKey(secret,unb64(row.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv)},key,unb64(row.ciphertext));return JSON.parse(dec.decode(plain))}
function getPass(){passphrase=$('vaultPassphrase')?.value||sessionStorage.getItem(SESSION_PASS_KEY)||'';if(passphrase.length<8)throw new Error('暗号化パスフレーズは8文字以上にしてください。');sessionStorage.setItem(SESSION_PASS_KEY,passphrase);return passphrase}
function creds(){const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;if(!email)throw new Error('同期メールを入力してください。');if(password.length<8)throw new Error('同期ログイン用パスワードは8文字以上にしてください。');return{email,password}}
function setAuthUi(){const ok=!!user;$('cloudSignOutBtn')?.classList.toggle('hidden',!ok);$('cloudSignInBtn')?.classList.toggle('hidden',ok);$('cloudSignUpBtn')?.classList.toggle('hidden',ok);if($('cloudUser'))$('cloudUser').value=user?.email||user?.id||''}
async function fetchRemote(){const{data,error}=await supabase.from('household_sync_state').select('*').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
async function applyRemote(row,detail='他端末の更新を自動反映しました。'){
  const secret=getPass();let next;
  try{next=await decryptState(row,secret)}catch(e){if(e.name==='OperationError')throw new Error('暗号化パスフレーズが違います。');throw e}
  suppressNextPush=true;window.replaceTreasuryState(next);suppressNextPush=false;
  remoteRevision=Number(row.revision)||1;setMeta(remoteRevision,next);syncReady=true;
  status('Realtime同期済み',`${detail} · revision ${remoteRevision} · ${new Date(row.updated_at).toLocaleString('ja-JP')}`);
  window.setTreasurySaveStatus?.('ローカル＋Realtime同期済み');
}
async function resolveConflict(reason='他端末で先に更新されました。'){
  const row=await fetchRemote();if(!row)return;
  const meta=getMeta(),local=stateNow(),dirty=fingerprint(local)!==meta.syncedFingerprint;
  if(dirty)backupLocal(reason,row.revision);
  await applyRemote(row,dirty?'競合を検出。新しいクラウド状態を採用し、端末側の未同期データは競合バックアップへ退避しました。':'新しいクラウド状態を自動反映しました。');
}
async function pushCurrent(){
  if(!user||!syncReady||pushInFlight)return;
  const secret=getPass(),current=stateNow(),expected=remoteRevision;pushInFlight=true;
  try{
    const encrypted=await encryptState(current,secret),now=new Date().toISOString();let data,error;
    if(expected===0){
      ({data,error}=await supabase.from('household_sync_state').insert({user_id:user.id,...encrypted,revision:1,writer_device:deviceId,updated_at:now}).select('revision,updated_at,writer_device').maybeSingle());
    }else{
      ({data,error}=await supabase.from('household_sync_state').update({...encrypted,revision:expected+1,writer_device:deviceId,updated_at:now}).eq('user_id',user.id).eq('revision',expected).select('revision,updated_at,writer_device').maybeSingle());
    }
    if(error){if(error.code==='23505'){await resolveConflict();return}throw error}
    if(!data){await resolveConflict();return}
    remoteRevision=Number(data.revision)||expected+1;setMeta(remoteRevision,current);syncReady=true;
    status('Realtime同期済み',`自動保存済み · revision ${remoteRevision} · ${new Date(data.updated_at).toLocaleString('ja-JP')}`);
    window.setTreasurySaveStatus?.('ローカル＋Realtime同期済み');
  }catch(e){
    if(navigator.onLine===false||/fetch|network/i.test(e.message)){status('オフライン','端末には保存済みです。接続復帰後に自動同期します。');window.setTreasurySaveStatus?.('ローカル保存済み（同期待ち）')}
    else status('同期エラー',e.message);
  }finally{pushInFlight=false}
}
function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(()=>pushCurrent(),700)}
async function subscribeRealtime(){
  if(channel){await supabase.removeChannel(channel);channel=null}
  if(!user)return;
  channel=supabase.channel(`household-sync-${user.id}-${deviceId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'household_sync_state',filter:`user_id=eq.${user.id}`},async payload=>{
      const row=payload.new;if(!row)return;const rev=Number(row.revision)||0;if(rev<=remoteRevision)return;
      if(row.writer_device===deviceId&&pushInFlight)return;
      const meta=getMeta(),local=stateNow(),dirty=!!meta.syncedFingerprint&&fingerprint(local)!==meta.syncedFingerprint;
      if(dirty)backupLocal('他端末のRealtime更新と競合',rev);
      try{await applyRemote(row,dirty?'他端末更新を受信。端末側の未同期変更は競合バックアップへ退避しました。':'他端末の更新を即時反映しました。')}catch(e){status('同期エラー',e.message)}
    })
    .subscribe(s=>{if(s==='SUBSCRIBED'&&syncReady)status('Realtime接続中',`自動同期ON · revision ${remoteRevision}`);if(s==='CHANNEL_ERROR'||s==='TIMED_OUT')status('同期再接続中','Realtime接続を再確立しています。')});
}
async function initializeSync(){
  const token=++initToken;if(!user)return;
  let secret;try{secret=getPass()}catch{syncReady=false;status('Realtime待機','暗号化パスフレーズを入力すると自動同期を開始します。');return}
  try{
    status('同期確認中','クラウドの最新revisionを確認しています。');const row=await fetchRemote();if(token!==initToken)return;
    const local=stateNow(),meta=getMeta(),localFp=fingerprint(local);
    if(!row){remoteRevision=0;syncReady=true;await subscribeRealtime();await pushCurrent();return}
    const remote=await decryptState(row,secret),remoteFp=fingerprint(remote),rev=Number(row.revision)||1;
    const hadMeta=!!meta.syncedFingerprint,localDirty=hadMeta&&localFp!==meta.syncedFingerprint;
    if(!hadMeta&&localFp!==remoteFp)backupLocal('Realtime移行時の安全バックアップ',rev);
    if(hadMeta&&rev===Number(meta.revision)&&localDirty){remoteRevision=rev;syncReady=true;await subscribeRealtime();await pushCurrent();return}
    if(hadMeta&&rev>Number(meta.revision)&&localDirty)backupLocal('オフライン中に他端末更新あり',rev);
    suppressNextPush=true;window.replaceTreasuryState(remote);suppressNextPush=false;remoteRevision=rev;setMeta(rev,remote);syncReady=true;await subscribeRealtime();
    status('Realtime接続中',`最新状態を確認済み · revision ${rev}`);window.setTreasurySaveStatus?.('ローカル＋Realtime同期済み');
  }catch(e){syncReady=false;const msg=e.name==='OperationError'?'暗号化パスフレーズが違います。':e.message;status('同期エラー',msg)}
}
window.cloudSyncOnLocalSave=()=>{if(suppressNextPush)return;if(!user){window.setTreasurySaveStatus?.('ローカル保存済み');return}if(($('vaultPassphrase')?.value||sessionStorage.getItem(SESSION_PASS_KEY)||'').length<8){status('Realtime待機','パスフレーズ入力後に自動同期します。');return}if(!syncReady){initializeSync();return}schedulePush()};

$('cloudSignUpBtn').onclick=async()=>{try{const{email,password}=creds();const{data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:APP_URL}});if(error)throw error;if(data.session){user=data.user;setAuthUi();status('登録完了','パスフレーズ入力後、Realtime同期が自動で始まります。');await initializeSync()}else{status('確認待ち','確認メールが送られました。認証後にこのアプリへ戻ってサインインしてください。');alert('確認メールが送られました。メール内のリンクで認証後、このアプリへ戻って「サインイン」を押してください。')}}catch(e){status('登録エラー',e.message);alert(e.message)}};
$('cloudSignInBtn').onclick=async()=>{try{const{email,password}=creds();const{data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;setAuthUi();status('サインイン済み','パスフレーズを入力するとRealtime同期を開始します。');await initializeSync()}catch(e){status('認証エラー',e.message);alert(e.message)}};
$('cloudSignOutBtn').onclick=async()=>{syncReady=false;remoteRevision=0;initToken++;clearTimeout(pushTimer);if(channel){await supabase.removeChannel(channel);channel=null}await supabase.auth.signOut();user=null;setAuthUi();status('未サインイン','サインアウトしました。')};

if($('pushCloudBtn'))$('pushCloudBtn').classList.add('hidden');if($('pullCloudBtn'))$('pullCloudBtn').classList.add('hidden');
const sessionPass=sessionStorage.getItem(SESSION_PASS_KEY)||'';if(sessionPass&&$('vaultPassphrase'))$('vaultPassphrase').value=sessionPass;
$('vaultPassphrase').addEventListener('input',()=>{passphrase=$('vaultPassphrase').value;clearTimeout(passTimer);if(passphrase.length>=8){sessionStorage.setItem(SESSION_PASS_KEY,passphrase);passTimer=setTimeout(()=>initializeSync(),500)}else{sessionStorage.removeItem(SESSION_PASS_KEY);syncReady=false;status('Realtime待機','8文字以上の暗号化パスフレーズを入力してください。')}});
window.addEventListener('online',()=>initializeSync());
supabase.auth.onAuthStateChange(async(event,session)=>{user=session?.user||null;setAuthUi();if(!user){syncReady=false;return}if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='INITIAL_SESSION')await initializeSync()});
(async()=>{const{data}=await supabase.auth.getSession();user=data.session?.user||null;setAuthUi();if(user)await initializeSync();else status('未サインイン','同じアカウントでPC/スマホを接続してください。')})();
