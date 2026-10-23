const C='29-v8',CARDS=[];
['S','H','C','D'].forEach(s=>['7','8','9','10','J','Q','K','A'].forEach(r=>CARDS.push('cards/'+s+'-'+r+'.webp')));CARDS.push('cards/back.webp');
const F=['./','index.html','manifest.json','icon-192.png','icon-512.png',...CARDS];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.pathname.startsWith('/socket.io'))return;
 const put=r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r};
 if(u.pathname.includes('/cards/')){   // pictures: cache first, so they show instantly
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(h=>h||fetch(e.request).then(put)));return;}
 e.respondWith(fetch(e.request).then(put).catch(()=>caches.match(e.request)));});
