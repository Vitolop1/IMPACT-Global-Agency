const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { publicConfig } = require('./config.cjs');
const root = path.resolve(__dirname, '..');
function backendBundle() {
  return esbuild.buildSync({ entryPoints: [path.join(root,'portal/supabase-entry.js')], bundle: true, write: false, platform:'browser', format:'iife', minify: true, target:'es2022' }).outputFiles[0].text;
}
function build() {
  const config = publicConfig();
  const out = path.join(root,'dist');
  fs.mkdirSync(out,{recursive:true});
  // Copy a strict tracked asset allowlist, never .env, database files, or Git data.
  const { execFileSync } = require('node:child_process');
  const tracked = execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0');
  const added = ['portal/profile-domain.js','portal/portal.js','portal/portal.css','portal/index.html'];
  for(const relative of new Set([...tracked,...added])) {
    if (!/^(index\.html|robots\.txt|sitemap\.xml|_redirects|assets\/|portal\/(index\.html|portal\.(js|css)|profile-domain\.js)$)/.test(relative)) continue;
    const target=path.join(out,relative); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(path.join(root,relative),target);
  }
  fs.mkdirSync(path.join(out,'portal'),{recursive:true});
  fs.writeFileSync(path.join(out,'portal/runtime-config.js'),`window.ImpactConfig=${JSON.stringify(config)};\n`);
  fs.writeFileSync(path.join(out,'portal/backend.js'),backendBundle());
  console.log(`Static build complete; portal mode: ${config.mode}`);
}
if(require.main===module) build();
module.exports={backendBundle};
