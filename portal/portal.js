(() => {
  const $ = selector => document.querySelector(selector);
  const UI = window.ImpactUI;
  const Profiles = window.ImpactProfiles;
  const config = window.ImpactConfig || { mode: 'unconfigured' };
  const demo = config.mode === 'demo';
  const backend = config.mode === 'supabase' ? window.createImpactBackend(config) : null;
  const cloudCopy = { publish: 'cloudPublish', published: 'cloudPublished', visibility: 'cloudVisibility', profilePublished: 'cloudProfilePublished', missingProfile: 'cloudMissingProfile', localPreview: 'cloudPreview' };
  const t = (key, values) => UI.t(backend && cloudCopy[key] || key, values);
  const STORE = 'impactPortalV1';
  const SESSION = 'impactPortalSession';
  const demoAccounts = [
    { id: 'demo-player', email: 'jugador@impactglobalagency.com', name: 'Lucas Martínez', role: 'player' },
    { id: 'demo-coach', email: 'coach@impactglobalagency.com', name: 'Entrenador', role: 'coach' },
    { id: 'demo-admin', email: 'admin@impactglobalagency.com', name: 'Equipo Impact', role: 'admin' }
  ];
  const seedProfiles = [
    { id: 'demo-player', name: 'Lucas Martínez', sport: 'Rugby', position: 'Apertura', goal: 'sports', major: 'Business', graduation: '2027', english: 'intermediate', budget: 'budget20', gpa: '8.4 / 10', academic: 'secondary', countries: 'Estados Unidos, Canadá', published: true, status: 'review', sample: true },
    { id: 'demo-golf', name: 'Sofía Herrera', sport: 'Golf', goal: 'sports', major: 'Economics', graduation: '2027', english: 'advanced', budget: 'budget30', academic: 'secondary', published: true, status: 'review', sample: true },
    { id: 'demo-football', name: 'Mateo Silva', sport: 'Fútbol / Soccer', position: 'Midfielder', goal: 'sports', major: 'Engineering', graduation: '2028', english: 'tested', budget: 'budget20', academic: 'transfer', published: true, status: 'ready', sample: true },
    { id: 'demo-arts', name: 'Valentina Ruiz', sport: 'Arte', goal: 'cultural', major: 'Fine Arts', graduation: '2028', english: 'advanced', budget: 'budget10', academic: 'secondary', published: false, status: 'review', sample: true }
  ];
  const fields = [
    ['name', 'name', 'text', true], ['age', 'age', 'number'],
    ['sport', 'sport', 'text'], ['position', 'position', 'text'],
    ['club', 'club', 'text'], ['goal', 'goal', ['sports', 'academic', 'cultural', 'exchange'], true],
    ['major', 'major', 'text'], ['university', 'university', 'text'],
    ['school', 'school', 'text'], ['graduation', 'graduation', 'number', true],
    ['academic', 'academicStatus', ['secondary', 'transfer', 'graduate'], true], ['gpa', 'gpa', 'text'],
    ['english', 'english', ['basic', 'intermediate', 'advanced', 'tested'], true],
    ['budget', 'budget', ['budget10', 'budget20', 'budget30', 'budget45', 'discuss'], true],
    ['countries', 'countries', 'text'], ['bio', 'bio', 'textarea']
  ];
  let state;
  let session = null;
  let authMode = 'login';
  let registrationRole = 'player';
  let currentView = '';
  let dialogProfile = null;
  let editingProfile = null;
  let connectionBusy = false;
  let lastFeedback = new Map();
  const mediaURLs = new Map();
  const publicId = new URLSearchParams(location.search).get('perfil');

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function safeURL(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  function readState() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE));
      if (data && Array.isArray(data.accounts) && Array.isArray(data.profiles)) return { coaches: {}, favorites: {}, universities: [], contacts: [], opportunities: [], staff: [], ...data, version: 2, profiles: data.profiles.map(Profiles.migrate) };
    } catch { /* Keep the demo usable when storage is unavailable. */ }
    return { version: 2, accounts: [], profiles: seedProfiles.map(Profiles.migrate), coaches: {}, favorites: {}, universities: [], contacts: [], opportunities: [], staff: [] };
  }
  async function persist(next) {
    if (backend) {
      await backend.save(next, state, session);
      state = await backend.load(session);
    } else if (demo) {
      localStorage.setItem(STORE, JSON.stringify(next));
      state = next;
    } else throw new Error('unconfigured');
  }
  function setFeedback(selector, key, error = false) {
    lastFeedback.set(selector, { key, error });
    const el = $(selector);
    if (!el) { lastFeedback.delete(selector); return; }
    el.hidden = false;
    el.textContent = t(key);
    el.classList.toggle('error', error);
  }
  function accountById(id) { return [...demoAccounts, ...state.accounts].find(a => a.id === id); }
  function ownProfile() { return state.profiles.find(p => p.id === session?.id || p.ownerId === session?.id) || { id: session?.id, name: session?.name || '', status: 'new', published: false }; }
  function option(value, label, selected = false) { return `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`; }
  function pretty(value) { return UI.t(value) === value ? (value || '—') : t(value); }
  function profileValues(form) { return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()])); }
  function fillForm(form, values) {
    for (const field of form.elements) if (field.name && Object.hasOwn(values, field.name)) field.value = values[field.name] ?? '';
  }
  function drawPlayerFields(data, container = $('#playerFields')) {
    container.innerHTML = fields.map(([name, label, type, required]) => {
      const attrs = `name="${name}"${required ? ' required' : ''}`;
      let control;
      if (Array.isArray(type)) control = `<select ${attrs}>${option('', t('choose'))}${type.map(v => option(v, t(v), data[name] === v)).join('')}</select>`;
      else if (type === 'textarea') control = `<textarea ${attrs} maxlength="2000">${escape(data[name])}</textarea>`;
      else control = `<input ${attrs} type="${type}" value="${escape(data[name])}" ${type === 'number' ? (name === 'age' ? 'min="14" max="80"' : 'min="2000" max="2100"') : `maxlength="${name === 'university' ? 1000 : 200}"`}>`;
      return `<label${type === 'textarea' ? ' class="full"' : ''}><span>${escape(t(label))}</span>${control}</label>`;
    }).join('');
    syncGoalFields(container);
    container.querySelector('[name=goal]').addEventListener('change', () => syncGoalFields(container));
  }
  function syncGoalFields(container = $('#playerFields')) {
    const sports = container.querySelector('[name=goal]').value === 'sports';
    const sport = container.querySelector('[name=sport]');
    sport.required = sports;
    sport.setAttribute('aria-required', String(sports));
    sport.placeholder = sports ? '' : t('athleticFieldsOptional');
  }
  async function passwordHash(password, salt) {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, material, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function setAuthMode(mode) {
    authMode = mode;
    $('#registerNameField').hidden = mode !== 'register';
    $('#registerName').required = mode === 'register';
    $('.role-tabs').hidden = !demo && mode !== 'register';
    $('#loginEmail').closest('label').hidden = mode === 'reset';
    $('#loginEmail').required = mode !== 'reset';
    $('#loginPassword').closest('label').hidden = mode === 'recover';
    $('#loginPassword').required = mode !== 'recover';
    $('#forgotPassword').hidden = demo || mode !== 'login';
    $('#passwordHelp').hidden = mode !== 'register';
    $('#loginPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#loginSubmit').dataset.ui = ({ register: 'register', recover: 'sendRecovery', reset: 'resetPassword' })[mode] || 'login';
    $('#loginError').hidden = true;
    lastFeedback.delete('#loginError');
    document.querySelectorAll('[data-auth]').forEach(b => { b.classList.toggle('active', b.dataset.auth === mode); b.setAttribute('aria-pressed', String(b.dataset.auth === mode)); });
    UI.translate();
  }
  function allowedViews() {
    return session.role === 'admin' ? ['admin', 'connections'] : session.role === 'coach' ? ['coach', 'saved', 'coachProfile', 'connections'] : ['player', 'connections'];
  }
  function renderSidebar() {
    const labels = { admin: 'profiles', player: 'myProfile', coach: 'candidates', saved: 'saved', coachProfile: 'coachProfile', connections: 'connections' };
    const pending = (state.interests || []).filter(i => i.status === 'pending' && session.role === 'player' && i.student_id === ownProfile().id).length + (state.meetings || []).filter(m => m.status === 'proposed' && m.proposed_by !== session.id && session.role !== 'admin').length;
    $('#sideMenu').innerHTML = allowedViews().map(view => `<button type="button" data-view="${view}" class="${view === currentView ? 'active' : ''}">${escape(t(labels[view]))}${view === 'connections' && pending ? `<span class="inbox-count">${pending}</span>` : ''}</button>`).join('');
  }
  function setView(view) {
    if (!session || !allowedViews().includes(view)) return;
    currentView = view;
    for (const name of ['admin', 'player', 'coach', 'coachProfile', 'connections']) $(`#${name}Panel`).hidden = name !== (view === 'saved' ? 'coach' : view);
    renderSidebar();
    if (view === 'coach' || view === 'saved') { refreshFilterOptions(); renderCandidates(); }
    if (view === 'admin') renderAdmin();
    if (view === 'connections') renderConnections();
  }
  function enter(account) {
    session = account;
    if (demo) sessionStorage.setItem(SESSION, account.id);
    $('#authSection').hidden = true;
    $('#portalApp').hidden = false;
    $('#accountName').textContent = account.name;
    $('#accountRole').textContent = t(account.role);
    const data = ownProfile();
    drawPlayerFields(data);
    fillForm($('#profileForm'), data);
    $('#publishConsent').checked = Boolean(data.published);
    $('#unpublish').hidden = !data.published;
    fillForm($('#coachForm'), state.coaches[session.id] || { name: account.name });
    renderCatalog();
    setView(allowedViews()[0]);
    renderMedia($('#playerMedia'), data, true);
    renderSuggestions();
    try { $('#useIntake').hidden = session.role !== 'player' || !sessionStorage.getItem('impactIntakeDraft'); } catch { /* Optional handoff. */ }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    $('#loginSubmit').disabled = true;
    const data = profileValues(form);
    data.password = $('#loginPassword').value;
    const email = (data.email || '').toLowerCase();
    try {
      if (backend) {
        if (authMode === 'recover') { await backend.recover(email); setFeedback('#loginError', 'recoverySent'); return; }
        if (authMode === 'reset') {
          await backend.reset(data.password); await backend.logout();
          history.replaceState(null, '', '/portal'); setAuthMode('login'); setFeedback('#loginError', 'passwordChanged'); return;
        }
        const account = authMode === 'register' ? await backend.signup(data.name, email, data.password, registrationRole) : await backend.login(email, data.password);
        if (!account) { setFeedback('#loginError', 'checkEmail'); return; }
        state = await backend.load(account); enter(account); return;
      }
      if (!demo) return setFeedback('#loginError', 'portalUnavailable', true);
      const existing = [...demoAccounts, ...state.accounts].find(a => a.email === email);
      if (authMode === 'register') {
        if (existing) return setFeedback('#loginError', 'duplicate', true);
        const account = { id: crypto.randomUUID(), name: data.name, email, role: registrationRole, salt: crypto.randomUUID() };
        account.passwordHash = await passwordHash(data.password, account.salt);
        await persist({ ...state, accounts: [...state.accounts, account] });
        enter(account);
      } else {
        const matches = existing && (demoAccounts.includes(existing) ? data.password === 'impactdemo' : await passwordHash(data.password, existing.salt) === existing.passwordHash);
        if (!matches) return setFeedback('#loginError', 'invalidLogin', true);
        enter(existing);
      }
    } catch { setFeedback('#loginError', backend ? 'authFailed' : 'storageError', true); }
    finally { $('#loginSubmit').disabled = false; }
  });
  $('#logout').addEventListener('click', async () => {
    try { if (backend) await backend.logout(); }
    catch { setFeedback('#loginError', 'authFailed', true); return; }
    sessionStorage.removeItem(SESSION);
    session = null;
    $('#portalApp').hidden = true;
    $('#authSection').hidden = false;
    $('#loginForm').reset();
    $('#profileDialog').close();
    setAuthMode('login');
    if (backend) state = { accounts: [], profiles: [], coaches: {}, favorites: {} };
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
  $('#forgotPassword').addEventListener('click', () => setAuthMode('recover'));
  document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
    registrationRole = b.dataset.role;
    document.querySelectorAll('[data-role]').forEach(tab => { tab.classList.toggle('active', tab === b); tab.setAttribute('aria-pressed', String(tab === b)); });
  }));
  $('#sideMenu').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) setView(button.dataset.view); });

  async function savePlayer(publish = false) {
    if (session?.role !== 'player') return false;
    const form = $('#profileForm');
    if (publish && !form.reportValidity()) return false;
    if (publish && !$('#publishConsent').checked) { setFeedback('#playerStatus', 'visibility', true); return false; }
    const data = profileValues(form);
    if (data.video && !safeURL(data.video)) { setFeedback('#playerStatus', 'invalidUrl', true); return false; }
    if (backend && data.video && new URL(data.video).protocol !== 'https:') { setFeedback('#playerStatus', 'invalidUrl', true); return false; }
    let profile = Profiles.saveDraft(ownProfile(), data);
    const buttons = [...form.querySelectorAll('#saveDraft, button[type=submit], #unpublish')];
    buttons.forEach(b => b.disabled = true);
    $('#playerStatus').textContent = '';
    try {
      if (publish) profile = Profiles.publish(profile);
      await persist({ ...state, profiles: [...state.profiles.filter(p => p.id !== profile.id), profile] });
      $('#unpublish').hidden = !profile.published;
      setFeedback('#playerStatus', publish ? 'profilePublished' : 'draftSaved');
      return true;
    } catch { setFeedback('#playerStatus', 'storageError', true); return false; }
    finally { buttons.forEach(b => b.disabled = false); }
  }
  $('#saveDraft').addEventListener('click', () => savePlayer());
  $('#profileForm').addEventListener('submit', event => { event.preventDefault(); savePlayer(true); });
  $('#unpublish').addEventListener('click', async () => {
    try {
      const profile = Profiles.withdraw(ownProfile());
      await persist({ ...state, profiles: state.profiles.map(p => p.id === profile.id ? profile : p) });
      $('#publishConsent').checked = false;
      $('#unpublish').hidden = true;
      setFeedback('#playerStatus', 'profilePrivate');
    } catch { setFeedback('#playerStatus', 'storageError', true); }
  });

  // Video blobs stay in IndexedDB; localStorage only holds profile metadata.
  let mediaDB;
  function openMediaDB() {
    if (!mediaDB) mediaDB = new Promise((resolve, reject) => {
      const request = indexedDB.open('impactPortalMedia', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('videos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return mediaDB;
  }
  async function mediaOperation(id, method, value) {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('videos', method === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('videos');
      const request = method === 'put' ? store.put(value, id) : store[method](id);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function storeVideo(id, file) {
    if (!['video/mp4', 'video/webm'].includes(file.type) || file.size > 50 * 1024 * 1024 || !file.size) throw new Error('invalidVideo');
    const key = `${id}/${crypto.randomUUID()}`;
    await mediaOperation(key, 'put', file);
    return { key, name: file.name, type: file.type, size: file.size };
  }
  function embedURL(value) {
    try {
      const url = new URL(value);
      const host = url.hostname;
      let id;
      if (host === 'youtu.be') id = url.pathname.slice(1);
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) id = url.searchParams.get('v') || url.pathname.split('/')[2];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id || '')) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (['vimeo.com', 'www.vimeo.com'].includes(host) && /^\/\d+$/.test(url.pathname)) return `https://player.vimeo.com/video${url.pathname}`;
    } catch { /* Non-embeddable links remain external links. */ }
    return '';
  }
  async function renderMedia(container, profile, editable = false) {
    if (mediaURLs.has(container)) { URL.revokeObjectURL(mediaURLs.get(container)); mediaURLs.delete(container); }
    const token = crypto.randomUUID();
    container.dataset.renderToken = token;
    container.replaceChildren();
    if (profile.media) {
      try {
        const file = await mediaOperation(profile.media.key || profile.id, 'get');
        if (container.dataset.renderToken !== token) return;
        if (file) {
          const url = URL.createObjectURL(file);
          mediaURLs.set(container, url);
          const video = document.createElement('video'); video.className = 'video'; video.controls = true; video.preload = 'metadata'; video.src = url;
          container.append(video);
          const caption = document.createElement('p'); caption.className = 'media-name'; caption.textContent = profile.media.name; container.append(caption);
          if (editable) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-light'; button.textContent = t('removeVideo');
            button.addEventListener('click', async () => {
              try {
                // Keep immutable blobs referenced by an existing published snapshot.
                const updated = { ...state.profiles.find(p => p.id === profile.id), media: null };
                await persist({ ...state, profiles: state.profiles.map(p => p.id === updated.id ? updated : p) });
                renderMedia(container, updated, true);
              } catch { setFeedback(session.role === 'admin' ? '#adminStatus' : '#playerStatus', 'storageError', true); }
            });
            container.append(button);
          }
        }
      } catch { container.textContent = t('storageError'); }
    }
    const link = safeURL(profile.video);
    if (link) {
      const embed = embedURL(link);
      if (embed) { const frame = document.createElement('iframe'); frame.className = 'video-embed'; frame.src = embed; frame.title = t('highlights'); frame.loading = 'lazy'; frame.allowFullscreen = true; container.append(frame); }
      const anchor = document.createElement('a'); anchor.href = link; anchor.target = '_blank'; anchor.rel = 'noopener'; anchor.className = 'btn btn-light'; anchor.textContent = t('openVideo'); container.append(anchor);
    }
    if (!container.childElementCount) container.textContent = t('noVideo');
  }
  $('#playerVideo').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file || !(await savePlayer())) return;
    try {
      const media = await storeVideo(session.id, file);
      const profile = { ...ownProfile(), media };
      await persist({ ...state, profiles: state.profiles.map(p => p.id === session.id ? profile : p) });
      await renderMedia($('#playerMedia'), profile, true);
      setFeedback('#playerStatus', 'videoSaved');
    } catch (error) { setFeedback('#playerStatus', error.message === 'invalidVideo' ? 'invalidVideo' : 'storageError', true); }
    event.target.value = '';
  });
  $('#profileForm [name=video]').addEventListener('change', () => renderMedia($('#playerMedia'), { ...ownProfile(), video: $('#profileForm [name=video]').value }, true));

  function profileMarkup(profile, internal = false) {
    const labels = [['sport', 'sport'], ['position', 'position'], ['goal', 'goal'], ['major', 'major'], ['university', 'university'], ['graduation', 'graduation'], ['school', 'school'], ['gpa', 'gpa'], ['academic', 'academicStatus'], ['english', 'english'], ['countries', 'countries'], ['club', 'club']];
    if (internal) labels.push(['budget', 'budget']);
    const initials = (profile.name || 'Impact').split(/\s+/).slice(0, 2).map(v => v[0]).join('').toUpperCase();
    return `<div class="profile-heading"><div class="avatar">${escape(initials)}</div><div><h2>${escape(profile.name)}</h2><span class="badge">${escape(t(profile.sample ? 'sample' : profile.published ? 'published' : 'draft'))}</span></div></div>
      <dl class="profile-data">${labels.filter(([key]) => profile[key]).map(([key, label]) => `<div><dt>${escape(t(label))}</dt><dd>${escape(pretty(profile[key]))}</dd></div>`).join('')}</dl>
      <p class="profile-bio">${escape(profile.bio)}</p><div class="profile-video"></div>`;
  }
  function openProfile(profile) {
    if (!session) return;
    dialogProfile = profile;
    editingProfile = null;
    const container = $('#dialogContent');
    container.innerHTML = profileMarkup(profile, session.role === 'admin' || profile.id === session.id);
    const actions = document.createElement('div'); actions.className = 'actions';
    if (profile.published) {
      const link = document.createElement('a'); link.className = 'btn btn-light'; link.href = `/portal?perfil=${encodeURIComponent(profile.id)}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = t('previewPage'); actions.append(link);
    }
    const download = document.createElement('button'); download.type = 'button'; download.className = 'btn btn-primary'; download.textContent = t('exportProfile'); download.addEventListener('click', () => exportProfile(profile)); actions.append(download);
    container.append(actions);
    $('#profileDialog').showModal();
    renderMedia(container.querySelector('.profile-video'), profile);
  }
  $('#previewProfile').addEventListener('click', () => openProfile({ ...ownProfile(), ...profileValues($('#profileForm')) }));
  $('#closeDialog').addEventListener('click', () => $('#profileDialog').close());
  $('#profileDialog').addEventListener('close', () => {
    if ($('#profileDialog').open) return;
    $('#dialogContent').querySelectorAll('video').forEach(v => v.pause());
    $('#dialogContent').replaceChildren();
    dialogProfile = null;
    editingProfile = null;
    lastFeedback.delete('#editStatus');
  });
  function downloadFile(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportProfile(profile) {
    const video = safeURL(profile.video);
    const html = `<!doctype html><html lang="${UI.language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(profile.name)} | Impact Global Agency</title><style>body{font:16px/1.6 system-ui;color:#15243a;max-width:900px;margin:40px auto;padding:24px}h2{color:#0d1b3d}.profile-heading{display:flex;gap:18px;align-items:center}.avatar{font-size:24px}.profile-data{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}dt{color:#627184}dd{margin:0}.profile-bio{white-space:pre-wrap}</style><body><p>Impact Global Agency</p>${profileMarkup(profile)}${video ? `<p><a href="${escape(video)}">${escape(t('openVideo'))}</a></p>` : ''}</body></html>`;
    downloadFile(html, `impact-perfil-${profile.id}.html`, 'text/html;charset=utf-8');
  }
  function refreshFilterOptions() {
    const pool = state.profiles.map(Profiles.discovery).filter(Boolean);
    for (const [selector, key] of [['#sportFilter', 'sport'], ['#yearFilter', 'graduation'], ['#majorFilter', 'major']]) {
      const select = $(selector); const old = select.value;
      select.innerHTML = option('', t('all')) + [...new Set(pool.map(p => p[key]).filter(Boolean))].sort().map(v => option(v, v, v === old)).join('');
    }
  }
  function filteredCandidates() {
    const f = profileValues($('#candidateFilters'));
    const favorites = state.favorites[session.id] || [];
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return state.profiles.map(Profiles.discovery).filter(p => p && (currentView !== 'saved' || favorites.includes(p.id)) && (!f.sport || p.sport === f.sport) && (!f.goal || p.goal === f.goal) && (!f.major || p.major === f.major) && (!f.graduation || p.graduation === f.graduation) && (!f.english || p.english === f.english) && normalize(`${p.name} ${p.sport} ${p.major}`).includes(normalize(f.search)));
  }
  function renderCandidates() {
    $('#coachHeading').textContent = t(currentView === 'saved' ? 'saved' : 'candidates');
    const profiles = filteredCandidates();
    $('#candidateCount').textContent = `${profiles.length} · ${t('candidates')}`;
    const favorites = state.favorites[session.id] || [];
    $('#candidateList').innerHTML = profiles.length ? profiles.map(p => {
      const existing = (state.interests || []).find(i => i.student_id === p.id && i.coach_id === session.id);
      return `<article class="candidate"><div><h3>${escape(p.name)}</h3><p>${escape([pretty(p.goal), p.sport, p.position, p.major, p.graduation].filter(Boolean).join(' · '))}</p>${p.sample ? `<span class="badge">${escape(t('sample'))}</span>` : ''}</div><div class="actions"><button class="btn btn-light" type="button" data-profile="${escape(p.id)}">${escape(t('view'))}</button><button class="btn btn-light" type="button" data-favorite="${escape(p.id)}" aria-pressed="${favorites.includes(p.id)}">${escape(t(favorites.includes(p.id) ? 'removeSaved' : 'save'))}</button>${backend ? `<button class="btn btn-primary" type="button" data-interest="${escape(p.id)}"${existing ? ' disabled' : ''}>${escape(t(existing ? 'interestSent' : 'expressInterest'))}</button>` : ''}</div></article>`;
    }).join('') : `<p class="empty">${escape(t('empty'))}</p>`;
  }
  $('#candidateFilters').addEventListener('submit', event => event.preventDefault());
  $('#candidateFilters').addEventListener('input', renderCandidates);
  $('#candidateFilters').addEventListener('reset', () => setTimeout(renderCandidates, 0));
  $('#candidateList').addEventListener('click', async event => {
    const interest = event.target.closest('[data-interest]');
    if (interest) {
      interest.disabled = true;
      if (await connectionAction(() => backend.expressInterest(interest.dataset.interest, ''))) setView('connections');
      else { interest.disabled = false; setView('connections'); }
      return;
    }
    const profile = event.target.closest('[data-profile]');
    if (profile) openProfile(Profiles.discovery(state.profiles.find(p => p.id === profile.dataset.profile)));
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      const id = favorite.dataset.favorite; const list = state.favorites[session.id] || [];
      try { await persist({ ...state, favorites: { ...state.favorites, [session.id]: list.includes(id) ? list.filter(v => v !== id) : [...list, id] } }); renderCandidates(); }
      catch { $('#candidateCount').textContent = t('storageError'); }
    }
  });
  $('#coachForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { await persist({ ...state, coaches: { ...state.coaches, [session.id]: profileValues(event.currentTarget) } }); setFeedback('#coachStatus', 'draftSaved'); }
    catch { setFeedback('#coachStatus', 'storageError', true); }
  });
  function renderCatalog(preserveSelection = false) {
    const catalog = state.catalog || [];
    const available = Boolean(backend && catalog.length);
    $('#preferredUniversityField').hidden = !available;
    $('#coachUniversityField').hidden = !available;
    const preferences = new Set(($('#profileForm [name=university]').value || '').split(/\s*;\s*/));
    const label = university => `${university.name}${university.is_sample ? ` · ${t('sampleInstitution')}` : ` · ${t(university.verification_status)}`}`;
    $('#preferredUniversities').innerHTML = catalog.map(u => option(u.id, label(u), preferences.has(u.name))).join('');
    const coach = state.coaches[session?.id] || {};
    const selected = preserveSelection ? $('#coachUniversity').value : coach.university_id || '';
    $('#coachUniversity').innerHTML = option('', t('choose')) + catalog.map(u => option(u.id, label(u), u.id === selected)).join('');
  }
  $('#preferredUniversities').addEventListener('change', () => {
    const names = [...$('#preferredUniversities').selectedOptions].map(o => (state.catalog || []).find(u => u.id === o.value)?.name).filter(Boolean);
    $('#profileForm [name=university]').value = names.join('; ');
  });
  $('#playerFields').addEventListener('input', event => {
    if (event.target.name !== 'university') return;
    const names = new Set(event.target.value.split(/\s*;\s*/));
    for (const item of $('#preferredUniversities').options) item.selected = names.has((state.catalog || []).find(u => u.id === item.value)?.name);
  });
  $('#coachUniversity').addEventListener('change', () => {
    const university = (state.catalog || []).find(u => u.id === $('#coachUniversity').value);
    if (university) $('#coachForm [name=institution]').value = university.name;
  });
  function meetingTime(value) {
    const locale = { es: 'es-AR', en: 'en-US', fr: 'fr-FR', it: 'it-IT' }[UI.language] || 'en-US';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
  function renderConnections() {
    if (!session) return;
    const interests = state.interests || [];
    const meetings = state.meetings || [];
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $('#connectionsMode').textContent = backend ? t('connectionsPrivacy') : t('sharedConnectionsRequired');
    $('#refreshConnections').disabled = !backend || connectionBusy;
    $('#interestList').innerHTML = interests.length ? interests.map(interest => {
      const studentCanRespond = session.role === 'player' && interest.student_id === ownProfile().id && interest.status === 'pending';
      const heading = session.role === 'player' ? interest.coach_name : session.role === 'admin' ? `${interest.student_name} ↔ ${interest.coach_name}` : interest.student_name;
      return `<article class="connection-card" data-interest-id="${escape(interest.id)}"><div class="connection-card-head"><h4>${escape(heading)}</h4><span class="status-pill">${escape(t(`interest_${interest.status}`))}</span></div><p class="hint">${escape(interest.institution_name || '')}</p>${interest.message ? `<p class="connection-message">${escape(interest.message)}</p>` : ''}<div class="actions">${studentCanRespond ? `<button type="button" class="btn btn-primary" data-interest-response="accepted" data-id="${escape(interest.id)}">${escape(t('acceptInterest'))}</button><button type="button" class="btn btn-light" data-interest-response="declined" data-id="${escape(interest.id)}">${escape(t('decline'))}</button>` : ''}${interest.status === 'accepted' && session.role !== 'admin' ? `<button type="button" class="btn btn-light" data-plan-interest="${escape(interest.id)}">${escape(t('proposeMeeting'))}</button>` : ''}</div></article>`;
    }).join('') : `<p class="empty">${escape(t('noInterests'))}</p>`;
    $('#meetingList').innerHTML = meetings.length ? meetings.map(meeting => {
      const interest = interests.find(i => i.id === meeting.interest_id);
      const canRespond = session.role !== 'admin' && meeting.proposed_by !== session.id && meeting.status === 'proposed';
      const canReschedule = session.role !== 'admin' && meeting.proposed_by !== session.id && meeting.status === 'accepted';
      const active = ['proposed','accepted'].includes(meeting.status);
      const buttons = canRespond ? [['accepted','acceptMeeting'],['declined','decline'],['reschedule_requested','requestReschedule']] : canReschedule ? [['reschedule_requested','requestReschedule']] : [];
      if (active) buttons.push(['cancelled','cancelMeeting']);
      return `<article class="connection-card" data-meeting-id="${escape(meeting.id)}"><div class="connection-card-head"><h4>${escape(interest ? `${interest.student_name} · ${interest.coach_name}` : t('meeting'))}</h4><span class="status-pill">${escape(t(`meeting_${meeting.status}`))}</span></div><p class="meeting-time" data-starts-at="${escape(meeting.starts_at)}">${escape(meetingTime(meeting.starts_at))}</p><p class="hint">${escape(zone)} · ${escape(meeting.duration_minutes)} ${escape(t('minutes'))}<br>${escape(t('proposedTimeZone'))}: ${escape(meeting.timezone)}</p>${meeting.message ? `<p class="connection-message">${escape(meeting.message)}</p>` : ''}<div class="actions">${buttons.map(([response,key]) => `<button type="button" class="btn ${response === 'accepted' ? 'btn-primary' : 'btn-light'}" data-meeting-response="${response}" data-id="${escape(meeting.id)}">${escape(t(key))}</button>`).join('')}</div></article>`;
    }).join('') : `<p class="empty">${escape(t('noMeetings'))}</p>`;
    const form = $('#meetingProposalForm');
    const selected = form.elements.interest_id.value;
    const accepted = interests.filter(i => i.status === 'accepted' && !meetings.some(m => m.interest_id === i.id && ['proposed','accepted'].includes(m.status)));
    $('#meetingProposalSection').hidden = !backend || session.role === 'admin' || !accepted.length;
    form.elements.interest_id.innerHTML = option('', t('choose')) + accepted.map(i => option(i.id, `${i.student_name} · ${i.coach_name}`, i.id === selected)).join('');
    form.elements.timezone.value = zone;
  }
  async function connectionAction(operation) {
    if (!backend || !session) { setFeedback('#connectionsStatus','sharedConnectionsRequired',true); return false; }
    if (connectionBusy) return false;
    connectionBusy = true;
    $('#connectionsStatus').textContent = '';
    $('#connectionsPanel').querySelectorAll('button').forEach(button => button.disabled = true);
    try {
      await operation();
      state = await backend.load(session);
      renderSidebar(); renderConnections();
      if (currentView === 'coach' || currentView === 'saved') renderCandidates();
      setFeedback('#connectionsStatus','connectionSaved');
      return true;
    } catch { setFeedback('#connectionsStatus','connectionFailed',true); return false; }
    finally { connectionBusy = false; $('#connectionsPanel').querySelectorAll('button').forEach(button => button.disabled = false); }
  }
  $('#refreshConnections').addEventListener('click', () => connectionAction(async () => {}));
  $('#interestList').addEventListener('click', async event => {
    const response = event.target.closest('[data-interest-response]');
    if (response) await connectionAction(() => backend.respondInterest(response.dataset.id, response.dataset.interestResponse));
    const proposal = event.target.closest('[data-plan-interest]');
    if (proposal) { $('#meetingProposalForm').elements.interest_id.value = proposal.dataset.planInterest; $('#meetingProposalSection').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#meetingProposalForm').elements.starts_at.focus(); }
  });
  $('#meetingList').addEventListener('click', async event => {
    const response = event.target.closest('[data-meeting-response]');
    if (response) await connectionAction(() => backend.respondMeeting(response.dataset.id, response.dataset.meetingResponse));
  });
  $('#meetingProposalForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = profileValues(form);
    let proposal;
    try { proposal = Profiles.meetingProposal(values); }
    catch { setFeedback('#connectionsStatus','meetingInvalid',true); return; }
    if (await connectionAction(() => backend.proposeMeeting(values.interest_id, proposal))) { form.reset(); renderConnections(); }
  });
  function csv(profiles, internal) {
    const keys = ['name', 'sport', 'position', 'graduation', 'major', 'english', 'academic', 'video'];
    if (internal) keys.push('budget', 'status', 'responsible');
    // Prevent user-entered values from becoming formulas in spreadsheet apps.
    const quote = value => {
      let cell = String(value ?? '');
      if (/^\s*[=+@-]/.test(cell)) cell = "'" + cell;
      return `"${cell.replaceAll('"', '""')}"`;
    };
    return '\uFEFF' + [keys.map(t), ...profiles.map(p => keys.map(key => pretty(p[key])))].map(row => row.map(quote).join(',')).join('\r\n');
  }
  $('#exportCandidates').addEventListener('click', () => downloadFile(csv(filteredCandidates(), false), 'impact-candidatos.csv', 'text/csv;charset=utf-8'));
  $('#exportAdmin').addEventListener('click', () => downloadFile(csv(state.profiles, true), 'impact-perfiles.csv', 'text/csv;charset=utf-8'));
  function renderAdmin() {
    const profiles = state.profiles;
    const values = [[profiles.length, 'totalProfiles'], [profiles.filter(p => p.published).length, 'publishedProfiles'], [profiles.filter(p => !p.video && !p.media).length, 'pendingVideos'], [profiles.filter(p => p.status === 'ready').length, 'readyProfiles']];
    $('#adminStats').innerHTML = values.map(([n, label]) => `<div class="stat"><b>${n}</b><span>${escape(t(label))}</span></div>`).join('');
    $('#adminList').innerHTML = profiles.map(p => `<tr><td>${escape(p.name)}${p.sample ? `<br><span class="badge">${escape(t('sample'))}</span>` : ''}</td><td>${escape(p.sport)}</td><td>${escape(t(p.status || 'review'))}<br><span class="hint">${escape(t(p.published ? 'published' : 'draft'))}</span></td><td><div class="actions"><button class="btn btn-light" data-profile="${escape(p.id)}" type="button">${escape(t('view'))}</button><button class="btn btn-light" data-edit="${escape(p.id)}" type="button">${escape(t('editProfile'))}</button></div></td></tr>`).join('');
    const selected = $('#adminProfile').value;
    $('#adminProfile').innerHTML = profiles.map(p => option(p.id, p.name, p.id === selected)).join('');
    const stage = $('#adminResourceForm [name=status]');
    stage.innerHTML = Profiles.stages.map(s => option(s, t(s))).join('');
    if (backend) $('#adminResourceForm [name=responsible]').innerHTML = option('', t('choose')) + state.staff.filter(s => s.active).map(s => option(s.id, s.name)).join('');
    else for (const member of state.staff || []) if (![...$('#adminResourceForm [name=responsible]').options].some(o => o.value === member.id)) $('#adminResourceForm [name=responsible]').add(new Option(member.name, member.id));
    fillAdminResource();
    renderResearch();
  }
  function fillAdminResource() {
    const profile = state.profiles.find(p => p.id === $('#adminProfile').value);
    if (!profile) return;
    fillForm($('#adminResourceForm'), { video: profile.video || '', status: profile.status || 'new', responsible: profile.responsible || '', notes: profile.notes || '', nextAction: profile.nextAction || '' });
    $('#adminWithdraw').hidden = !profile.published;
    $('#pipelineHistory').innerHTML = (profile.history || []).map(h => `<li>${escape(h.at?.slice(0,19))} · ${escape(t(h.from || 'new'))} → ${escape(t(h.to))}${h.notes ? ` · ${escape(h.notes)}` : ''}</li>`).join('');
    $('#adminVideoFile').value = '';
    renderMedia($('#adminMedia'), profile, true);
  }
  $('#adminProfile').addEventListener('change', fillAdminResource);
  function openAdminEditor(profile) {
    if (session?.role !== 'admin') return;
    editingProfile = profile || { id: crypto.randomUUID(), published: false, status: 'new' };
    dialogProfile = null;
    const container = $('#dialogContent');
    container.innerHTML = `<h3>${escape(t(profile ? 'editProfile' : 'createProfile'))}</h3><form id="adminEditForm"><div class="form-grid" id="adminEditFields"></div><label class="checkbox"><input name="published" type="checkbox"${editingProfile._publishChanges ? ' checked' : ''}><span>${escape(t('publishLatest'))}</span></label><button type="submit" class="btn btn-primary">${escape(t('saveResource'))}</button><p class="feedback" id="editStatus" role="status"></p></form>`;
    drawPlayerFields(editingProfile, $('#adminEditFields'));
    $('#adminEditForm').addEventListener('submit', async event => {
      event.preventDefault();
      let profile = Profiles.saveDraft(editingProfile, profileValues(event.currentTarget));
      try {
        if (event.currentTarget.elements.published.checked) profile = Profiles.publish(profile);
        await persist({ ...state, profiles: [...state.profiles.filter(p => p.id !== profile.id), profile] });
        $('#profileDialog').close(); renderAdmin(); setFeedback('#adminStatus', 'profileSaved');
      } catch { setFeedback('#editStatus', 'storageError', true); }
    });
    $('#profileDialog').showModal();
  }
  $('#createAdminProfile').addEventListener('click', () => openAdminEditor());
  $('#adminWithdraw').addEventListener('click', async () => {
    if (session?.role !== 'admin') return;
    const profile = state.profiles.find(p => p.id === $('#adminProfile').value);
    if (!profile) return;
    try { await persist({ ...state, profiles: state.profiles.map(p => p.id === profile.id ? Profiles.withdraw(p) : p) }); renderAdmin(); setFeedback('#adminStatus','profilePrivate'); }
    catch { setFeedback('#adminStatus','storageError',true); }
  });
  $('#adminList').addEventListener('click', event => {
    const button = event.target.closest('[data-profile]'); if (button) openProfile(state.profiles.find(p => p.id === button.dataset.profile));
    const edit = event.target.closest('[data-edit]'); if (edit) openAdminEditor(state.profiles.find(p => p.id === edit.dataset.edit));
  });
  $('#adminResourceForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (session?.role !== 'admin') return;
    const data = profileValues(event.currentTarget);
    if (data.video && !safeURL(data.video)) return setFeedback('#adminStatus', 'invalidUrl', true);
    const profile = state.profiles.find(p => p.id === data.profileId);
    const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const file = $('#adminVideoFile').files[0];
      const media = file ? await storeVideo(profile.id, file) : profile.media;
      const updated = Profiles.updateCase({ ...profile, video: data.video, media }, { status: data.status, responsible: data.responsible, notes: data.notes, nextAction: data.nextAction }, session);
      await persist({ ...state, profiles: state.profiles.map(p => p.id === profile.id ? updated : p) });
      renderAdmin(); setFeedback('#adminStatus', 'resourceSaved');
    } catch (error) { setFeedback('#adminStatus', error.message === 'invalidVideo' ? 'invalidVideo' : 'storageError', true); }
    finally { button.disabled = false; }
  });
  const researchTables = {
    universities: { label: 'universities', fields: [['name','name','text',true],['location','location'],['programs','programs'],['sports','sports'],['athletic_level','athleticLevel'],['website','website','url']] },
    contacts: { label: 'contacts', table: 'university_contacts', fields: [['university_id','universities','university',true],['name','name','text',true],['role','coach'],['email','email','email'],['phone','WhatsApp']] },
    opportunities: { label: 'opportunities', table: 'recruitment_opportunities', fields: [['student_id','player','student',true],['university_id','universities','university',true],['contact_id','contacts','contact'],['title','opportunity','text',true],['due_at','nextAction','date']] },
    staff: { label: 'staff', table: 'staff_members', fields: [['name','name','text',true]] }
  };
  function renderResearch() {
    if (!$('#researchForms').childElementCount) {
      const sourceFields = [['notes','internalNotes','textarea'],['source_url','sourceUrl','url'],['source_name','sourceName'],['verification_status','verificationStatus','verification'],['last_verified_at','lastVerified','date']];
      $('#researchForms').innerHTML = Object.entries(researchTables).map(([key,def]) => `<details><summary data-ui="${def.label}"></summary><form data-research="${key}"><input type="hidden" name="id"><div class="form-grid">${[...def.fields,...(key==='staff'?[]:sourceFields)].map(([name,label,type='text',required=false]) => `<label><span data-ui="${label}">${escape(label)}</span>${['university','student','contact','verification'].includes(type)?`<select name="${name}" data-options="${type}"${required?' required':''}></select>`:type==='textarea'?`<textarea name="${name}" maxlength="10000"></textarea>`:`<input name="${name}" type="${type}"${required?' required':''} maxlength="2000">`}</label>`).join('')}</div><button class="btn btn-light" type="submit" data-ui="saveResource"></button></form></details>`).join('');
    }
    for (const select of $('#researchForms').querySelectorAll('select')) {
      const selected = select.value;
      const pool = select.dataset.options === 'university' ? state.universities : select.dataset.options === 'student' ? state.profiles : select.dataset.options === 'contact' ? state.contacts : ['unverified','ai-assisted','human-reviewed','verified'].map(id => ({id,name:t(id)}));
      select.innerHTML = (select.dataset.options === 'verification' ? '' : option('',t('choose'))) + (pool || []).map(r=>option(r.id,r.name||r.title,r.id===selected)).join('');
    }
    $('#researchRecords').innerHTML = Object.entries(researchTables).map(([key,def]) => `<h4>${escape(t(def.label))}</h4>${(state[key] || []).length ? state[key].map(row=>`<article class="research-record"><b>${escape(row.name||row.title)}</b> <span>${escape(t(row.verification_status||''))}</span>${row.last_verified_at?` · ${escape(row.last_verified_at.slice(0,10))}`:''}${safeURL(row.source_url)?` · <a href="${escape(safeURL(row.source_url))}" target="_blank" rel="noopener">${escape(row.source_name||t('sourceUrl'))}</a>`:''}<button type="button" class="btn btn-light" data-research-edit="${key}" data-id="${escape(row.id)}">${escape(t('editProfile'))}</button></article>`).join(''):`<p class="hint">${escape(t('noResearch'))}</p>`}`).join('');
    UI.translate($('#researchForms'));
  }
  $('#researchForms').addEventListener('submit', async event => {
    event.preventDefault();
    if(session?.role !== 'admin') return;
    const form = event.target, key = form.dataset.research, def = researchTables[key];
    const values = profileValues(form);
    const data = { ...values, id: values.id || crypto.randomUUID() };
    if (key === 'universities') for (const field of ['programs','sports']) data[field] = values[field].split(',').map(v=>v.trim()).filter(Boolean);
    if (key !== 'staff') {
      data.last_verified_at = values.last_verified_at ? `${values.last_verified_at}T00:00:00.000Z` : null;
      if (values.source_url && !values.source_url.startsWith('https://')) return setFeedback('#researchStatus','researchInvalid',true);
      if (['verified','human-reviewed'].includes(values.verification_status)) {
        if (!values.source_url || !data.last_verified_at || new Date(data.last_verified_at) > new Date()) return setFeedback('#researchStatus','researchInvalid',true);
        data.verified_by = session.id;
      } else { data.verified_by = null; data.last_verified_at = null; }
    }
    if (key === 'opportunities') {
      data.contact_id ||= null; data.due_at ||= null;
      if (data.contact_id && !state.contacts.some(c=>c.id===data.contact_id&&c.university_id===data.university_id)) return setFeedback('#researchStatus','researchInvalid',true);
    }
    try {
      if (backend) { await backend.saveResearch(def.table || key, data); state = await backend.load(session); }
      else await persist({ ...state, [key]: [...(state[key] || []).filter(r=>r.id!==data.id), data] });
      form.reset(); form.elements.id.value = ''; renderAdmin(); setFeedback('#researchStatus','researchSaved');
    } catch { setFeedback('#researchStatus','researchInvalid',true); }
  });
  $('#researchRecords').addEventListener('click', event => {
    const button = event.target.closest('[data-research-edit]');
    if (!button || session?.role !== 'admin') return;
    const key = button.dataset.researchEdit, row = state[key].find(r=>r.id===button.dataset.id);
    const data = { ...row };
    for (const field of ['programs','sports']) if (Array.isArray(data[field])) data[field] = data[field].join(', ');
    if (data.last_verified_at) data.last_verified_at = data.last_verified_at.slice(0,10);
    const form = $(`[data-research="${key}"]`); fillForm(form,data); form.closest('details').open = true; form.scrollIntoView({block:'center'});
  });
  $('#useIntake').addEventListener('click', () => {
    if (session?.role !== 'player') return;
    try {
      const answers = JSON.parse(sessionStorage.getItem('impactIntakeDraft'));
      if (!answers || typeof answers !== 'object') return;
      const current = profileValues($('#profileForm'));
      const safe = Object.fromEntries(Profiles.editableFields.filter(k=>typeof answers[k]==='string'&&!current[k]).map(k=>[k,answers[k].slice(0,2000)]));
      fillForm($('#profileForm'),safe); syncGoalFields(); sessionStorage.removeItem('impactIntakeDraft'); $('#useIntake').hidden = true; setFeedback('#playerStatus','intakeReady');
    } catch { setFeedback('#playerStatus','storageError',true); }
  });
  function applyLanguage(lang) {
    UI.translate(document, lang);
    document.documentElement.lang = UI.language;
    try { localStorage.setItem('impactLang', UI.language); } catch { /* Language changes also work without persistence. */ }
    lastFeedback.forEach(({ key, error }, selector) => setFeedback(selector, key, error));
    if (session && !publicId) {
      $('#accountRole').textContent = t(session.role);
      const draft = profileValues($('#profileForm'));
      drawPlayerFields(draft);
      renderCatalog(true);
      renderSidebar();
      if (currentView === 'coach' || currentView === 'saved') { refreshFilterOptions(); renderCandidates(); }
      if (currentView === 'admin') renderAdmin();
      if (currentView === 'connections') renderConnections();
      if (currentView === 'player') renderMedia($('#playerMedia'), { ...ownProfile(), video: $('#profileForm [name=video]').value }, true);
    }
    if (publicId) renderPublicProfile();
    if ($('#profileDialog').open) {
      const edited = editingProfile && { ...editingProfile, ...profileValues($('#adminEditForm')), published: editingProfile.published, _publishChanges: $('#adminEditForm').elements.published.checked };
      const viewed = dialogProfile;
      $('#profileDialog').close();
      if (edited) openAdminEditor(edited);
      else if (viewed) openProfile(viewed);
    }
  }
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => applyLanguage(button.dataset.lang)));
  function renderPublicProfile() {
    const stored = state.profiles.find(p => p.id === publicId);
    const profile = stored && Profiles.discovery(stored);
    const container = $('#publicProfileContent');
    container.innerHTML = profile ? profileMarkup(profile) : `<p class="empty">${escape(t('missingProfile'))}</p>`;
    if (profile) renderMedia(container.querySelector('.profile-video'), profile);
  }
  state = demo ? readState() : { accounts: [], profiles: [], coaches: {}, favorites: {} };
  let language = 'es';
  try { language = localStorage.getItem('impactLang') || 'es'; } catch { /* Use Spanish by default. */ }
  applyLanguage(language);
  function renderSuggestions() {
    const suggestions = backend ? state.suggestions || [] : (state.opportunities || []).filter(o=>o.student_id===session?.id&&['human-reviewed','verified'].includes(o.verification_status)).map(o=>(state.universities || []).find(u=>u.id===o.university_id&&['human-reviewed','verified'].includes(u.verification_status))).filter(Boolean);
    $('#suggestedUniversities').textContent = suggestions.map(u => `${u.name} · ${u.location} · ${t(u.verification_status)} · ${u.last_verified_at?.slice(0,10) || ''}`).join('\n') || t('noSuggestions');
  }
  async function initialize() {
    $('.demo-accounts').hidden = !demo;
    document.querySelectorAll('[data-ui]').forEach(el => { if (backend && cloudCopy[el.dataset.ui]) el.dataset.ui = cloudCopy[el.dataset.ui]; });
    document.querySelectorAll('.demo-note').forEach(el => { if (backend) el.dataset.ui = 'sharedWorkspace'; });
    $('#playerVideo').disabled = !demo;
    $('#adminVideoFile').disabled = !demo;
    $('#sharedMediaNote').hidden = demo;
    $('#adminSharedMediaNote').hidden = demo;
    setAuthMode('login'); UI.translate();
    if (!demo && !backend) {
      $('#loginSubmit').disabled = true; $('#forgotPassword').hidden = true;
      setFeedback('#loginError', 'portalUnavailable', true); return;
    }
    if (backend) {
      let recovering = false;
      backend.client.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
          recovering = true; $('#authSection').hidden = false; $('#portalApp').hidden = true; setAuthMode('reset');
        }
        if (event === 'SIGNED_OUT') { session = null; state = { accounts: [], profiles: [], coaches: {}, favorites: {} }; $('#profileDialog').close(); $('#portalApp').hidden = true; $('#authSection').hidden = false; }
      });
      try {
        const account = await backend.account();
        state = await backend.load(publicId ? null : account);
        if (recovering) return;
        if (publicId) { $('#authSection').hidden = true; $('#publicProfile').hidden = false; renderPublicProfile(); }
        else if (account) enter(account);
        else if (new URLSearchParams(location.search).has('reset') || location.hash.includes('error')) setFeedback('#loginError', 'recoveryInvalid', true);
      } catch { setFeedback('#loginError', 'backendUnavailable', true); }
    } else if (publicId) {
      $('#authSection').hidden = true; $('#publicProfile').hidden = false; renderPublicProfile();
    } else {
      try { const account = accountById(sessionStorage.getItem(SESSION)); if (account) enter(account); } catch { /* Demo only. */ }
    }
  }
  initialize();
})();
