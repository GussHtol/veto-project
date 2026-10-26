const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const sha=async t=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)));
const rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const cut=(a,x)=>a.filter(v=>v!==x);

export default{async fetch(req,env){
  const u=new URL(req.url);
  if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
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
    return J({token:await tok(l),login:l,data:a.data});
  }
  if(u.pathname==="/api/me"){const m=await who();return m?J({login:m.l,data:m.a.data}):J({err:"auth"},401)}
  if(u.pathname==="/api/save"){
    const m=await who();if(!m)return J({err:"auth"},401);
    const d=JSON.stringify(b.data||{});if(d.length>30000)return J({err:"big"},400);
    m.a.data=JSON.parse(d);await env.KV.put("a:"+m.l,JSON.stringify(m.a));return J({ok:1});
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
  const dt=Math.max(0,Math.min(120,+b.dt||0));
  me.name=String(b.name||me.name).slice(0,40);
  me.secs+=dt;me.last=Date.now();
  if(b.nv)me.visits++;
  if(b.tab&&dt){const t=String(b.tab).slice(0,20);me.tabs[t]=(me.tabs[t]||0)+dt}

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
  await put(id,me);

  const pub=async(x,full)=>{const o=await get(x);return o?(full?{id:x,name:o.name,secs:o.secs,visits:o.visits,last:o.last,tabs:o.tabs}:{id:x,name:o.name}):null};
  const all=async(a,f)=>(await Promise.all(a.map(x=>pub(x,f)))).filter(Boolean);
  return J({f:await all(me.f,1),in:await all(me.in),out:await all(me.out),msg});
}};
