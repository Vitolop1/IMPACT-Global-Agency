const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicConfig}=require('../scripts/config.cjs');
test('Configuration fails closed and demo requires explicit opt-in',()=>{
  assert.deepEqual(publicConfig({}),{mode:'unconfigured'});
  assert.deepEqual(publicConfig({IMPACT_MODE:'demo'}),{mode:'demo'});
});
test('Browser configuration refuses secret/service keys and untrusted URL formats',()=>{
  for(const key of ['sb_secret_do-not-expose', 'invalid', `a.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.c`]) assert.throws(()=>publicConfig({SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:key}),/publishable/);
  assert.throws(()=>publicConfig({SUPABASE_URL:'http://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example'}),/HTTPS/);
  assert.equal(publicConfig({SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example'}).mode,'supabase');
});
