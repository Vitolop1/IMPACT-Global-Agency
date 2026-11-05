// HTTP contract fixture only. This is NOT a live Supabase service or proof of email delivery.
const { randomUUID } = require('node:crypto');
const D = require('../../portal/profile-domain.js');
module.exports = function fixture() {
  const users = new Map();
  const data = { students: new Map(), published: new Map(), favorites: [], coach: new Map(), requests: [] };
  for(const role of ['player','coach','admin']) {
    const id=randomUUID(), user={id,email:`${role}@example.test`,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{name:`Test ${role}`}};
    users.set(user.email,{user,role,password:'testpassword1'});
    if(role==='player') data.students.set(id,{id,owner_id:id,draft:{name:'Test player'}});
  }
  const session = record => {
    const payload=Buffer.from(JSON.stringify({sub:record.user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
    return {access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.signature`,refresh_token:`refresh-${record.user.id}`,token_type:'bearer',expires_in:3600,user:record.user};
  };
  async function route(route) {
    const request=route.request(), url=new URL(request.url()), path=url.pathname, method=request.method();
    let body; try {body=request.postDataJSON();} catch {body=null;}
    data.requests.push({path,method,body,url:request.url()});
    const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    const token=request.headers().authorization?.replace('Bearer ','');
    let sub;try{sub=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;}catch{}
    const current=[...users.values()].find(r=>r.user.id===sub);
    if(path.endsWith('/token')) {
      const record=url.searchParams.get('grant_type')==='pkce'?users.get('player@example.test'):users.get(body.email);
      if(!record || (url.searchParams.get('grant_type')==='password'&&record.password!==body.password)) return send({code:'invalid_credentials',msg:'Invalid login credentials'},400);
      return send(session(record));
    }
    if(path.endsWith('/signup')) {
      const id=randomUUID(), user={id,email:body.email,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:body.data};
      users.set(body.email,{user,role:body.data.account_type==='coach'?'coach':'player',password:body.password});
      if(body.data.account_type!=='coach')data.students.set(id,{id,owner_id:id,draft:{name:body.data.name}});
      return send(user);
    }
    if(path.endsWith('/recover')||path.endsWith('/logout')) return send({});
    if(path.endsWith('/user')) {
      if(!current)return send({msg:'Unauthorized'},401);
      if(method==='PUT')current.password=body.password;
      return send(current.user);
    }
    if(path.includes('/rpc/')) {
      if(!current)return send({message:'Forbidden'},403);
      const name=path.split('/').at(-1), p=data.students.get(body?.profile_id);
      if(name==='suggested_universities')return send([]);
      if(!p || (p.owner_id!==sub&&current.role!=='admin'))return send({message:'Forbidden'},403);
      if(name==='publish_profile')data.published.set(p.id,{id:p.id,data:D.publicSnapshot(p.draft),published_at:new Date().toISOString()});
      if(name==='withdraw_profile')data.published.delete(p.id);
      return send(null);
    }
    const table=path.split('/').at(-1);
    const eq=key=>url.searchParams.get(key)?.replace(/^eq\./,'');
    if(method==='GET') {
      let rows=[];
      if(table==='accounts'&&current)rows=[{id:sub,display_name:current.user.user_metadata.name,role:current.role}];
      if(table==='published_profiles')rows=[...data.published.values()];
      if(table==='student_profiles'&&current)rows=[...data.students.values()].filter(p=>current.role==='admin'||p.owner_id===sub);
      if(table==='coach_profiles'&&current)rows=[{user_id:sub,data:data.coach.get(sub)||{}}];
      if(table==='coach_favorites'&&current)rows=data.favorites.filter(f=>f.coach_id===sub&&data.published.has(f.student_id));
      for(const key of ['id','owner_id','user_id','coach_id'])if(eq(key))rows=rows.filter(r=>r[key]===eq(key));
      return send(request.headers().accept?.includes('vnd.pgrst.object')?rows[0]||null:rows);
    }
    if(!current)return send({message:'Forbidden'},403);
    let changed;
    if(table==='student_profiles') {
      const id=eq('id')||body.id, old=data.students.get(id);
      if(current.role!=='admin'&&(old?old.owner_id!==sub:body.owner_id!==sub))return send({message:'Forbidden'},403);
      if(data.denyNextStudentUpdate) { data.denyNextStudentUpdate=false; return send([]); }
      data.students.set(id,{...old,...body});
      changed=data.students.get(id);
    }
    if(table==='coach_profiles') { data.coach.set(sub,body.data); changed={user_id:sub,data:body.data}; }
    if(table==='coach_favorites') {
      changed={coach_id:sub,student_id:eq('student_id')||body.student_id};
      if(method==='DELETE')data.favorites=data.favorites.filter(f=>f.coach_id!==sub||f.student_id!==eq('student_id'));
      else data.favorites.push(body);
    }
    if(url.searchParams.has('select')) return send(changed?[changed]:[]);
    return route.fulfill({status:204,body:''});
  }
  return {data,users,route};
};
