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
