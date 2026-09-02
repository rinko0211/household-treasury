import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL='https://vqgofvnqmformckkkyur.supabase.co';
const SUPABASE_KEY='sb_publishable_X0PF6BYxBWXtZPQtU6wzgQ_ud7nY-eO';
const APP_URL='https://rinko0211.github.io/household-treasury/';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let user=null, armed=false, passphrase='', pushTimer=null, suppressNextPush=false, lastAppliedRemoteMs=0;
const $=id=>document.getElementById(id), enc=new TextEncoder(), dec=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function status(tag,detail){if($('cloudStatusTag'))$('cloudStatusTag').textContent=tag;if(detail&&$('cloudDetail'))$('cloudDetail').textContent=detail;}
async function deriveKey(secret,salt){const base=await crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptState(obj,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveKey(secret,salt);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj)));return {version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher)),kdf_iterations:250000};}
async function decryptState(row,secret){const key=await deriveKey(secret,unb64(row.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv)},key,unb64(row.ciphertext));return JSON.parse(dec.decode(plain));}
function getPass(){passphrase=$('vaultPassphrase').value;if(passphrase.length<8)throw new Error('暗号化パスフレーズは8文字以上にしてください。');return passphrase;}
function creds(){const email=$('cloudEmail').value.trim(),password=$('cloudPassword').value;if(!email)throw new Error('同期メールを入力してください。');if(password.length<8)throw new Error('同期ログイン用パスワードは8文字以上にしてください。');return {email,password};}
function enableButtons(){const ok=!!user;$('pullCloudBtn').disabled=!ok;$('pushCloudBtn').disabled=!ok;$('cloudSignOutBtn').classList.toggle('hidden',!ok);$('cloudSignInBtn').classList.toggle('hidden',ok);$('cloudSignUpBtn').classList.toggle('hidden',ok);$('cloudUser').value=user?.email||user?.id||'';}
async function refreshUser(){const {data}=await supabase.auth.getUser();user=data.user||null;enableButtons();status(user?(armed?'同期中':'サインイン済み'):'未サインイン',user?`${user.email} · 初回は送信または取得を選んでください。`:'PC/スマホで同じアカウントを使用してください。');}
async function pushCloud(auto=false){try{if(!user)throw new Error('先にサインインしてください。');const secret=getPass(),encrypted=await encryptState(window.getTreasuryState(),secret),now=Date.now();const {error}=await supabase.from('household_sync_state').upsert({user_id:user.id,...encrypted,updated_at:new Date(now).toISOString()},{onConflict:'user_id'});if(error)throw error;lastAppliedRemoteMs=now;armed=true;status('同期済み',`暗号化してクラウド保存 · ${new Date(now).toLocaleString('ja-JP')}`);window.setTreasurySaveStatus?.('ローカル＋暗号化クラウド保存済み');}catch(e){if(!auto)alert(e.message);status('同期エラー',e.message);}}
async function pullCloud(auto=false){try{if(!user)throw new Error('先にサインインしてください。');const secret=getPass();const {data,error}=await supabase.from('household_sync_state').select('*').eq('user_id',user.id).maybeSingle();if(error)throw error;if(!data)throw new Error('クラウドにデータがありません。最初の端末なら「この端末のデータを送信」を押してください。');const next=await decryptState(data,secret);suppressNextPush=true;window.replaceTreasuryState(next);suppressNextPush=false;lastAppliedRemoteMs=new Date(data.updated_at).getTime();armed=true;status('同期済み',`クラウドから取得 · ${new Date(lastAppliedRemoteMs).toLocaleString('ja-JP')}`);window.setTreasurySaveStatus?.('クラウドから同期済み');}catch(e){const msg=e.name==='OperationError'?'暗号化パスフレーズが違います。':e.message;if(!auto)alert(msg);status('同期エラー',msg);}}
window.cloudSyncOnLocalSave=()=>{if(suppressNextPush||!armed||!user||!$('vaultPassphrase').value)return;clearTimeout(pushTimer);pushTimer=setTimeout(()=>pushCloud(true),1800)};
$('cloudSignUpBtn').onclick=async()=>{try{const {email,password}=creds();const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:APP_URL}});if(error)throw error;if(data.session){user=data.user;enableButtons();status('登録完了','アカウント作成・サインイン済みです。');}else{status('確認待ち','確認メールが送られました。メール認証後にサインインしてください。');alert('確認メールが送られました。メール内のリンクで認証後、このアプリへ戻って「サインイン」を押してください。');}}catch(e){status('登録エラー',e.message);alert(e.message);}};
$('cloudSignInBtn').onclick=async()=>{try{const {email,password}=creds();const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;enableButtons();status('サインイン済み',`${user.email} · 送信または取得を選んでください。`);}catch(e){status('認証エラー',e.message);alert(e.message);}};
$('cloudSignOutBtn').onclick=async()=>{armed=false;await supabase.auth.signOut();user=null;enableButtons();status('未サインイン','サインアウトしました。');};
$('pullCloudBtn').onclick=()=>pullCloud(false);$('pushCloudBtn').onclick=()=>pushCloud(false);$('vaultPassphrase').addEventListener('input',()=>{passphrase=$('vaultPassphrase').value;});
supabase.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;enableButtons();});
refreshUser();
