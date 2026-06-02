const C="tt-v2";
const STATIC=["icon-180.png","icon-192.png","icon-512.png","manifest.webmanifest"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys()
      .then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",e=>{
  const req=e.request;
  // Network-first for HTML navigation: always fetch fresh, fall back to cache when offline
  if(req.mode==="navigate"||req.destination==="document"){
    e.respondWith(
      fetch(req)
        .then(resp=>{caches.open(C).then(c=>c.put(req,resp.clone()));return resp;})
        .catch(()=>caches.match(req).then(r=>r||caches.match("index.html")))
    );
    return;
  }
  // Cache-first for static assets (icons, manifest)
  e.respondWith(
    caches.match(req).then(r=>r||fetch(req).then(resp=>{
      caches.open(C).then(c=>c.put(req,resp.clone()));
      return resp;
    }).catch(()=>caches.match("index.html")))
  );
});
