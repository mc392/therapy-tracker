const C="tt-v4";
/* The app shell must be precached at install time. The service worker does not control the
   navigation that registers it, so without this a first-time visitor who goes offline before
   their second visit gets nothing at all. */
const SHELL=["./","index.html"];
const STATIC=["icon-180.png","icon-192.png","icon-512.png","manifest.webmanifest"];

/* Only ever cache a real success. A 404/502 served during a deploy window would otherwise
   become the permanent offline copy. Opaque responses report status 0, so they fail this too. */
const cacheable=r=>!!r&&r.ok&&r.status===200;

self.addEventListener("install",e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(C);
    await c.addAll(SHELL);                                  // must succeed — this is the app
    await Promise.all(STATIC.map(u=>c.add(u).catch(()=>{})));// nice to have — never block install
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function shellFallback(req){
  return (await caches.match(req))||(await caches.match("index.html"))||(await caches.match("./"));
}

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;

  // Network-first for HTML navigation: always fetch fresh, fall back to cache when offline
  if(req.mode==="navigate"||req.destination==="document"){
    e.respondWith((async()=>{
      try{
        const resp=await fetch(req);
        if(cacheable(resp)){
          const copy=resp.clone();
          e.waitUntil(caches.open(C).then(c=>c.put(req,copy)));
          return resp;
        }
        // Reachable but broken (deploy blip, gateway error) — prefer a known-good cached app
        return (await shellFallback(req))||resp;
      }catch(err){
        const hit=await shellFallback(req);
        if(hit)return hit;
        return new Response("Therapy Tracker is offline and no cached copy is available on this device yet. Reconnect once to finish installing it.",
          {status:503,headers:{"Content-Type":"text/plain;charset=utf-8"}});
      }
    })());
    return;
  }

  // Cache-first for static assets (icons, manifest)
  e.respondWith((async()=>{
    const hit=await caches.match(req);
    if(hit)return hit;
    try{
      const resp=await fetch(req);
      if(cacheable(resp)){
        const copy=resp.clone();
        e.waitUntil(caches.open(C).then(c=>c.put(req,copy)));
      }
      return resp;
    }catch(err){
      return new Response("",{status:504});
    }
  })());
});
