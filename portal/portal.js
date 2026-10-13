(() => {
  const $ = selector => document.querySelector(selector);
  const UI = window.ImpactUI;
  const t = (key, values) => UI.t(key, values);
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
    ['sport', 'sport', 'text', true], ['position', 'position', 'text'],
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
      if (data && Array.isArray(data.accounts) && Array.isArray(data.profiles)) return data;
    } catch { /* Keep the demo usable when storage is unavailable. */ }
    return { accounts: [], profiles: structuredClone(seedProfiles), coaches: {}, favorites: {} };
  }
  function persist(next) {
    localStorage.setItem(STORE, JSON.stringify(next));
    state = next;
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
  function ownProfile() { return state.profiles.find(p => p.id === session?.id) || { id: session?.id, name: session?.name || '', status: 'review', published: false }; }
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
      else control = `<input ${attrs} type="${type}" value="${escape(data[name])}" ${type === 'number' ? (name === 'age' ? 'min="14" max="80"' : 'min="2000" max="2100"') : 'maxlength="200"'}>`;
      return `<label${type === 'textarea' ? ' class="full"' : ''}><span>${escape(t(label))}</span>${control}</label>`;
    }).join('');
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
    $('#passwordHelp').hidden = mode !== 'register';
    $('#loginPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#loginSubmit').dataset.ui = mode === 'register' ? 'register' : 'login';
    $('#loginError').hidden = true;
    lastFeedback.delete('#loginError');
    document.querySelectorAll('[data-auth]').forEach(b => { b.classList.toggle('active', b.dataset.auth === mode); b.setAttribute('aria-pressed', String(b.dataset.auth === mode)); });
    UI.translate();
  }
  function allowedViews() {
    return session.role === 'admin' ? ['admin'] : session.role === 'coach' ? ['coach', 'saved', 'coachProfile'] : ['player'];
  }
  function renderSidebar() {
    const labels = { admin: 'profiles', player: 'myProfile', coach: 'candidates', saved: 'saved', coachProfile: 'coachProfile' };
    $('#sideMenu').innerHTML = allowedViews().map(view => `<button type="button" data-view="${view}" class="${view === currentView ? 'active' : ''}">${escape(t(labels[view]))}</button>`).join('');
  }
  function setView(view) {
    if (!session || !allowedViews().includes(view)) return;
    currentView = view;
    for (const name of ['admin', 'player', 'coach', 'coachProfile']) $(`#${name}Panel`).hidden = name !== (view === 'saved' ? 'coach' : view);
    renderSidebar();
    if (view === 'coach' || view === 'saved') { refreshFilterOptions(); renderCandidates(); }
    if (view === 'admin') renderAdmin();
  }
  function enter(account) {
    session = account;
    sessionStorage.setItem(SESSION, account.id);
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
    setView(allowedViews()[0]);
    renderMedia($('#playerMedia'), data, true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    $('#loginSubmit').disabled = true;
    const data = profileValues(form);
    data.password = $('#loginPassword').value;
    const email = data.email.toLowerCase();
    try {
      const existing = [...demoAccounts, ...state.accounts].find(a => a.email === email);
      if (authMode === 'register') {
        if (existing) return setFeedback('#loginError', 'duplicate', true);
        const account = { id: crypto.randomUUID(), name: data.name, email, role: registrationRole, salt: crypto.randomUUID() };
        account.passwordHash = await passwordHash(data.password, account.salt);
        persist({ ...state, accounts: [...state.accounts, account] });
        enter(account);
      } else {
        const matches = existing && (demoAccounts.includes(existing) ? data.password === 'impactdemo' : await passwordHash(data.password, existing.salt) === existing.passwordHash);
        if (!matches) return setFeedback('#loginError', 'invalidLogin', true);
        enter(existing);
      }
    } catch { setFeedback('#loginError', 'storageError', true); }
    finally { $('#loginSubmit').disabled = false; }
  });
  $('#logout').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION);
    session = null;
    $('#portalApp').hidden = true;
    $('#authSection').hidden = false;
    $('#loginForm').reset();
    $('#profileDialog').close();
    setAuthMode('login');
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
  document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
    registrationRole = b.dataset.role;
    document.querySelectorAll('[data-role]').forEach(tab => { tab.classList.toggle('active', tab === b); tab.setAttribute('aria-pressed', String(tab === b)); });
  }));
  $('#sideMenu').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) setView(button.dataset.view); });

  function savePlayer(publish = false) {
    if (session?.role !== 'player') return false;
    const form = $('#profileForm');
    if (publish && !form.reportValidity()) return false;
    if (publish && !$('#publishConsent').checked) { setFeedback('#playerStatus', 'visibility', true); return false; }
    const data = profileValues(form);
    if (data.video && !safeURL(data.video)) { setFeedback('#playerStatus', 'invalidUrl', true); return false; }
    const profile = { ...ownProfile(), ...data, published: publish || Boolean(ownProfile().published), status: 'review', updatedAt: new Date().toISOString() };
    try {
      persist({ ...state, profiles: [...state.profiles.filter(p => p.id !== session.id), profile] });
      $('#unpublish').hidden = !profile.published;
      setFeedback('#playerStatus', publish ? 'profilePublished' : 'draftSaved');
      return true;
    } catch { setFeedback('#playerStatus', 'storageError', true); return false; }
  }
  $('#saveDraft').addEventListener('click', () => savePlayer());
  $('#profileForm').addEventListener('submit', event => { event.preventDefault(); savePlayer(true); });
  $('#unpublish').addEventListener('click', () => {
    try {
      const profile = { ...ownProfile(), published: false, updatedAt: new Date().toISOString() };
      persist({ ...state, profiles: state.profiles.map(p => p.id === profile.id ? profile : p) });
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
    await mediaOperation(id, 'put', file);
    return { name: file.name, type: file.type, size: file.size };
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
        const file = await mediaOperation(profile.id, 'get');
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
                await mediaOperation(profile.id, 'delete');
                const updated = { ...state.profiles.find(p => p.id === profile.id), media: null };
                persist({ ...state, profiles: state.profiles.map(p => p.id === updated.id ? updated : p) });
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
    if (!file || !savePlayer()) return;
    try {
      const media = await storeVideo(session.id, file);
      const profile = { ...ownProfile(), media };
      persist({ ...state, profiles: state.profiles.map(p => p.id === session.id ? profile : p) });
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
    const pool = state.profiles.filter(p => p.published);
    for (const [selector, key] of [['#sportFilter', 'sport'], ['#yearFilter', 'graduation']]) {
      const select = $(selector); const old = select.value;
      select.innerHTML = option('', t('all')) + [...new Set(pool.map(p => p[key]).filter(Boolean))].sort().map(v => option(v, v, v === old)).join('');
    }
  }
  function filteredCandidates() {
    const f = profileValues($('#candidateFilters'));
    const favorites = state.favorites[session.id] || [];
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return state.profiles.filter(p => p.published && (currentView !== 'saved' || favorites.includes(p.id)) && (!f.sport || p.sport === f.sport) && (!f.graduation || p.graduation === f.graduation) && (!f.english || p.english === f.english) && (!f.budget || p.budget === f.budget) && normalize(`${p.name} ${p.sport} ${p.major}`).includes(normalize(f.search)));
  }
  function renderCandidates() {
    $('#coachHeading').textContent = t(currentView === 'saved' ? 'saved' : 'candidates');
    const profiles = filteredCandidates();
    $('#candidateCount').textContent = `${profiles.length} · ${t('candidates')}`;
    const favorites = state.favorites[session.id] || [];
    $('#candidateList').innerHTML = profiles.length ? profiles.map(p => `<article class="candidate"><div><h3>${escape(p.name)}</h3><p>${escape([p.sport, p.position, p.major, p.graduation].filter(Boolean).join(' · '))}</p>${p.sample ? `<span class="badge">${escape(t('sample'))}</span>` : ''}</div><div class="actions"><button class="btn btn-light" type="button" data-profile="${escape(p.id)}">${escape(t('view'))}</button><button class="btn btn-light" type="button" data-favorite="${escape(p.id)}" aria-pressed="${favorites.includes(p.id)}">${escape(t(favorites.includes(p.id) ? 'removeSaved' : 'save'))}</button></div></article>`).join('') : `<p class="empty">${escape(t('empty'))}</p>`;
  }
  $('#candidateFilters').addEventListener('submit', event => event.preventDefault());
  $('#candidateFilters').addEventListener('input', renderCandidates);
  $('#candidateFilters').addEventListener('reset', () => setTimeout(renderCandidates, 0));
  $('#candidateList').addEventListener('click', event => {
    const profile = event.target.closest('[data-profile]');
    if (profile) openProfile(state.profiles.find(p => p.id === profile.dataset.profile));
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      const id = favorite.dataset.favorite; const list = state.favorites[session.id] || [];
      try { persist({ ...state, favorites: { ...state.favorites, [session.id]: list.includes(id) ? list.filter(v => v !== id) : [...list, id] } }); renderCandidates(); }
      catch { $('#candidateCount').textContent = t('storageError'); }
    }
  });
  $('#coachForm').addEventListener('submit', event => {
    event.preventDefault();
    try { persist({ ...state, coaches: { ...state.coaches, [session.id]: profileValues(event.currentTarget) } }); setFeedback('#coachStatus', 'draftSaved'); }
    catch { setFeedback('#coachStatus', 'storageError', true); }
  });
  function csv(profiles, internal) {
    const keys = ['name', 'sport', 'position', 'graduation', 'major', 'english', 'academic', 'video'];
    if (internal) keys.push('budget', 'status', 'responsible');
    // Prevent user-entered values from becoming formulas in spreadsheet apps.
    const quote = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
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
    fillAdminResource();
  }
  function fillAdminResource() {
    const profile = state.profiles.find(p => p.id === $('#adminProfile').value);
    if (!profile) return;
    fillForm($('#adminResourceForm'), { video: profile.video || '', status: profile.status || 'review', responsible: profile.responsible || '' });
    $('#adminVideoFile').value = '';
    renderMedia($('#adminMedia'), profile, true);
  }
  $('#adminProfile').addEventListener('change', fillAdminResource);
  function openAdminEditor(profile) {
    if (session?.role !== 'admin') return;
    editingProfile = profile || { id: crypto.randomUUID(), published: false, status: 'review' };
    dialogProfile = null;
    const container = $('#dialogContent');
    container.innerHTML = `<h3>${escape(t(profile ? 'editProfile' : 'createProfile'))}</h3><form id="adminEditForm"><div class="form-grid" id="adminEditFields"></div><label class="checkbox"><input name="published" type="checkbox"${editingProfile.published ? ' checked' : ''}><span>${escape(t('visibility'))}</span></label><button type="submit" class="btn btn-primary">${escape(t('saveResource'))}</button><p class="feedback" id="editStatus" role="status"></p></form>`;
    drawPlayerFields(editingProfile, $('#adminEditFields'));
    $('#adminEditForm').addEventListener('submit', event => {
      event.preventDefault();
      const profile = { ...editingProfile, ...profileValues(event.currentTarget), published: event.currentTarget.elements.published.checked, updatedAt: new Date().toISOString() };
      try {
        persist({ ...state, profiles: [...state.profiles.filter(p => p.id !== profile.id), profile] });
        $('#profileDialog').close(); renderAdmin(); setFeedback('#adminStatus', 'profileSaved');
      } catch { setFeedback('#editStatus', 'storageError', true); }
    });
    $('#profileDialog').showModal();
  }
  $('#createAdminProfile').addEventListener('click', () => openAdminEditor());
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
      const updated = { ...profile, video: data.video, status: data.status, responsible: data.responsible, media, updatedAt: new Date().toISOString() };
      persist({ ...state, profiles: state.profiles.map(p => p.id === profile.id ? updated : p) });
      renderAdmin(); setFeedback('#adminStatus', 'resourceSaved');
    } catch (error) { setFeedback('#adminStatus', error.message === 'invalidVideo' ? 'invalidVideo' : 'storageError', true); }
    finally { button.disabled = false; }
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
      renderSidebar();
      if (currentView === 'coach' || currentView === 'saved') { refreshFilterOptions(); renderCandidates(); }
      if (currentView === 'admin') renderAdmin();
      if (currentView === 'player') renderMedia($('#playerMedia'), { ...ownProfile(), video: $('#profileForm [name=video]').value }, true);
    }
    if (publicId) renderPublicProfile();
    if ($('#profileDialog').open) {
      const edited = editingProfile && { ...editingProfile, ...profileValues($('#adminEditForm')), published: $('#adminEditForm').elements.published.checked };
      const viewed = dialogProfile;
      $('#profileDialog').close();
      if (edited) openAdminEditor(edited);
      else if (viewed) openProfile(viewed);
    }
  }
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => applyLanguage(button.dataset.lang)));
  function renderPublicProfile() {
    const profile = state.profiles.find(p => p.id === publicId && p.published);
    const container = $('#publicProfileContent');
    container.innerHTML = profile ? profileMarkup(profile) : `<p class="empty">${escape(t('missingProfile'))}</p>`;
    if (profile) renderMedia(container.querySelector('.profile-video'), profile);
  }
  state = readState();
  let language = 'es';
  try { language = localStorage.getItem('impactLang') || 'es'; } catch { /* Use Spanish by default. */ }
  applyLanguage(language);
  if (publicId) {
    $('#authSection').hidden = true;
    $('#publicProfile').hidden = false;
    renderPublicProfile();
  } else {
    try { const account = accountById(sessionStorage.getItem(SESSION)); if (account) enter(account); } catch { /* A new visitor starts at sign-in. */ }
  }
})();
