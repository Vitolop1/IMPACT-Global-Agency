const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

let browser;
let server;
let base;
before(async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
async function pageFor(t, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
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
