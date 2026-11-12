(function (root, factory) {
  const domain = factory();
  if (typeof module === 'object' && module.exports) module.exports = domain;
  else root.ImpactProfiles = domain;
})(typeof window === 'undefined' ? globalThis : window, () => {
  const publicFields = ['name', 'sport', 'position', 'goal', 'major', 'university', 'graduation', 'school', 'gpa', 'academic', 'english', 'countries', 'club', 'bio', 'video', 'media', 'sample'];
  const editableFields = [...publicFields, 'age', 'budget'];
  const stages = ['new', 'review', 'ready', 'contacted', 'opportunity', 'application', 'accepted', 'closed'];
  function project(data, keys) {
    return structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]])));
  }
  function publicSnapshot(data) { return project(data, publicFields); }
  function migrate(profile) {
    const result = structuredClone(profile);
    if (!Object.hasOwn(result, 'publishedData')) result.publishedData = result.published ? publicSnapshot(result) : null;
    result.status ||= 'new';
    return result;
  }
  function saveDraft(profile, changes) {
    return { ...migrate(profile), ...project(changes, editableFields), updatedAt: new Date().toISOString() };
  }
  function validate(profile) {
    for (const key of ['name', 'goal', 'graduation', 'academic', 'english', 'budget']) {
      if (!String(profile[key] || '').trim()) throw new Error('incompleteProfile');
    }
    if (profile.goal === 'sports' && !String(profile.sport || '').trim()) throw new Error('incompleteProfile');
    if (!['sports','academic','cultural','exchange'].includes(profile.goal)) throw new Error('incompleteProfile');
    const year = Number(profile.graduation);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('incompleteProfile');
    if (profile.video) {
      let url;
      try { url = new URL(profile.video); } catch { throw new Error('invalidUrl'); }
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalidUrl');
    }
  }
  function publish(profile) {
    validate(profile);
    return { ...profile, published: true, publishedData: publicSnapshot(profile), publishedAt: new Date().toISOString() };
  }
  function withdraw(profile) { return { ...profile, published: false, publishedData: null }; }
  function discovery(profile) {
    const data = migrate(profile);
    return data.published && data.publishedData ? { ...publicSnapshot(data.publishedData), id: data.id, published: true } : null;
  }
  function updateCase(profile, changes, actor) {
    if (actor?.role !== 'admin') throw new Error('forbidden');
    if (!stages.includes(changes.status)) throw new Error('invalidStage');
    if (['status','responsible','notes','nextAction'].every(key => (profile[key] || '') === (changes[key] || ''))) return { ...profile, ...changes };
    const event = { from: profile.status || 'new', to: changes.status, responsible: changes.responsible || '', notes: changes.notes || '', nextAction: changes.nextAction || '', actor: actor.id, at: new Date().toISOString() };
    return { ...profile, ...changes, history: [...(profile.history || []), event] };
  }
  function meetingProposal(values, now = Date.now()) {
    const date = new Date(values.starts_at);
    const duration = Number(values.duration_minutes);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= now + 5 * 60 * 1000 || !Number.isInteger(duration) || duration < 15 || duration > 180) throw new Error('meetingInvalid');
    if (typeof values.timezone !== 'string' || !values.timezone.trim()) throw new Error('meetingInvalid');
    try { new Intl.DateTimeFormat('en', { timeZone: values.timezone }).format(date); } catch { throw new Error('meetingInvalid'); }
    return { starts_at: date.toISOString(), timezone: values.timezone, duration_minutes: duration, message: String(values.message || '').trim().slice(0,1000) };
  }
  return { publicFields, editableFields, stages, publicSnapshot, migrate, saveDraft, publish, withdraw, discovery, updateCase, meetingProposal };
});
