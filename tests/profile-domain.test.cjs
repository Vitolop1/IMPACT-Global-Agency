const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../portal/profile-domain');
const draft = () => ({ id: 'student', name: 'Sample Student', sport: 'Rugby', goal: 'sports', graduation: '2028', academic: 'secondary', english: 'advanced', budget: 'budget20', status: 'ready', email: 'private@example.test', notes: 'Staff only', published: false });

test('Draft save preserves published snapshot, media reference, and staff status', () => {
  const published = D.publish({ ...draft(), media: { key: 'video-v1' } });
  const edited = D.saveDraft(published, { name: 'New draft', media: { key: 'video-v2' }, status: 'review', id: 'attacker' });
  assert.equal(edited.name, 'New draft');
  assert.equal(edited.status, 'ready');
  assert.equal(edited.id, 'student');
  assert.equal(D.discovery(edited).name, 'Sample Student');
  assert.equal(D.discovery(edited).media.key, 'video-v1');
  assert.equal(D.discovery(D.publish(edited)).name, 'New draft');
});
test('Discovery allowlists fields and withdrawal removes access', () => {
  assert.equal(D.discovery(draft()), null);
  const p = D.publish(draft());
  for (const key of ['budget', 'email', 'notes', 'status', 'history']) assert.equal(Object.hasOwn(D.discovery(p), key), false);
  assert.equal(D.discovery(D.withdraw(p)), null);
});
test('Legacy records acquire a snapshot without mutating stored input', () => {
  const legacy = { ...draft(), published: true };
  const migrated = D.migrate(legacy);
  assert.equal(migrated.publishedData.name, legacy.name);
  assert.equal(Object.hasOwn(legacy, 'publishedData'), false);
});
test('Publication validates required data and URLs', () => {
  assert.throws(() => D.publish({ ...draft(), name: '' }), /incompleteProfile/);
  assert.throws(() => D.publish({ ...draft(), video: 'javascript:alert(1)' }), /invalidUrl/);
});
test('Only administrator actions change the recruiting stage and append history', () => {
  assert.throws(() => D.updateCase(draft(), { status: 'contacted' }, { role: 'player' }), /forbidden/);
  const result = D.updateCase(draft(), { status: 'contacted', responsible: 'Staff', notes: 'Called' }, { id: 'admin', role: 'admin' });
  assert.equal(result.status, 'contacted');
  assert.equal(result.history[0].from, 'ready');
  assert.equal(result.history[0].actor, 'admin');
});
