const C="kab-v1";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
// Страница всегда берётся из сети; офлайн показываем последнюю сохранённую копию.
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.mode!=="navigate"||new URL(r.url).pathname.startsWith("/api/"))return;
  e.respondWith(fetch(r).then(res=>{
    if(res.ok&&new URL(r.url).pathname==="/dash"){const c=res.clone();caches.open(C).then(k=>k.put("/dash",c))}
    return res;
  }).catch(()=>caches.match("/dash").then(x=>x||new Response("Нет связи с интернетом",{status:503,headers:{"content-type":"text/plain;charset=utf-8"}}))));
});
// Клик по уведомлению открывает окно приложения.
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{
    for(const c of l)if("focus" in c)return c.focus();
    return self.clients.openWindow("/dash");
  }));
});
