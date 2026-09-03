const CACHE="household-treasury-v7";
const CORE=["./index.html","./manifest.webmanifest","./app.js?v=7","./sync.js?v=5","./icons/icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;e.respondWith(fetch(e.request).then(resp=>{if(resp&&resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return resp}).catch(async()=>{const exact=await caches.match(e.request);if(exact)return exact;if(e.request.mode==="navigate")return caches.match("./index.html");return Response.error()}))});
