// Opt-in: uses and changes only the fixtures provisioned in IMPACT's development project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { publicConfig } = require('./config.cjs');

const origin = 'http://localhost:8000';
const project = 'jbhvwpfgpnwyqzfobxcq';
const hosted = 'https://' + project + '.supabase.co';
let stage = 'validate development configuration';
const pass = label => console.log('PASS ' + label);
const field = name => '#profileForm [name=' + name + ']';
const interestCard = id => '#interestList [data-interest-id="' + id + '"]';
const meetingCard = id => '#meetingList [data-meeting-id="' + id + '"]';

async function requestDuring(page, route, method, action) {
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).origin === hosted &&
      new URL(r.url()).pathname === '/rest/v1/' + route && r.request().method() === method),
    action()
  ]);
  if (!response.ok()) {
    const { code } = await response.json().catch(() => ({}));
    throw new Error('Supabase ' + route + ': HTTP ' + response.status() + ' ' + (/^[A-Z0-9]{5,10}$/.test(code) ? code : ''));
  }
}
async function connections(page, refresh = false) {
  await page.click(refresh ? '#refreshConnections' : '[data-view=connections]');
  await page.waitForSelector('#connectionsPanel:not([hidden])');
}
function result({ data, error }) {
  if (error) throw new Error('Supabase error ' + (/^[A-Za-z0-9_]{1,60}$/.test(error.code) ? error.code : ''));
  return data;
}

async function main() {
  const config = publicConfig();
  const fixtures = JSON.parse(fs.readFileSync('.local/test-accounts.json', 'utf8'));
  assert.equal(config.mode, 'supabase');
  assert.equal(config.url, hosted);
  assert.equal(fixtures.url, hosted);
  assert.equal((await fetch(origin + '/.local/ACCESOS-IMPACT.md')).status, 404);
  const browser = await chromium.launch();
  try {
    async function login(email, panel, timezoneId = 'America/New_York') {
      stage = 'authenticate ' + email;
      const user = fixtures.accounts.find(u => u.email === email);
      assert.ok(user?.id && user.password);
      const context = await browser.newContext({ timezoneId });
      const page = await context.newPage();
      await page.goto(origin + '/portal');
      assert.ok(await page.evaluate(expected => window.ImpactConfig?.mode === 'supabase' &&
        window.ImpactConfig?.url === expected, hosted));
      await page.fill('#loginEmail', email);
      await page.fill('#loginPassword', user.password);
      await page.click('#loginSubmit');
      await page.waitForSelector('#' + panel + ':not([hidden])');
      const api = createClient(hosted, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
      const auth = result(await api.auth.signInWithPassword({ email, password: user.password }));
      assert.equal(auth.user.id, user.id);
      return { page, context, api, user };
    }
    async function snapshot(id) {
      return result(await publicApi.from('published_profiles').select('data,published_at').eq('id', id).maybeSingle());
    }
    const publicApi = createClient(hosted, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const students = [];
    for (const type of ['academic', 'rugby', 'hockey']) {
      const student = await login(type + '.student@impact.test', 'playerPanel', 'America/Argentina/Buenos_Aires');
      const { api, user, page } = student;
      stage = 'validate and publish ' + type + ' student';
      const profile = result(await api.from('student_profiles').select('id,draft').eq('owner_id', user.id).single());
      student.profile = profile;
      students.push(student);
      if (type === 'academic') {
        assert.equal(await page.inputValue(field('goal')), 'academic');
        assert.ok(!profile.draft.sport);
        await page.selectOption('#preferredUniversities', 'b35ff0de-249e-4a8c-8ea9-d6ef5a38e0da');
        assert.notEqual(await page.inputValue(field('school')), await page.inputValue(field('university')));
      }
      if (!(await snapshot(profile.id))) {
        const marker = ' [IMPACT development fixture]';
        if (type === 'academic') {
          const bio = await page.inputValue(field('bio'));
          await page.fill(field('bio'), bio + marker);
          await requestDuring(page, 'student_profiles', 'PATCH', () => page.click('#saveDraft'));
          assert.equal(await snapshot(profile.id), null);
          assert.equal(result(await api.from('student_profiles').select('draft').eq('id', profile.id).single()).draft.bio, bio + marker);
          await page.fill(field('bio'), bio);
        }
        await page.check('#publishConsent');
        await requestDuring(page, 'rpc/publish_profile', 'POST', () => page.click('#profileForm [type=submit]'));
        await page.waitForSelector('#unpublish:not([hidden])');
        pass(type + ' fixture published via hosted RPC');
      }
      const published = await snapshot(profile.id);
      assert.ok(published.data.sample);
      for (const key of ['budget','email','notes','age','status']) assert.ok(!Object.hasOwn(published.data, key));
    }
    const student = students[0];
    const id = student.profile.id;
    const coach = await login('rugby.coach@impact.test', 'coachPanel');
    stage = 'check persistence, discovery, and privacy';
    await student.page.reload();
    await student.page.waitForSelector('#playerPanel:not([hidden])');
    assert.equal(await student.page.locator('#adminPanel').isVisible(), false);
    await coach.page.selectOption('#goalFilter','academic');
    await coach.page.locator('[data-profile="' + id + '"]').waitFor();
    assert.deepEqual(result(await coach.api.from('student_profiles').select('id,draft').eq('id', id)), []);
    const favorite = coach.page.locator('[data-favorite="' + id + '"]');
    if (await favorite.getAttribute('aria-pressed') === 'false')
      await requestDuring(coach.page, 'coach_favorites', 'POST', () => favorite.click());
    await coach.page.reload();
    await coach.page.waitForSelector('[data-favorite="' + id + '"][aria-pressed=true]');
    pass('session, academic discovery, privacy and favorite persistence');

    stage = 'express and accept interest';
    let interest = result(await coach.api.from('recruitment_interests').select('id,status')
      .eq('coach_id', coach.user.id).eq('student_id', id).maybeSingle());
    if (!interest) {
      await requestDuring(coach.page, 'rpc/express_interest', 'POST', () => coach.page.click('[data-interest="' + id + '"]'));
      interest = result(await coach.api.from('recruitment_interests').select('id,status')
        .eq('coach_id', coach.user.id).eq('student_id', id).single());
      assert.equal(interest.status, 'pending');
      pass('coach sent interest');
    }
    await connections(student.page);
    await connections(student.page, true);
    await student.page.waitForSelector(interestCard(interest.id));
    if (interest.status === 'pending') {
      await requestDuring(student.page, 'rpc/respond_to_interest', 'POST',
        () => student.page.click('[data-interest-response=accepted][data-id="' + interest.id + '"]'));
      pass('student accepted interest from a separate context');
    }
    assert.equal(result(await coach.api.from('recruitment_interests').select('status').eq('id', interest.id).single()).status, 'accepted');

    stage = 'propose and accept a meeting';
    let meeting = result(await coach.api.from('meeting_requests').select('id,status')
      .eq('interest_id', interest.id).in('status', ['proposed','accepted']).maybeSingle());
    await connections(coach.page);
    await connections(coach.page, true);
    if (!meeting) {
      await coach.page.waitForSelector('#meetingProposalForm option[value="' + interest.id + '"]', {state:'attached'});
      await coach.page.selectOption('#meetingProposalForm [name=interest_id]', interest.id);
      const start = await coach.page.evaluate(() => {
        const d = new Date(Date.now() + 2 * 86400000);
        return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(x => String(x).padStart(2, '0')).join('-') + 'T15:30';
      });
      await coach.page.fill('#meetingProposalForm [name=starts_at]', start);
      await coach.page.fill('#meetingProposalForm [name=message]', 'IMPACT development fixture: introductory meeting');
      await requestDuring(coach.page, 'rpc/propose_meeting', 'POST', () => coach.page.click('#meetingProposalForm [type=submit]'));
      meeting = result(await coach.api.from('meeting_requests').select('id,status')
        .eq('interest_id', interest.id).eq('status', 'proposed').single());
      pass('coach proposed a meeting');
    }
    await connections(student.page, true);
    const meetingNode = meetingCard(meeting.id);
    await student.page.waitForSelector(meetingNode);
    await coach.page.waitForSelector(meetingNode);
    assert.notEqual(await student.page.locator(meetingNode + ' .meeting-time').textContent(),
      await coach.page.locator(meetingNode + ' .meeting-time').textContent());
    if (meeting.status === 'proposed') {
      await requestDuring(student.page, 'rpc/respond_to_meeting', 'POST',
        () => student.page.click('[data-meeting-response=accepted][data-id="' + meeting.id + '"]'));
      pass('student accepted meeting; participants saw their local time');
    }

    const admin = await login('admin@impact.test', 'adminPanel');
    stage = 'verify administrator oversight';
    await connections(admin.page);
    await admin.page.waitForSelector(interestCard(interest.id));
    await admin.page.waitForSelector(meetingNode);
    assert.equal(result(await admin.api.from('meeting_requests').select('status').eq('id', meeting.id).single()).status, 'accepted');
    pass('administrator sees accepted meeting');

    stage = 'verify published lifecycle and independent staff history';
    const hockey = students.find(s => s.user.email === 'hockey.student@impact.test');
    const hockeyId = hockey.profile.id;
    const before = result(await admin.api.from('recruitment_cases').select('status,notes,assigned_staff_id').eq('student_id', hockeyId).single());
    if (before.status === 'new' && !before.notes && !before.assigned_staff_id) {
      await admin.page.click('[data-view=admin]');
      await admin.page.selectOption('#adminProfile', hockeyId);
      await admin.page.selectOption('#adminResourceForm [name=status]', 'ready');
      const staff = admin.page.locator('#adminResourceForm [name=responsible] option').nth(1);
      await admin.page.selectOption('#adminResourceForm [name=responsible]', await staff.getAttribute('value'));
      await admin.page.fill('#adminResourceForm [name=notes]', 'IMPACT development fixture: reviewed for demo');
      await requestDuring(admin.page, 'recruitment_cases', 'PATCH', () => admin.page.click('#adminResourceForm [type=submit]'));
      await admin.page.locator('#pipelineHistory li').filter({hasText:'reviewed for demo'}).waitFor();
      pass('administrator changed stage and assignment; history recorded');
    }
    if (process.argv.includes('--verify-lifecycle')) {
      const expected = result(await admin.api.from('recruitment_cases').select('status,notes,assigned_staff_id').eq('student_id', hockeyId).single());
      const initial = await snapshot(hockeyId);
      const bio = await hockey.page.inputValue(field('bio'));
      const marker = bio + ' [temporary publication check]';
      await hockey.page.fill(field('bio'), marker);
      await requestDuring(hockey.page, 'student_profiles', 'PATCH', () => hockey.page.click('#saveDraft'));
      assert.deepEqual(await snapshot(hockeyId), initial);
      await requestDuring(hockey.page, 'rpc/publish_profile', 'POST', () => hockey.page.click('#profileForm [type=submit]'));
      assert.equal((await snapshot(hockeyId)).data.bio, marker);
      await requestDuring(hockey.page, 'rpc/withdraw_profile', 'POST', () => hockey.page.click('#unpublish'));
      assert.equal(await snapshot(hockeyId), null);
      await coach.page.reload();
      await coach.page.waitForSelector('#coachPanel:not([hidden])');
      assert.equal(await coach.page.locator('[data-profile="' + hockeyId + '"]').count(), 0);
      await hockey.page.fill(field('bio'), bio);
      await hockey.page.check('#publishConsent');
      await requestDuring(hockey.page, 'rpc/publish_profile', 'POST', () => hockey.page.click('#profileForm [type=submit]'));
      assert.equal((await snapshot(hockeyId)).data.bio, bio);
      assert.deepEqual(result(await admin.api.from('recruitment_cases').select('status,notes,assigned_staff_id').eq('student_id', hockeyId).single()), expected);
      assert.deepEqual(result(await coach.api.from('recruitment_cases').select('student_id').eq('student_id', hockeyId)), []);
      pass('draft isolated; republished and withdrew via real RPCs; staff case stayed private and unchanged');
    }

    const outsider = await login('academic.coach@impact.test', 'coachPanel');
    stage = 'verify unrelated account restrictions';
    for (const [table, row] of [['recruitment_interests', interest], ['meeting_requests', meeting]])
      assert.deepEqual(result(await outsider.api.from(table).select('id').eq('id', row.id)), []);
    const write = await outsider.api.from('meeting_requests').update({ status:'cancelled' }).eq('id',meeting.id);
    assert.equal(write.error?.code, '42501');
    const response = await outsider.api.rpc('respond_to_meeting',{meeting_id:meeting.id,response:'cancelled'});
    assert.equal(response.error?.code, '42501');
    assert.equal(await outsider.page.locator('#adminPanel').isVisible(), false);
    pass('unrelated coach cannot read or change either participant record');

    stage = 'verify logout and document hosted results';
    await outsider.page.click('#logout');
    await outsider.page.waitForSelector('#loginForm:visible');
    await outsider.page.reload();
    await outsider.page.waitForSelector('#loginForm:visible');
    assert.equal(await outsider.page.locator('#portalApp').isVisible(), false);
    pass('logout survives reload');
    fs.mkdirSync('test-results', { recursive: true });
    await connections(admin.page);
    await admin.page.screenshot({ path:'test-results/live-admin-connections.png', fullPage:true });
    console.log(JSON.stringify({ project, interest:interest.id, meeting:meeting.id, status:'accepted' }));
  } finally {
    await browser.close();
  }
}
main().catch(error => {
  // Never emit Playwright call logs: a failed fill could include a password.
  const line = error.stack?.split('\n').find(line => line.includes('live-portal-smoke.cjs:'));
  console.error('FAIL ' + stage + (line ? ' (' + line.trim() + ')' : ''));
  if (/^Supabase (?:error |[a-z_/]+: HTTP )/.test(error.message)) console.error(error.message);
  process.exitCode = 1;
});
