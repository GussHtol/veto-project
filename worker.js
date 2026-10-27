const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const sha=async t=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)));
const rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const cut=(a,x)=>a.filter(v=>v!==x);
const PERK="533694c18d4f9795acb6e5d2b226d0de1f19b89855ff251f8b4ea5614611899b";

export default{async fetch(req,env){
  const u=new URL(req.url);
  if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
  if(u.pathname==="/api/ping")return J({t:Date.now()});
  if(u.pathname==="/api/img"&&req.method==="GET"){
    const s=await env.KV.get("im:"+String(u.searchParams.get("i")||"").replace(/[^0-9a-f]/g,"")),m=s&&/^data:(image\/(?:gif|png|jpeg|webp));base64,(.+)$/.exec(s);
    if(!m)return new Response("",{status:404});
    return new Response(Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0)),{headers:{"content-type":m[1],"cache-control":"public,max-age=31536000"}});
  }
  if(u.pathname==="/api/banner"&&req.method==="GET"){
    const kd=u.searchParams.get("k")==="av"?"av":"bn",ln=String(u.searchParams.get("u")||"").toLowerCase().trim();
    const bf=await env.KV.getWithMetadata("bf:"+kd+":"+ln,"arrayBuffer");
    if(bf.value){const by=new Uint8Array(bf.value),h={"content-type":(bf.metadata&&bf.metadata.t)||"application/octet-stream","cache-control":"public,max-age=600","accept-ranges":"bytes"},rg=/bytes=(\d*)-(\d*)/.exec(req.headers.get("range")||"");
      if(rg){const a=rg[1]?+rg[1]:0,e=rg[2]?Math.min(+rg[2],by.length-1):by.length-1;return new Response(by.slice(a,e+1),{status:206,headers:{...h,"content-range":`bytes ${a}-${e}/${by.length}`}})}
      return new Response(by,{headers:h})}
    const s=await env.KV.get((u.searchParams.get("k")==="av"?"av:":"bn:")+String(u.searchParams.get("u")||"").toLowerCase().trim());
    const m=s&&/^data:(image\/(?:gif|png|jpeg|webp));base64,(.+)$/.exec(s);
    if(!m)return new Response("",{status:404});
    return new Response(Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0)),{headers:{"content-type":m[1],"cache-control":"public,max-age=3600"}});
  }
  if(u.pathname==="/api/bup"&&req.method==="POST"){
    const kd=u.searchParams.get("kind")==="av"?"av":"bn",l=await env.KV.get("t:"+String(u.searchParams.get("token")||""));
    if(!l)return J({err:"auth"},401);
    const a=JSON.parse(await env.KV.get("a:"+l)||"null");if(!a)return J({err:"auth"},401);
    const ty=(req.headers.get("content-type")||"").split(";")[0];
    if(!/^(image\/(gif|png|jpeg|webp)|video\/(mp4|webm))$/.test(ty))return J({err:"Неверный формат"},400);
    if(/^(image\/gif|video\/)/.test(ty)&&!a.perk)return J({err:"GIF и видео только по паролю"},403);
    if((+req.headers.get("content-length")||0)>3200000)return J({err:"Файл больше 3 МБ"},400);
    const buf=await req.arrayBuffer();if(buf.byteLength>3200000)return J({err:"Файл больше 3 МБ"},400);
    await env.KV.put("bf:"+kd+":"+l,buf,{metadata:{t:ty}});
    return J({ok:1});
  }
  if(req.method!=="POST")return J({err:"method"},405);
  const get=async id=>JSON.parse(await env.KV.get("u:"+id)||"null"),put=(id,o)=>env.KV.put("u:"+id,JSON.stringify(o));
  const b=await req.json().catch(()=>({}));

  if(u.pathname==="/api/register"){
    const id=rnd(24),sec=rnd(24);
    await put(id,{h:await sha(sec),name:"Гость",secs:0,visits:0,last:Date.now(),tabs:{},f:[],in:[],out:[]});
    return J({id,sec});
  }
  // ---- аккаунты ----
  const ag=async l=>JSON.parse(await env.KV.get("a:"+l)||"null");
  const tok=async l=>{const t=rnd(24);await env.KV.put("t:"+t,l,{expirationTtl:7776000});return t};
  const low=x=>String(x||"").toLowerCase().trim();
  const who=async()=>{const l=await env.KV.get("t:"+String(b.token||""));return l?{l,a:await ag(l)}:null};
  if(u.pathname==="/api/reg"){
    const l=low(b.login),p=String(b.pass||"");
    if(!/^[a-z0-9_.-]{3,24}$/.test(l))return J({err:"Логин: 3-24 символа, латиница, цифры, . _ -"},400);
    if(p.length<6)return J({err:"Пароль: минимум 6 символов"},400);
    if(await ag(l))return J({err:"Такой логин уже занят"},400);
    const salt=rnd(8);
    await env.KV.put("a:"+l,JSON.stringify({salt,h:await sha(salt+p),vid:rnd(12),data:{}}));
    return J({token:await tok(l),login:l,data:{}});
  }
  if(u.pathname==="/api/log"){
    const l=low(b.login),a=await ag(l);
    if(!a||a.h!==await sha(a.salt+String(b.pass||"")))return J({err:"Неверный логин или пароль"},401);
    return J({token:await tok(l),login:l,data:a.data,perk:!!a.perk});
  }
  if(u.pathname==="/api/me"){const m=await who();return m?J({login:m.l,data:m.a.data,perk:!!m.a.perk}):J({err:"auth"},401)}
  if(u.pathname==="/api/save"){
    const m=await who();if(!m)return J({err:"auth"},401);
    const d=JSON.stringify(b.data||{});if(d.length>30000)return J({err:"big"},400);
    m.a.data=JSON.parse(d);await env.KV.put("a:"+m.l,JSON.stringify(m.a));return J({ok:1});
  }
  if(u.pathname==="/api/bnup"){
    const m=await who();if(!m)return J({err:"auth"},401);
    const d=String(b.data||""),kp=b.kind==="av"?"av:":"bn:";
    if(!d){await env.KV.delete(kp+m.l);await env.KV.delete("bf:"+(kp==="av:"?"av":"bn")+":"+m.l);return J({ok:1})}
    if(!/^data:image\/(gif|png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(d)||d.length>2900000)return J({err:"Файл слишком большой (до 2 МБ) или неверный формат"},400);
    if(/^data:image\/gif/.test(d)&&!m.a.perk)return J({err:"GIF только по паролю"},403);
    if(kp==="av:"&&d.length>2000000)return J({err:"Аватар до 1,5 МБ"},400);
    await env.KV.put(kp+m.l,d);await env.KV.delete("bf:"+(kp==="av:"?"av":"bn")+":"+m.l);return J({ok:1});
  }
  const hx=x=>String(x||"").toLowerCase().replace(/[^0-9a-f]/g,"");
  if(u.pathname==="/api/unlock"){
    const m=await who();if(!m)return J({err:"auth"},401);
    if(await sha("vp:"+String(b.code||""))!==PERK)return J({err:"Неверный пароль"},403);
    m.a.perk=1;await env.KV.put("a:"+m.l,JSON.stringify(m.a));
    const i=hx(b.id),n=i&&await get(i);
    if(n&&n.h===await sha(String(b.sec))){n.perk=1;await put(i,n)}
    return J({ok:1});
  }
  if(u.pathname==="/api/dm"){
    const i=hx(b.id),me2=i&&await get(i);
    if(!me2||me2.h!==await sha(String(b.sec)))return J({err:"auth"},401);
    const o=hx(b.with),pe=o&&await get(o);
    if(!pe||!(me2.f.includes(o)||pe.f.includes(i)))return J({err:"Вы не друзья"},403);
    const key="m:"+[i,o].sort().join(":");
    let ms=JSON.parse(await env.KV.get(key)||"[]");
    const t=String(b.text||"").trim().slice(0,500),img=String(b.img||"");
    let im="";
    if(img){if(!/^data:image\/(gif|png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(img)||img.length>2900000)return J({err:"Неверный файл (до 2 МБ)"},400);im=rnd(12);await env.KV.put("im:"+im,img)}
    if(t||im){ms.push({f:i,t,im,ts:Date.now()});ms=ms.slice(-150);await env.KV.put(key,JSON.stringify(ms));
      const un=JSON.parse(await env.KV.get("un:"+o)||"{}");un[i]=(un[i]||0)+1;await env.KV.put("un:"+o,JSON.stringify(un))}
    const mine=JSON.parse(await env.KV.get("un:"+i)||"{}");
    if(mine[o]){mine[o]=0;await env.KV.put("un:"+i,JSON.stringify(mine))}
    return J({ms});
  }
  // ---- заявки на ключ ----
  const rg=async v=>JSON.parse(await env.KV.get("r:"+v)||"null"),rp=(v,o)=>env.KV.put("r:"+v,JSON.stringify(o));
  const th=r=>({status:r.status,msgs:r.msgs,name:r.name});
  const add=(r,f,t)=>{if(t)r.msgs.push({f,t:String(t).slice(0,1000),ts:Date.now()});r.last=Date.now()};
  const norm=x=>String(x||"").toLowerCase().replace(/[^0-9a-f]/g,"");
  if(u.pathname==="/api/req"){
    let v=norm(b.vid),r=v&&await rg(v),nm=b.name;
    if(b.token){const w=await who();if(!w)return J({err:"auth"},401);v=w.a.vid;nm=w.l;r=await rg(v)}
    if(!r){if(b.token&&!b.start)return J({none:1});if(v&&!b.token)return J({gone:1});if(!b.token)v=rnd(12);r={name:String(nm||"Гость").slice(0,40),status:"wait",msgs:[],last:Date.now(),unread:0};
      add(r,"b","Заявка принята. Ожидайте выдачи ключа, обычно это занимает от 10 минут до часа.")}
    if(b.text){add(r,"v",b.text);r.unread=(r.unread||0)+1}
    await rp(v,r);return J({vid:v,...th(r)});
  }
  if(u.pathname==="/api/login"){
    const x=String(b.v||"");
    if(env.ADMIN_PASS&&x===env.ADMIN_PASS)return J({admin:1});
    const v=await env.KV.get("k:"+norm(x));
    return v?J({vid:v}):J({err:"bad"},401);
  }
  if(u.pathname==="/api/adm"){
    if(!env.ADMIN_PASS||String(b.pw||"")!==env.ADMIN_PASS)return J({err:"auth"},401);
    if(b.act==="list"){
      const l=await env.KV.list({prefix:"r:"});
      const a=(await Promise.all(l.keys.map(async k=>{const r=JSON.parse(await env.KV.get(k.name));return{vid:k.name.slice(2),name:r.name,status:r.status,last:r.last,unread:r.unread||0,pre:(r.msgs[r.msgs.length-1]||{}).t||""}}))).sort((x,y)=>y.last-x.last);
      return J({list:a});
    }
    const v=norm(b.vid),r=await rg(v);if(!r)return J({err:"none"},404);
    if(b.act==="del"){await env.KV.delete("r:"+v);return J({gone:1})}
    if(b.act==="send")add(r,"b",b.text);
    if(b.act==="ok"){const key=rnd(16);await env.KV.put("k:"+key,v);r.status="ok";add(r,"b",(b.text?b.text+"\n":"")+"Ваш ключ: "+key.match(/.{8}/g).join("-"))}
    if(b.act==="no"){r.status="no";add(r,"b",b.text||"Заявка отклонена.")}
    r.unread=0;await rp(v,r);return J({vid:v,...th(r)});
  }
  if(u.pathname!=="/api/sync")return J({err:"404"},404);

  const id=String(b.id||""),me=await get(id);
  if(!me||me.h!==await sha(String(b.sec)))return J({err:"auth"},401);

  // статистика самого пользователя
  const st=JSON.parse(await env.KV.get("s:"+id)||"null")||{name:me.name,secs:me.secs||0,visits:me.visits||0,last:me.last||0,tabs:me.tabs||{},prof:me.prof};
  const dt=Math.max(0,Math.min(120,+b.dt||0));
  st.name=String(b.name||st.name||me.name).slice(0,40);
  if(b.prof&&typeof b.prof==="object"){const q=b.prof,av=String(q.av||"");st.prof={n:String(q.n||"").slice(0,32),ab:String(q.ab||"").slice(0,200),st:["on","idle","dnd","off"].includes(q.st)?q.st:"on",bn:/^#[0-9a-f]{3,8}$/i.test(q.bn)?q.bn:"#ff6b5e",bv:Math.floor(Number(q.bv))||0,fr:me.perk&&/^[a-z]{3,10}$/.test(q.fr||"")?q.fr:"",ag:me.perk?Math.floor(Number(q.ag))||0:0,bm:me.perk&&q.bm?1:0,am:me.perk&&q.am?1:0,fx:me.perk&&["shine","aurora","glow","gold"].includes(q.fx)?q.fx:"",bp:me.perk&&/^[a-z]{3,10}$/.test(q.bp||"")?q.bp:"",av:/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(av)&&av.length<20000?av:""}}
  st.secs+=dt;st.last=Date.now();
  if(b.nv)st.visits++;
  if(b.tab&&dt){const t=String(b.tab).slice(0,20);st.tabs[t]=(st.tabs[t]||0)+dt}

  // действия с друзьями
  const k=String(b.key||"").toLowerCase().replace(/[^0-9a-f]/g,"");
  const acc=async k=>{const t=await get(k);if(!t)return;me.in=cut(me.in,k);if(!me.f.includes(k))me.f.push(k);t.out=cut(t.out,id);if(!t.f.includes(id))t.f.push(id);await put(k,t)};
  let msg="";
  if(b.act==="add"){
    const t=await get(k);
    if(!t||k===id)msg="Ключ не найден";
    else if(me.f.includes(k)||me.out.includes(k))msg="Уже в друзьях или заявка отправлена";
    else if(me.in.includes(k)){await acc(k);msg="Вы теперь друзья"}
    else{t.in.push(id);me.out.push(k);await put(k,t);msg="Заявка отправлена"}
  }else if(b.act==="acc"&&me.in.includes(k)){await acc(k);msg="Заявка принята"}
  else if(b.act==="del"){
    const t=await get(k);
    me.f=cut(me.f,k);me.in=cut(me.in,k);me.out=cut(me.out,k);
    if(t){t.f=cut(t.f,id);t.in=cut(t.in,id);t.out=cut(t.out,id);await put(k,t)}
    msg="Готово";
  }
  if(b.act)await put(id,me);
  await env.KV.put("s:"+id,JSON.stringify(st));

  const pub=async(x,full)=>{const o=await get(x);if(!o)return null;const s2=JSON.parse(await env.KV.get("s:"+x)||"null")||o;return full?{id:x,name:s2.name,prof:s2.prof,secs:s2.secs,visits:s2.visits,last:s2.last,tabs:s2.tabs}:{id:x,name:s2.name,prof:s2.prof}};
  const all=async(a,f)=>(await Promise.all(a.map(x=>pub(x,f)))).filter(Boolean);
  return J({f:await all(me.f,1),in:await all(me.in),out:await all(me.out),msg,un:JSON.parse(await env.KV.get("un:"+id)||"{}")});
}};
