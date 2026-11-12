const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const supabaseFixture = require('./helpers/supabase-fixture.cjs');

let browser;
let server;
let base;
before(async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, IMPACT_MODE: 'demo', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start')), 10000);
    server.stdout.on('data', chunk => {
      const match = chunk.toString().match(/http:\/\/localhost:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    server.once('error', reject);
    server.once('exit', code => { if (code) reject(new Error(`Server exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
});
async function pageFor(t, viewport = { width: 1440, height: 900 }, contextOptions = {}) {
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'No JavaScript errors'); });
  // External video services should not determine whether local workflows pass.
  await page.route('**/www.youtube-nocookie.com/**', route => route.fulfill({ body: '<html>Video preview</html>', contentType: 'text/html' }));
  return page;
}
async function login(page, email) {
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'impactdemo');
  await page.click('#loginSubmit');
  await page.waitForSelector('#portalApp:not([hidden])');
}
async function logout(page) { await page.click('#logout'); await page.waitForSelector('#authSection:not([hidden])'); }
async function populateProfile(page, selector = '#profileForm', name = 'Lucía Núñez') {
  const form = page.locator(selector);
  await form.locator('[name=name]').fill(name);
  await form.locator('[name=sport]').fill('Hockey');
  await form.locator('[name=goal]').selectOption('sports');
  await form.locator('[name=graduation]').fill('2028');
  await form.locator('[name=academic]').selectOption('transfer');
  await form.locator('[name=english]').selectOption('advanced');
  await form.locator('[name=budget]').selectOption('budget20');
  await form.locator('[name=gpa]').fill('8.5 / 10');
  await form.locator('[name=major]').fill('Architecture');
}
async function demoVideo(page) {
  const data = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e83e8c'; ctx.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const parts = [];
    recorder.ondataavailable = e => parts.push(e.data);
    const finished = new Promise(resolve => { recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(parts).arrayBuffer())]); });
    recorder.start();
    await new Promise(resolve => setTimeout(resolve, 300));
    ctx.fillStyle = '#ffc107'; ctx.fillRect(10, 10, 80, 40);
    await new Promise(resolve => setTimeout(resolve, 300));
    recorder.stop(); stream.getTracks().forEach(track => track.stop());
    return finished;
  });
  return { name: 'highlights.webm', mimeType: 'video/webm', buffer: Buffer.from(data) };
}

async function cloudPage(t, fixture = supabaseFixture(), config = {mode:'supabase',url:'https://impact-test.supabase.co',key:'sb_publishable_contract_test'}, contextOptions = {}) {
  const page=await pageFor(t,undefined,contextOptions);
  await page.context().route('**/portal/runtime-config.js', route=>route.fulfill({contentType:'text/javascript',body:`window.ImpactConfig=${JSON.stringify(config)};`}));
  await page.context().route('https://impact-test.supabase.co/**',fixture.route);
  return {page,fixture};
}
async function cloudLogin(page,role='player') {
  await page.fill('#loginEmail',`${role}@example.test`); await page.fill('#loginPassword','testpassword1'); await page.click('#loginSubmit');
  await page.waitForSelector('#portalApp:not([hidden])');
}
async function clickRpc(page, selector, name) {
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/rpc/'+name)&&r.request().method()==='POST');
  await page.locator(selector).click();
  assert.equal((await response).ok(),true,`RPC ${name} succeeds`);
}
async function openConnections(page) {
  await page.locator('[data-view=connections]').click();
  await page.waitForSelector('#connectionsPanel:not([hidden])');
}

test('Unconfigured portal fails closed and ignores forged local demo administrator',async t=>{
  const {page}=await cloudPage(t,undefined,{mode:'unconfigured'});
  await page.addInitScript(()=>sessionStorage.setItem('impactPortalSession','demo-admin'));
  await page.goto(base+'/portal');
  assert.equal(await page.locator('#portalApp').isVisible(),false);
  assert.equal(await page.locator('#loginSubmit').isDisabled(),true);
  assert.equal(await page.locator('.demo-accounts').isVisible(),false);
  for(const path of ['/.env','/.git/config','/portal/../package.json','/scripts/config.cjs'])assert.equal((await fetch(base+path)).status,404);
});
test('Supabase HTTP contract: wrong password, login, persisted session, database role, logout',async t=>{
  const {page}=await cloudPage(t);
  await page.addInitScript(()=>{sessionStorage.setItem('impactPortalSession','demo-admin');localStorage.setItem('impactPortalV1',JSON.stringify({accounts:[{id:'admin',role:'admin'}],profiles:[]}));});
  await page.goto(base+'/portal');
  await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(__dirname,`../test-results/shared-login-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await page.locator('.role-tabs').isVisible(),false);
  await page.fill('#loginEmail','player@example.test');await page.fill('#loginPassword','wrongpassword');await page.click('#loginSubmit');
  await page.waitForSelector('#loginError:not([hidden])');assert.equal(await page.locator('#portalApp').isVisible(),false);
  await cloudLogin(page);assert.equal(await page.locator('#adminPanel').isVisible(),false);
  await page.reload();await page.waitForSelector('#playerPanel:not([hidden])');
  await logout(page);await page.reload();assert.equal(await page.locator('#portalApp').isVisible(),false);
});
test('Supabase HTTP contract: signup requests only a public role and waits for email confirmation',async t=>{
  const {page,fixture}=await cloudPage(t);
  await page.goto(base+'/portal');await page.click('[data-auth=register]');await page.click('[data-role=coach]');
  await page.fill('#registerName','New Coach');await page.fill('#loginEmail','newcoach@example.test');await page.fill('#loginPassword','testpassword1');await page.click('#loginSubmit');
  await page.waitForFunction(()=>document.querySelector('#loginError').textContent.includes('correo'));
  const request=fixture.data.requests.find(r=>r.path.endsWith('/signup'));
  assert.equal(request.body.data.account_type,'coach');assert.equal(request.body.data.role,undefined);
  assert.equal(await page.locator('#portalApp').isVisible(),false);
});
test('Supabase HTTP contract: password recovery uses PKCE callback before allowing reset',async t=>{
  const {page,fixture}=await cloudPage(t);
  await page.goto(base+'/portal');await page.click('#forgotPassword');await page.fill('#loginEmail','player@example.test');await page.click('#loginSubmit');
  await page.waitForFunction(()=>document.querySelector('#loginError').textContent.includes('enlace'));
  const request=fixture.data.requests.find(r=>r.path.endsWith('/recover'));
  assert.ok(request.body.code_challenge);
  const callback=new URL(request.url).searchParams.get('redirect_to');
  const url=new URL(callback);url.searchParams.set('code','recovery-code');
  await page.goto(url.href);await page.waitForFunction(()=>document.querySelector('#loginSubmit').dataset.ui==='resetPassword');
  await page.fill('#loginPassword','updatedpassword1');await page.click('#loginSubmit');
  await page.waitForFunction(()=>document.querySelector('#loginError').textContent.includes('actualizada'));
  assert.equal(fixture.users.get('player@example.test').password,'updatedpassword1');
  assert.ok(fixture.data.requests.find(r=>r.path.endsWith('/token')&&r.body.code_verifier));
  assert.equal(await page.locator('#portalApp').isVisible(),false);
});
test('Supabase HTTP contract: independent browser contexts share published data without private fields',async t=>{
  const fixture=supabaseFixture();const {page}=await cloudPage(t,fixture);
  await page.goto(base+'/portal');await cloudLogin(page);await populateProfile(page);
  await page.click('#saveDraft');await page.waitForFunction(()=>document.querySelector('#playerStatus').textContent.includes('guardado'));
  await page.check('#publishConsent');await page.locator('#profileForm [type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#playerStatus').textContent.includes('publicado'));
  const {page:coach}=await cloudPage(t,fixture);await coach.goto(base+'/portal');await cloudLogin(coach,'coach');
  assert.equal(await coach.locator('.candidate').count(),1);
  await coach.locator('[data-profile]').click();assert.match(await coach.locator('#dialogContent').textContent(),/Lucía Núñez/);
  assert.doesNotMatch(await coach.locator('#dialogContent').textContent(),/20.000|budget|player@example/);
  await coach.click('#closeDialog');await coach.locator('[data-favorite]').click();await coach.click('[data-view=saved]');assert.equal(await coach.locator('.candidate').count(),1);
  await page.fill('#profileForm [name=name]','Unpublished edit');await page.click('#saveDraft');
  await page.waitForFunction(()=>document.querySelector('#playerStatus').textContent.includes('guardado'));
  await coach.reload();await coach.waitForSelector('.candidate');assert.match(await coach.locator('.candidate').textContent(),/Lucía Núñez/);
  await page.click('#unpublish');await page.waitForFunction(()=>document.querySelector('#unpublish').hidden);
  await coach.reload();await coach.waitForSelector('#coachPanel:not([hidden])');assert.equal(await coach.locator('.candidate').count(),0);
});
test('Supabase HTTP contract: a zero-row draft update is reported as failure',async t=>{
  const {page,fixture}=await cloudPage(t);
  await page.goto(base+'/portal');await cloudLogin(page);await populateProfile(page);
  fixture.data.denyNextStudentUpdate=true;
  await page.click('#saveDraft');
  await page.waitForFunction(()=>document.querySelector('#playerStatus').classList.contains('error'));
  assert.equal([...fixture.data.students.values()][0].draft.name,'Test player');
  assert.doesNotMatch(await page.locator('#playerStatus').textContent(),/Borrador guardado/);
});

test('Supabase HTTP contract: academic students publish without sport and choose sample universities',async t=>{
  const fixture=supabaseFixture();
  const athlete=fixture.addUser('athlete@example.test','player','Sample athlete');
  const athleteDraft={name:'Sample rugby athlete',goal:'sports',sport:'Rugby',major:'Business',graduation:'2028',academic:'secondary',english:'advanced',budget:'budget20'};
  fixture.data.students.get(athlete.user.id).draft=athleteDraft;
  fixture.data.published.set(athlete.user.id,{id:athlete.user.id,data:require('../portal/profile-domain.js').publicSnapshot(athleteDraft),published_at:new Date().toISOString()});
  const hiddenUniversityId=require('node:crypto').randomUUID();
  fixture.data.universities.set(hiddenUniversityId,{id:hiddenUniversityId,name:'Unreviewed real-data placeholder',is_sample:false,verification_status:'unverified',notes:'Private research'});
  const {page}=await cloudPage(t,fixture);await page.goto(base+'/portal');await cloudLogin(page);
  const form=page.locator('#profileForm');
  await form.locator('[name=name]').fill('Sample academic student');
  await form.locator('[name=goal]').selectOption('academic');
  await form.locator('[name=sport]').fill('');
  assert.equal(await form.locator('[name=sport]').getAttribute('required'),null);
  await form.locator('[name=major]').fill('Computer Science');
  await form.locator('[name=school]').fill('Sample current school');
  await form.locator('[name=graduation]').fill('2028');
  await form.locator('[name=academic]').selectOption('secondary');
  await form.locator('[name=english]').selectOption('advanced');
  await form.locator('[name=budget]').selectOption('budget20');
  const universityIds=[...fixture.data.universities.values()].filter(u=>u.is_sample).map(u=>u.id);
  await page.selectOption('#preferredUniversities',universityIds);
  assert.equal(await form.locator('[name=school]').inputValue(),'Sample current school');
  assert.match(await form.locator('[name=university]').inputValue(),/Sample University North/);
  assert.doesNotMatch(await page.locator('#preferredUniversities').textContent(),/Unreviewed real-data placeholder|Private research/);
  await page.check('#publishConsent');await clickRpc(page,'#profileForm [type=submit]','publish_profile');
  await page.waitForFunction(()=>document.querySelector('#playerStatus').textContent.includes('publicado'));
  assert.equal(fixture.data.published.get(fixture.users.get('player@example.test').user.id).data.sport,'');
  const {page:coach}=await cloudPage(t,fixture);await coach.goto(base+'/portal');await cloudLogin(coach,'coach');
  assert.equal(await coach.locator('.candidate').count(),2);
  await coach.selectOption('#goalFilter','academic');assert.equal(await coach.locator('.candidate').count(),1);
  assert.match(await coach.locator('.candidate').textContent(),/Sample academic student/);
  await coach.selectOption('#goalFilter','sports');assert.equal(await coach.locator('.candidate').count(),1);
  assert.match(await coach.locator('.candidate').textContent(),/Sample rugby athlete/);
  await coach.selectOption('#goalFilter','');await coach.selectOption('#majorFilter','Computer Science');
  assert.equal(await coach.locator('.candidate').count(),1);
  assert.match(await coach.locator('.candidate').textContent(),/Sample academic student/);
});

test('Supabase HTTP contract: independent participants accept interest and a meeting with local timezone display',async t=>{
  const fixture=supabaseFixture();
  const {page:student}=await cloudPage(t,fixture,undefined,{timezoneId:'America/Argentina/Buenos_Aires'});
  await student.goto(base+'/portal');await cloudLogin(student);await populateProfile(student);
  await student.check('#publishConsent');await clickRpc(student,'#profileForm [type=submit]','publish_profile');
  const studentId=fixture.users.get('player@example.test').user.id;
  const {page:coach}=await cloudPage(t,fixture,undefined,{timezoneId:'America/New_York'});
  await coach.goto(base+'/portal');await cloudLogin(coach,'coach');
  await clickRpc(coach,`[data-interest="${studentId}"]`,'express_interest');
  await coach.waitForSelector('#interestList [data-interest-id]');
  const interest=[...fixture.data.interests.values()][0];
  assert.equal(interest.status,'pending');
  await student.reload();await student.waitForSelector('#playerPanel:not([hidden])');await openConnections(student);
  assert.match(await student.locator('#interestList').textContent(),/Test coach/);
  await clickRpc(student,`[data-interest-response=accepted][data-id="${interest.id}"]`,'respond_to_interest');
  assert.equal(interest.status,'accepted');
  await coach.click('#refreshConnections');
  await coach.waitForSelector(`#meetingProposalForm [name=interest_id] option[value="${interest.id}"]`,{state:'attached'});
  await coach.selectOption('#meetingProposalForm [name=interest_id]',interest.id);
  const localStart=await coach.evaluate(()=>{
    const date=new Date(Date.now()+2*24*60*60*1000);date.setHours(15,30,0,0);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T15:30`;
  });
  await coach.fill('#meetingProposalForm [name=starts_at]',localStart);
  assert.equal(await coach.locator('#meetingProposalForm [name=timezone]').inputValue(),'America/New_York');
  await coach.fill('#meetingProposalForm [name=message]','Sample introductory meeting');
  await clickRpc(coach,'#meetingProposalForm [type=submit]','propose_meeting');
  const meeting=[...fixture.data.meetings.values()][0];
  assert.equal(meeting.status,'proposed');
  assert.equal(await coach.locator(`[data-meeting-response=accepted][data-id="${meeting.id}"]`).count(),0);
  const selfAcceptStatus=await coach.evaluate(async ({token,meetingId})=>{
    const response=await fetch('https://impact-test.supabase.co/rest/v1/rpc/respond_to_meeting',{method:'POST',headers:{'Authorization':'Bearer '+token,'apikey':'sb_publishable_contract_test','Content-Type':'application/json'},body:JSON.stringify({meeting_id:meetingId,response:'accepted'})});
    return response.status;
  },{token:fixture.sessionFor('coach@example.test').access_token,meetingId:meeting.id});
  assert.equal(selfAcceptStatus,403);assert.equal(meeting.status,'proposed');
  await student.click('#refreshConnections');
  await student.waitForSelector(`#meetingList [data-meeting-id="${meeting.id}"]`);
  const expectedStudentTime=await student.evaluate(starts=>new Intl.DateTimeFormat(({es:'es-AR',en:'en-US',fr:'fr-FR',it:'it-IT'})[document.documentElement.lang]||'es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(starts)),meeting.starts_at);
  assert.equal(await student.locator(`[data-meeting-id="${meeting.id}"] .meeting-time`).textContent(),expectedStudentTime);
  const expectedCoachTime=await coach.evaluate(starts=>new Intl.DateTimeFormat(({es:'es-AR',en:'en-US',fr:'fr-FR',it:'it-IT'})[document.documentElement.lang]||'es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(starts)),meeting.starts_at);
  assert.notEqual(expectedStudentTime,expectedCoachTime,'Participants see the same instant in their own timezones');
  await clickRpc(student,`[data-meeting-response=accepted][data-id="${meeting.id}"]`,'respond_to_meeting');
  assert.equal(meeting.status,'accepted');
  const {page:admin}=await cloudPage(t,fixture);await admin.goto(base+'/portal');await cloudLogin(admin,'admin');await openConnections(admin);
  assert.equal(await admin.locator('#interestList [data-interest-id]').count(),1);
  assert.equal(await admin.locator('#meetingList [data-meeting-id]').count(),1);
  assert.match(await admin.locator('#meetingList').textContent(),/Sample introductory meeting/);
  assert.equal(await admin.locator('[data-meeting-response=accepted]').count(),0);
});

test('Supabase HTTP contract: unrelated accounts cannot inspect or respond to participant records',async t=>{
  const fixture=supabaseFixture(), studentId=fixture.users.get('player@example.test').user.id, coachId=fixture.users.get('coach@example.test').user.id;
  const outsider=fixture.addUser('other@example.test','player','Unrelated sample student');
  const interestId=require('node:crypto').randomUUID(), meetingId=require('node:crypto').randomUUID();
  fixture.data.interests.set(interestId,{id:interestId,student_id:studentId,coach_id:coachId,status:'accepted',student_name:'Sample private participant',coach_name:'Sample coach',institution_name:'Sample University',message:'Participant-only interest',created_at:new Date().toISOString()});
  fixture.data.meetings.set(meetingId,{id:meetingId,interest_id:interestId,status:'proposed',proposed_by:coachId,response_by:null,starts_at:new Date(Date.now()+86400000).toISOString(),timezone:'America/New_York',duration_minutes:30,message:'Participant-only meeting'});
  const {page}=await cloudPage(t,fixture);await page.goto(base+'/portal');await cloudLogin(page,'other');await openConnections(page);
  assert.equal(await page.locator('#interestList [data-interest-id]').count(),0);
  assert.equal(await page.locator('#meetingList [data-meeting-id]').count(),0);
  const token=fixture.sessionFor(outsider.user.email).access_token;
  const result=await page.evaluate(async ({token,meetingId,interestId})=>{
    const headers={'Authorization':'Bearer '+token,'apikey':'sb_publishable_contract_test','Content-Type':'application/json'};
    const reads=await fetch('https://impact-test.supabase.co/rest/v1/meeting_requests?select=*',{headers}).then(r=>r.json());
    const response=await fetch('https://impact-test.supabase.co/rest/v1/rpc/respond_to_meeting',{method:'POST',headers,body:JSON.stringify({meeting_id:meetingId,response:'accepted'})});
    const proposed=await fetch('https://impact-test.supabase.co/rest/v1/rpc/propose_meeting',{method:'POST',headers,body:JSON.stringify({interest_id:interestId,starts_at:new Date(Date.now()+86400000).toISOString(),timezone:'America/New_York',duration_minutes:30})});
    const direct=await fetch('https://impact-test.supabase.co/rest/v1/recruitment_interests?id=eq.'+interestId,{method:'PATCH',headers,body:JSON.stringify({status:'accepted'})});
    return {reads,response:response.status,proposed:proposed.status,direct:direct.status};
  },{token,meetingId,interestId});
  assert.deepEqual(result,{reads:[],response:403,proposed:403,direct:403});
  assert.equal(fixture.data.meetings.get(meetingId).status,'proposed');
});
test('Local lifecycle: published edits, immutable media, republish, and admin status preservation',async t=>{
  const page=await pageFor(t);await page.goto(base+'/portal');await login(page,'admin@impactglobalagency.com');
  await page.selectOption('#adminProfile','demo-player');await page.selectOption('#adminResourceForm [name=status]','ready');await page.locator('#adminResourceForm [type=submit]').click();
  await logout(page);await login(page,'jugador@impactglobalagency.com');await page.fill('#profileForm [name=name]','Private draft name');await page.click('#saveDraft');
  const publicPage=await page.context().newPage();await publicPage.goto(base+'/portal?perfil=demo-player');
  assert.equal(await publicPage.locator('#publicProfileContent h2').textContent(),'Lucas Martínez');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('impactPortalV1')).profiles.find(p=>p.id==='demo-player').status),'ready');
  await page.setInputFiles('#playerVideo',await demoVideo(page));await page.waitForFunction(()=>document.querySelector('#playerMedia video')?.readyState>=1);
  await publicPage.reload();assert.equal(await publicPage.locator('video').count(),0);
  await page.locator('#profileForm [type=submit]').click();await publicPage.reload();assert.equal(await publicPage.locator('#publicProfileContent h2').textContent(),'Private draft name');
  await publicPage.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  const publishedKey=await page.evaluate(()=>JSON.parse(localStorage.getItem('impactPortalV1')).profiles.find(p=>p.id==='demo-player').publishedData.media.key);
  await page.setInputFiles('#playerVideo',await demoVideo(page));await page.waitForFunction(key=>JSON.parse(localStorage.getItem('impactPortalV1')).profiles.find(p=>p.id==='demo-player').media.key!==key,publishedKey);
  await publicPage.reload();await publicPage.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('impactPortalV1')).profiles.find(p=>p.id==='demo-player').publishedData.media.key),publishedKey);
});
test('Local admin: pipeline history and source-aware university/contact/opportunity tracking',async t=>{
  const page=await pageFor(t);await page.goto(base+'/portal');await login(page,'admin@impactglobalagency.com');
  await page.selectOption('#adminProfile','demo-player');await page.selectOption('#adminResourceForm [name=status]','contacted');await page.fill('#adminResourceForm [name=notes]','Private contact note');await page.locator('#adminResourceForm [type=submit]').click();
  assert.match(await page.locator('#pipelineHistory').textContent(),/Private contact note/);
  await page.locator('details.research > summary').click();const form=page.locator('[data-research=universities]');await form.locator('..').locator('summary').click();
  await form.locator('[name=name]').fill('Sample classroom university');await form.locator('[name=source_url]').fill('https://example.test/sample');await form.locator('[name=programs]').fill('Sample program');await form.locator('[type=submit]').click();
  assert.match(await page.locator('#researchRecords').textContent(),/Sample classroom university/);
  const universities=await page.evaluate(()=>JSON.parse(localStorage.getItem('impactPortalV1')).universities);assert.equal(universities[0].verification_status,'unverified');
  const contacts=page.locator('[data-research=contacts]');await contacts.locator('..').locator('summary').click();await contacts.locator('[name=university_id]').selectOption(universities[0].id);await contacts.locator('[name=name]').fill('Sample contact');await contacts.locator('[type=submit]').click();
  const opp=page.locator('[data-research=opportunities]');await opp.locator('..').locator('summary').click();await opp.locator('[name=student_id]').selectOption('demo-player');await opp.locator('[name=university_id]').selectOption(universities[0].id);await opp.locator('[name=title]').fill('Sample opportunity');await opp.locator('[type=submit]').click();
  await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('impactPortalV1')).opportunities.length),1);
  await page.locator('details.research > summary').click();
  await page.screenshot({path:path.join(__dirname,'../test-results/pipeline-admin.png'),fullPage:true});
});
test('Public intake hands answers to an authenticated draft without creating a public record',async t=>{
  const page=await pageFor(t);await page.goto(base);await page.fill('#name','Inquiry student');await page.fill('#phone','1234567');await page.selectOption('#age','18');await page.selectOption('#path','sports');await page.selectOption('#english','advanced');await page.selectOption('#budget','budget20');await page.locator('#leadForm [type=submit]').click();await page.click('#startProfile');await page.waitForURL('**/portal');
  await login(page,'jugador@impactglobalagency.com');await page.fill('#profileForm [name=sport]','');await page.click('#useIntake');
  assert.equal(await page.locator('#profileForm [name=name]').inputValue(),'Lucas Martínez');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('impactIntakeDraft')),null);
});
test('Coach CSV exports only published data and neutralizes formulas after whitespace',async t=>{
  const page=await pageFor(t);await page.goto(base+'/portal');await login(page,'jugador@impactglobalagency.com');
  await page.click('#saveDraft');
  await page.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('impactPortalV1'));
    const p=data.profiles.find(p=>p.id==='demo-player');p.name='Private draft name';p.publishedData.name='\t=2+2';
    localStorage.setItem('impactPortalV1',JSON.stringify(data));
  });
  await logout(page);await page.reload();await login(page,'coach@impactglobalagency.com');await page.selectOption('#sportFilter','Rugby');
  const downloaded=page.waitForEvent('download');await page.click('#exportCandidates');const download=await downloaded;
  const csv=await fs.readFile(await download.path(),'utf8');
  assert.ok(csv.includes("'\t=2+2"));
  assert.doesNotMatch(csv,/Private draft name|Presupuesto|Correo|20.000/);
});

test('Static routes and every referenced logo load at /, /portal and /portal/', async t => {
  const page = await pageFor(t);
  for (const route of ['/', '/portal', '/portal/']) {
    const response = await page.goto(base + route);
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => [...document.images].every(img => img.complete));
    assert.equal(await page.evaluate(() => [...document.images].every(img => img.naturalWidth > 0)), true);
  }
  assert.equal((await fetch(base + '/%invalid')).status, 400);
  assert.equal((await fetch(base + '/portal/missing')).status, 404);
});

test('Four languages translate the enquiry form and WhatsApp keeps the latest values', async t => {
  const page = await pageFor(t);
  await page.goto(base);
  await page.fill('#name', 'Agustín Ñúñez');
  await page.fill('#phone', '+54 9 11 1234 5678');
  await page.selectOption('#age', '18');
  await page.selectOption('#path', 'cultural');
  await page.selectOption('#english', 'advanced');
  await page.selectOption('#budget', 'budget20');
  for (const [lang, label] of [['es', 'Nombre del estudiante'], ['en', 'Student name'], ['fr', 'Nom de l’étudiant'], ['it', 'Nome dello studente']]) {
    await page.click(`[data-lang=${lang}]`);
    assert.equal(await page.locator('label[for=name]').textContent(), label);
    assert.equal(await page.locator('#path').inputValue(), 'cultural');
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.match(await page.locator('#budget option').nth(2).textContent(), /20/);
  }
  await page.locator('#leadForm [type=submit]').click();
  await page.fill('#name', 'Lucía Peña');
  const href = new URL(await page.locator('#summary a').getAttribute('href'));
  assert.equal(href.pathname, '/17046762602');
  assert.match(href.searchParams.get('text'), /Lucía Peña/);
  assert.match(href.searchParams.get('text'), /Borsa artistica o culturale/);
  const instagram = await page.locator('.top-strip a').first().getAttribute('href');
  assert.match(instagram, /instagram\.com\/impact_global_agency/);
  await page.locator('#leadForm [type=reset]').click();
  await page.waitForFunction(() => document.querySelector('#summary').style.display === 'none');
});

test('Portal is gated, validates sign-in and resolves role from the account', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/portal');
  assert.equal(await page.locator('#portalApp').isVisible(), false);
  assert.equal(await page.locator('[data-role=admin]').count(), 0);
  for (const [lang, title] of [['es', 'Tu próximo paso empieza acá.'], ['en', 'Your next step starts here.'], ['fr', 'Votre prochaine étape commence ici.'], ['it', 'Il tuo prossimo passo inizia qui.']]) {
    await page.click(`[data-lang=${lang}]`);
    assert.equal(await page.locator('#authSection h1').textContent(), title);
  }
  await page.fill('#loginEmail', 'nadie@example.com'); await page.fill('#loginPassword', 'wrongpassword'); await page.click('#loginSubmit');
  await page.waitForSelector('#loginError:not([hidden])');
  assert.equal(await page.locator('#portalApp').isVisible(), false);
  await page.click('[data-role=coach]');
  await login(page, 'jugador@impactglobalagency.com');
  assert.equal(await page.locator('#playerPanel').isVisible(), true);
  assert.equal(await page.locator('[data-view=admin]').count(), 0);
  await page.reload(); assert.equal(await page.locator('#portalApp').isVisible(), true);
  await logout(page); await page.reload(); assert.equal(await page.locator('#portalApp').isVisible(), false);
});

test('Player registration, draft, publication, real video, public preview and withdrawal', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/portal');
  await page.click('[data-auth=register]');
  await page.fill('#registerName', 'Lucía Núñez');
  await page.fill('#loginEmail', 'lucia@example.com'); await page.fill('#loginPassword', 'testpassword1'); await page.click('#loginSubmit');
  await page.waitForSelector('#portalApp:not([hidden])');
  await populateProfile(page);
  await page.fill('#profileForm [name=bio]', '<script>alert("test")</script> y logros deportivos');
  await page.click('#saveDraft');
  await page.reload();
  assert.equal(await page.locator('#profileForm [name=gpa]').inputValue(), '8.5 / 10');
  await page.click('[data-lang=en]');
  assert.equal(await page.locator('#profileForm [name=academic]').inputValue(), 'transfer');
  await page.locator('#profileForm [type=submit]').click();
  assert.match(await page.locator('#playerStatus').textContent(), /Show my profile/);
  await page.check('#publishConsent'); await page.locator('#profileForm [type=submit]').click();
  await page.setInputFiles('#playerVideo', await demoVideo(page));
  await page.waitForFunction(() => document.querySelector('#playerMedia video')?.readyState >= 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#playerMedia video')?.readyState >= 1);
  await page.click('#previewProfile');
  assert.equal(await page.locator('#dialogContent script').count(), 0);
  assert.match(await page.locator('#dialogContent .profile-bio').textContent(), /<script>/);
  const publicLink = await page.locator('#dialogContent a[target=_blank]').getAttribute('href');
  const publicPage = await page.context().newPage(); await publicPage.goto(base + publicLink);
  assert.match(await publicPage.locator('#publicProfileContent').textContent(), /Lucía Núñez/);
  assert.equal(await publicPage.locator('#portalApp').isVisible(), false);
  assert.doesNotMatch(await publicPage.locator('#publicProfileContent').textContent(), /lucia@example.com|20,000/);
  await page.click('#closeDialog'); await page.click('#unpublish');
  await publicPage.reload(); assert.match(await publicPage.locator('#publicProfileContent').textContent(), /not published/);
  await publicPage.close();
  await logout(page);
  await page.fill('#loginEmail', 'lucia@example.com'); await page.fill('#loginPassword', 'testpassword1'); await page.click('#loginSubmit');
  await page.waitForSelector('#portalApp:not([hidden])');
  assert.equal(await page.locator('#profileForm [name=name]').inputValue(), 'Lucía Núñez');
});

test('Coach search, favorites, export and coach profile persist', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/portal'); await login(page, 'coach@impactglobalagency.com');
  assert.equal(await page.locator('.candidate').count(), 3);
  await page.selectOption('#sportFilter', 'Golf'); assert.equal(await page.locator('.candidate').count(), 1);
  await page.locator('[data-favorite]').click();
  await page.locator('#candidateFilters [type=reset]').click();
  await page.click('[data-view=saved]'); assert.equal(await page.locator('.candidate').count(), 1);
  const download = page.waitForEvent('download'); await page.click('#exportCandidates'); assert.equal((await download).suggestedFilename(), 'impact-candidatos.csv');
  await page.click('[data-view=coachProfile]');
  await page.fill('#coachForm [name=institution]', 'Demo University'); await page.fill('#coachForm [name=sport]', 'Golf'); await page.locator('#coachForm [type=submit]').click();
  await page.reload(); await page.click('[data-view=coachProfile]'); assert.equal(await page.locator('#coachForm [name=institution]').inputValue(), 'Demo University');
  await page.click('[data-view=saved]'); await page.locator('[data-favorite]').click(); assert.equal(await page.locator('.candidate').count(), 0);
});

test('Admin creates and edits profiles, assigns coaches and uploads video', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/portal'); await login(page, 'admin@impactglobalagency.com');
  assert.equal(await page.locator('#adminList tr').count(), 4);
  await page.click('#createAdminProfile'); await populateProfile(page, '#adminEditForm', 'Alumno demo');
  await page.locator('#adminEditForm [name=published]').check(); await page.locator('#adminEditForm [type=submit]').click();
  assert.equal(await page.locator('#adminList tr').count(), 5);
  const row = page.locator('#adminList tr').filter({ hasText: 'Alumno demo' }); await row.locator('[data-edit]').click();
  await page.fill('#adminEditForm [name=major]', 'Design');
  await page.evaluate(() => document.querySelector('[data-lang=fr]').click());
  assert.equal(await page.locator('#adminEditForm [name=major]').inputValue(), 'Design');
  await page.locator('#adminEditForm [type=submit]').click();
  const id = await row.locator('[data-profile]').getAttribute('data-profile'); await page.selectOption('#adminProfile', id);
  await page.selectOption('#adminResourceForm [name=responsible]', 'Agustín Loprestti'); await page.selectOption('#adminResourceForm [name=status]', 'ready');
  await page.setInputFiles('#adminVideoFile', await demoVideo(page)); await page.locator('#adminResourceForm [type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#adminMedia video')?.readyState >= 1);
  await page.reload(); await page.selectOption('#adminProfile', id);
  assert.equal(await page.locator('#adminResourceForm [name=responsible]').inputValue(), 'Agustín Loprestti');
  assert.equal(await page.locator('#adminResourceForm [name=status]').inputValue(), 'ready');
  await page.waitForFunction(() => document.querySelector('#adminMedia video')?.readyState >= 1);
});

test('Responsive screens, zoom-sized viewports, anchor offset and sticky evaluation', async t => {
  const page = await pageFor(t);
  await fs.mkdir(path.join(__dirname, '../test-results'), { recursive: true });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1800, height: 1125 }, { width: 1152, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport); await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, bottom: document.querySelector('.hero').getBoundingClientRect().bottom, height: innerHeight }));
    assert.equal(layout.overflow, false, `Landing overflow at ${viewport.width}`);
    assert.ok(layout.bottom >= layout.height - 1, 'First viewport stays navy');
    await page.screenshot({ path: path.join(__dirname, `../test-results/landing-${viewport.width}.png`) });
    await page.goto(base + '/portal');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Portal overflow at ${viewport.width}`);
    if (viewport.width === 390 || viewport.width === 1440) await page.screenshot({ path: path.join(__dirname, `../test-results/portal-${viewport.width}.png`), fullPage: true });
    await login(page, 'jugador@impactglobalagency.com');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Player dashboard overflow at ${viewport.width}`);
    if (viewport.width === 390 || viewport.width === 1440) await page.screenshot({ path: path.join(__dirname, `../test-results/player-${viewport.width}.png`), fullPage: true });
    await logout(page);
  }
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(base);
  for (const language of ['es', 'en', 'fr', 'it']) {
    await page.click(`[data-lang=${language}]`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Translated header overflow in ${language}`);
  }
  await page.click('[data-lang=es]');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base);
  await page.click('.desktop-only a[href="#servicios"]');
  await page.waitForFunction(() => Math.abs(document.querySelector('#servicios').getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-offset')) - 16) < 2);
  await page.locator('footer a[href="#evaluacion"]').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('#evaluacion').getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-offset')) - 16) < 2);
  await page.evaluate(() => window.scrollBy({ top: 150, behavior: 'instant' }));
  const sticky = await page.evaluate(() => ({ top: document.querySelector('.form-note').getBoundingClientRect().top, headerBottom: document.querySelector('#siteHeader').getBoundingClientRect().bottom }));
  assert.ok(sticky.top >= sticky.headerBottom, `Evaluation remains below the header: ${JSON.stringify(sticky)}`);
  await page.screenshot({ path: path.join(__dirname, '../test-results/evaluation.png') });
});
