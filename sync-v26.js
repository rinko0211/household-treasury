// v26 compatibility shim: PostgREST treats unknown query params as filters.
// Strip the legacy cache-buster `_=` from household_sync_state REST requests.
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

await import('./sync-v24.js?v=26');
