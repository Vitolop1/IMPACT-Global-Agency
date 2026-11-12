import { createClient } from '@supabase/supabase-js';

const unwrap = result => { if (result.error) throw result.error; return result.data; };
const changedOne = result => {
  const rows = unwrap(result);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('staleOrForbiddenRecord');
  return rows[0];
};
const different = (a,b) => JSON.stringify(a) !== JSON.stringify(b);
window.createImpactBackend = config => {
  const client = createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  const D = window.ImpactProfiles;
  async function account() {
    const { data, error } = await client.auth.getUser();
    if(error || !data.user) return null;
    const row = unwrap(await client.from('accounts').select('id,display_name,role,is_sample').eq('id',data.user.id).single());
    if(!['player','coach','admin'].includes(row.role)) throw new Error('forbidden');
    return {id:row.id,name:row.display_name,email:data.user.email,role:row.role,isSample:!!row.is_sample};
  }
  async function load(user) {
    const snapshots=unwrap(await client.from('published_profiles').select('*'));
    const state={accounts:[],profiles:snapshots.map(row=>({...row.data,id:row.id,published:true,publishedData:row.data})),coaches:{},favorites:{},universities:[],contacts:[],opportunities:[],staff:[],suggestions:[],catalog:[],interests:[],meetings:[]};
    if(!user) return state;
    state.catalog=unwrap(await client.rpc('university_catalog'));
    state.interests=unwrap(await client.from('recruitment_interests').select('*').order('created_at',{ascending:false}));
    state.meetings=unwrap(await client.from('meeting_requests').select('*').order('starts_at'));
    if(user.role==='player'||user.role==='admin') {
      let query=client.from('student_profiles').select('*');
      if(user.role==='player') query=query.eq('owner_id',user.id);
      const rows=unwrap(await query);
      const drafts=rows.map(row=>{const snap=snapshots.find(p=>p.id===row.id);return {...row.draft,id:row.id,ownerId:row.owner_id,published:!!snap,publishedData:snap?.data||null,publishedAt:snap?.published_at,sample:!!snap?.data?.sample||(user.isSample&&row.owner_id===user.id)};});
      // Players do not need other students' public records in their editing state.
      state.profiles=user.role==='player'?drafts:[...state.profiles.filter(p=>!drafts.some(d=>d.id===p.id)),...drafts];
    }
    if(user.role==='coach') {
      const cp=unwrap(await client.from('coach_profiles').select('data,university_id').eq('user_id',user.id).maybeSingle());
      state.coaches[user.id]={...cp?.data,university_id:cp?.university_id||''};
      state.favorites[user.id]=unwrap(await client.from('coach_favorites').select('student_id').eq('coach_id',user.id)).map(r=>r.student_id);
    }
    if(user.role==='player') state.suggestions=unwrap(await client.rpc('suggested_universities'));
    if(user.role==='admin') {
      const cases=unwrap(await client.from('recruitment_cases').select('*'));
      const history=unwrap(await client.from('recruitment_history').select('*').order('created_at'));
      for(const p of state.profiles) {
        const c=cases.find(c=>c.student_id===p.id);
        Object.assign(p,{status:c?.status||'new',responsible:c?.assigned_staff_id||'',notes:c?.notes||'',nextAction:c?.next_action_at||'',history:history.filter(h=>h.student_id===p.id).map(h=>({from:h.old_status,to:h.new_status,at:h.created_at,actor:h.actor_id,notes:h.notes}))});
      }
      state.universities=unwrap(await client.from('universities').select('*').order('name'));
      state.contacts=unwrap(await client.from('university_contacts').select('*').order('name'));
      state.opportunities=unwrap(await client.from('recruitment_opportunities').select('*').order('created_at'));
      state.staff=unwrap(await client.from('staff_members').select('*').order('name'));
    }
    return state;
  }
  async function save(next,prev,user) {
    for(const p of next.profiles) {
      const old=prev.profiles.find(o=>o.id===p.id);
      const draft=Object.fromEntries(D.editableFields.filter(k=>k!=='media'&&k!=='sample'&&Object.hasOwn(p,k)).map(k=>[k,p[k]]));
      const oldDraft=old&&Object.fromEntries(D.editableFields.filter(k=>k!=='media'&&k!=='sample'&&Object.hasOwn(old,k)).map(k=>[k,old[k]]));
      if(different(draft,oldDraft)) {
        if(user.role==='coach') throw new Error('forbidden');
        if(old) changedOne(await client.from('student_profiles').update({draft}).eq('id',p.id).select('id'));
        else changedOne(await client.from('student_profiles').insert({id:p.id,owner_id:user.role==='player'?user.id:null,draft}).select('id'));
      }
      if(p.published && (different(p.publishedData,old?.publishedData)||p.publishedAt!==old?.publishedAt)) unwrap(await client.rpc('publish_profile',{profile_id:p.id}));
      if(old?.published&&!p.published) unwrap(await client.rpc('withdraw_profile',{profile_id:p.id}));
      const caseData={status:p.status||'new',assigned_staff_id:p.responsible||null,notes:p.notes||'',next_action_at:p.nextAction||null};
      const oldCase=old&&{status:old.status||'new',assigned_staff_id:old.responsible||null,notes:old.notes||'',next_action_at:old.nextAction||null};
      if(user.role==='admin'&&different(caseData,oldCase)) changedOne(await client.from('recruitment_cases').update(caseData).eq('student_id',p.id).select('student_id'));
    }
    if(user.role==='coach') {
      if(different(next.coaches[user.id],prev.coaches[user.id])) {
        const {university_id,...data}=next.coaches[user.id]||{};
        changedOne(await client.from('coach_profiles').upsert({user_id:user.id,university_id:university_id||null,data}).select('user_id'));
      }
      const wanted=next.favorites[user.id]||[],before=prev.favorites[user.id]||[];
      for(const id of wanted.filter(id=>!before.includes(id))) changedOne(await client.from('coach_favorites').insert({coach_id:user.id,student_id:id}).select('student_id'));
      for(const id of before.filter(id=>!wanted.includes(id))) changedOne(await client.from('coach_favorites').delete().eq('coach_id',user.id).eq('student_id',id).select('student_id'));
    }
  }
  return {
    client, account, load, save,
    async login(email,password) { unwrap(await client.auth.signInWithPassword({email,password})); return account(); },
    async signup(name,email,password,role) { const data=unwrap(await client.auth.signUp({email,password,options:{data:{name,account_type:role==='coach'?'coach':'player'},emailRedirectTo:location.origin+'/portal'}})); return data.session?account():null; },
    async logout() { unwrap(await client.auth.signOut()); },
    async recover(email) { unwrap(await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/portal?reset=1'})); },
    async reset(password) { unwrap(await client.auth.updateUser({password})); },
    async expressInterest(studentId,message='') { return unwrap(await client.rpc('express_interest',{student_id:studentId,message})); },
    async respondInterest(id,response) { unwrap(await client.rpc('respond_to_interest',{interest_id:id,response})); },
    async proposeMeeting(id,proposal) { return unwrap(await client.rpc('propose_meeting',{interest_id:id,starts_at:proposal.starts_at,timezone:proposal.timezone,duration_minutes:Number(proposal.duration_minutes),message:proposal.message||''})); },
    async respondMeeting(id,response) { unwrap(await client.rpc('respond_to_meeting',{meeting_id:id,response})); },
    async saveResearch(table,data) {
      if(!['universities','university_contacts','recruitment_opportunities','staff_members'].includes(table)) throw new Error('forbidden');
      changedOne(await client.from(table).upsert(data).select('id'));
    }
  };
};
