// v57 compatibility loader: preserve v26 PostgREST fix, large encrypted-state safety,
// and mark remote-state application so newer local master data cannot be rolled back.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    if (raw) {
      const u = new URL(raw, location.href);
      if (u.hostname === 'vqgofvnqmformckkkyur.supabase.co' && u.pathname === '/rest/v1/household_sync_state') {
        u.searchParams.delete('_');
        if (typeof input === 'string') input = u.toString();
        else input = new Request(u.toString(), input);
      }
    }
  } catch {}
  return nativeFetch(input, init);
};

const coreResponse = await nativeFetch('./sync-v24.js?v=57', {cache:'no-store'});
if (!coreResponse.ok) throw new Error(`同期コア取得失敗 (${coreResponse.status})`);
let coreSource = await coreResponse.text();
const oldCodec = "const b64=bytes=>btoa(String.fromCharCode(...bytes));\nconst unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));";
const safeCodec = `const b64=bytes=>{\n  const CHUNK=0x8000,parts=[];\n  for(let i=0;i<bytes.length;i+=CHUNK)parts.push(String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length))));\n  return btoa(parts.join(''));\n};\nconst unb64=s=>{\n  const bin=atob(s),out=new Uint8Array(bin.length);\n  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);\n  return out;\n};`;
if (!coreSource.includes(oldCodec)) throw new Error('同期コアのBase64互換パッチを適用できません。');
coreSource = coreSource.replace(oldCodec, safeCodec);
const oldRemoteApply="window.replaceTreasuryState?.(next);window.repairTreasuryBankBalances?.();remoteRevision=Number(row.revision)||1;";
const safeRemoteApply="window.__treasuryApplyingRemote=true;try{window.replaceTreasuryState?.(next)}finally{window.__treasuryApplyingRemote=false}window.repairTreasuryBankBalances?.();remoteRevision=Number(row.revision)||1;";
if (!coreSource.includes(oldRemoteApply)) throw new Error('同期コアのremote apply保護パッチを適用できません。');
coreSource = coreSource.replace(oldRemoteApply, safeRemoteApply);
const blobUrl = URL.createObjectURL(new Blob([coreSource], {type:'text/javascript'}));
try {
  await import(blobUrl);
} finally {
  URL.revokeObjectURL(blobUrl);
}
