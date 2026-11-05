function publicConfig(env = process.env) {
  if (env.IMPACT_MODE === 'demo') return { mode: 'demo' };
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) return { mode: 'unconfigured' };
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') throw new Error('SUPABASE_URL must be an HTTPS project origin');
  let publishable = key.startsWith('sb_publishable_');
  if (!publishable) {
    try { publishable = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch { /* Invalid or secret keys fail closed. */ }
  }
  if (!publishable) throw new Error('Use a Supabase publishable key, never a secret/service_role key');
  return { mode: 'supabase', url: parsed.origin, key };
}
module.exports = { publicConfig };
