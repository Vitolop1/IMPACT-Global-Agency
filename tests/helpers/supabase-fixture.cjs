// HTTP contract fixture only. This is NOT a live Supabase service or proof of email delivery.
const { randomUUID } = require('node:crypto');
const D = require('../../portal/profile-domain.js');
module.exports = function fixture() {
  const users = new Map();
  const data = { students: new Map(), published: new Map(), favorites: [], coach: new Map(), coachUniversities: new Map(), interests: new Map(), meetings: new Map(), universities: new Map(), requests: [] };
  const universityRequests = [];
  const addUser = (email,role,name=`Test ${role}`) => {
    const id=randomUUID(), user={id,email,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{name}};
    const record={user,role,password:'testpassword1'};
    users.set(user.email,record);
    if(role==='player') data.students.set(id,{id,owner_id:id,draft:{name:'Test player'}});
    return record;
  };
  for(const role of ['player','coach','admin']) addUser(`${role}@example.test`,role);
  for(const name of ['Sample University North','Sample University South']) {
    const id=randomUUID();
    data.universities.set(id,{id,name,location:'Fictional test location',programs:['Architecture','Business'],sports:['Hockey','Rugby'],athletic_level:'Sample only',verification_status:'unverified',source_url:null,source_name:null,last_verified_at:null,is_sample:true,notes:'Private administrator note'});
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
    const participant = interest => !!interest && !!current && (current.role==='admin' || interest.coach_id===sub || data.students.get(interest.student_id)?.owner_id===sub);
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
      if(name==='university_catalog') {
        const keys=['id','name','location','programs','sports','athletic_level','verification_status','source_url','source_name','last_verified_at','is_sample'];
        return send([...data.universities.values()].filter(row=>row.is_sample||['verified','human-reviewed'].includes(row.verification_status)).map(row=>Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]))));
      }
      if(name==='submit_university_request') {
        const university=data.universities.get(body.university_id);
        if(current.role!=='player'||!university||(university.is_sample&&!current.isSample))return send({code:'42501'},403);
        if(universityRequests.some(r=>r.student_account_id===sub&&r.university_id===university.id&&r.kind===body.kind&&['pending','reviewing'].includes(r.status)))return send({code:'23505'},409);
        const id=randomUUID();
        universityRequests.unshift({id,student_account_id:sub,university_id:university.id,student_name:current.user.user_metadata.name,university_name:university.name,kind:body.kind,message:body.message,is_sample:university.is_sample,status:'pending'});
        return send(id);
      }
      if(name==='update_university_request') {
        const row=universityRequests.find(r=>r.id===body.request_id);
        if(!row||!(current.role==='admin'||row.student_account_id===sub&&body.next_status==='withdrawn'))return send({code:'42501'},403);
        row.status=body.next_status;
        return send(null);
      }
      if(name==='express_interest') {
        const student=data.students.get(body.student_id), snapshot=data.published.get(body.student_id);
        if(current.role!=='coach'||!student||!snapshot)return send({message:'Forbidden'},403);
        const existing=[...data.interests.values()].find(row=>row.student_id===body.student_id&&row.coach_id===sub);
        if(existing)return send(existing.id);
        const id=randomUUID(), university=data.universities.get(data.coachUniversities.get(sub));
        data.interests.set(id,{id,student_id:student.id,coach_id:sub,status:'pending',coach_name:current.user.user_metadata.name,student_name:snapshot.data.name,institution_name:university?.name||data.coach.get(sub)?.institution||'',message:body.message||'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
        return send(id);
      }
      if(name==='respond_to_interest') {
        const interest=data.interests.get(body.interest_id);
        if(!interest || data.students.get(interest.student_id)?.owner_id!==sub)return send({message:'Forbidden'},403);
        if(interest.status!=='pending'||!['accepted','declined'].includes(body.response))return send({message:'Invalid transition'},400);
        Object.assign(interest,{status:body.response,updated_at:new Date().toISOString()});return send(null);
      }
      if(name==='propose_meeting') {
        const interest=data.interests.get(body.interest_id);
        if(!participant(interest)||current.role==='admin')return send({message:'Forbidden'},403);
        if(interest.status!=='accepted')return send({message:'Interest not accepted'},400);
        const starts=new Date(body.starts_at);
        let validZone=true;try{new Intl.DateTimeFormat('en',{timeZone:body.timezone});}catch{validZone=false;}
        if(!validZone||!Number.isFinite(starts.getTime())||starts.getTime()<=Date.now()||body.duration_minutes<15||body.duration_minutes>180)return send({message:'Invalid meeting'},400);
        if([...data.meetings.values()].some(row=>row.interest_id===interest.id&&['proposed','accepted'].includes(row.status)))return send({message:'Active meeting exists'},409);
        const id=randomUUID();data.meetings.set(id,{id,interest_id:interest.id,starts_at:starts.toISOString(),timezone:body.timezone,duration_minutes:body.duration_minutes,status:'proposed',proposed_by:sub,response_by:null,message:body.message||'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return send(id);
      }
      if(name==='respond_to_meeting') {
        const meeting=data.meetings.get(body.meeting_id), interest=meeting&&data.interests.get(meeting.interest_id);
        if(!meeting||!participant(interest))return send({message:'Forbidden'},403);
        if(body.response==='cancelled') {
          if(!['proposed','accepted'].includes(meeting.status))return send({message:'Invalid transition'},400);
        } else if(current.role==='admin'||meeting.proposed_by===sub)return send({message:'Forbidden'},403);
        else if(!['proposed','accepted'].includes(meeting.status)||!['accepted','declined','reschedule_requested'].includes(body.response))return send({message:'Invalid transition'},400);
        Object.assign(meeting,{status:body.response,response_by:sub,updated_at:new Date().toISOString()});return send(null);
      }
      if(!p || (p.owner_id!==sub&&current.role!=='admin'))return send({message:'Forbidden'},403);
      if(name==='publish_profile') {
        try{D.publish(p.draft);}catch(error){return send({message:error.message},400);}
        data.published.set(p.id,{id:p.id,data:D.publicSnapshot(p.draft),published_at:new Date().toISOString()});
      }
      if(name==='withdraw_profile')data.published.delete(p.id);
      return send(null);
    }
    const table=path.split('/').at(-1);
    const eq=key=>url.searchParams.get(key)?.replace(/^eq\./,'');
    if(method==='GET') {
      let rows=[];
      if(table==='accounts'&&current)rows=[{id:sub,display_name:current.user.user_metadata.name,role:current.role,is_sample:!!current.isSample}];
      if(table==='published_profiles')rows=[...data.published.values()];
      if(table==='student_profiles'&&current)rows=[...data.students.values()].filter(p=>current.role==='admin'||p.owner_id===sub);
      if(table==='coach_profiles'&&current)rows=[{user_id:sub,data:data.coach.get(sub)||{},university_id:data.coachUniversities.get(sub)||null}];
      if(table==='coach_favorites'&&current)rows=data.favorites.filter(f=>f.coach_id===sub&&data.published.has(f.student_id));
      if(table==='recruitment_interests')rows=[...data.interests.values()].filter(participant);
      if(table==='meeting_requests')rows=[...data.meetings.values()].filter(row=>participant(data.interests.get(row.interest_id)));
      if(table==='universities'&&current?.role==='admin')rows=[...data.universities.values()];
      if(table==='university_opportunity_requests'&&current)rows=universityRequests.filter(r=>current.role==='admin'||r.student_account_id===sub);
      for(const key of ['id','owner_id','user_id','coach_id'])if(eq(key))rows=rows.filter(r=>r[key]===eq(key));
      return send(request.headers().accept?.includes('vnd.pgrst.object')?rows[0]||null:rows);
    }
    if(!current)return send({message:'Forbidden'},403);
    if(['recruitment_interests','meeting_requests'].includes(table))return send({message:'Direct writes forbidden'},403);
    let changed;
    if(table==='student_profiles') {
      const id=eq('id')||body.id, old=data.students.get(id);
      if(current.role!=='admin'&&(old?old.owner_id!==sub:body.owner_id!==sub))return send({message:'Forbidden'},403);
      if(data.denyNextStudentUpdate) { data.denyNextStudentUpdate=false; return send([]); }
      data.students.set(id,{...old,...body});
      changed=data.students.get(id);
    }
    if(table==='coach_profiles') { data.coach.set(sub,body.data); if(Object.hasOwn(body,'university_id'))data.coachUniversities.set(sub,body.university_id); changed={user_id:sub,data:body.data,university_id:data.coachUniversities.get(sub)||null}; }
    if(table==='coach_favorites') {
      changed={coach_id:sub,student_id:eq('student_id')||body.student_id};
      if(method==='DELETE')data.favorites=data.favorites.filter(f=>f.coach_id!==sub||f.student_id!==eq('student_id'));
      else data.favorites.push(body);
    }
    if(url.searchParams.has('select')) return send(changed?[changed]:[]);
    return route.fulfill({status:204,body:''});
  }
  return {data,users,route,addUser,sessionFor:email=>session(users.get(email))};
};
