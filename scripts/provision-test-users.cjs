// Run only from a trusted local terminal. Never bundle or serve this file.
// Uses the official server-side Auth Admin API; email confirmation remains enabled.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const local = path.resolve(__dirname, '../.local');
const configPath = path.join(local, 'admin-session.json');
const credentialsPath = path.join(local, 'test-accounts.json');
const definitions = [
  ['admin','admin@impact.test','Prueba · Administrador IMPACT'],
  ['player','rugby.student@impact.test','Prueba · Estudiante de Rugby'],
  ['player','hockey.student@impact.test','Prueba · Estudiante de Hockey'],
  ['player','academic.student@impact.test','Prueba · Estudiante Académico'],
  ['coach','rugby.coach@impact.test','Prueba · Coach de Rugby'],
  ['coach','academic.coach@impact.test','Prueba · Coach Académico']
];
async function main() {
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const client=createClient(config.url,config.serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const existing=await client.auth.admin.listUsers({page:1,perPage:100});
  if(existing.error)throw existing.error;
  const saved=fs.existsSync(credentialsPath)?JSON.parse(fs.readFileSync(credentialsPath,'utf8')):{project:'impact-dev',url:config.url,confirmedAdministratively:true,accounts:[]};
  for(const [role,email,name] of definitions) {
    let entry=saved.accounts.find(a=>a.email===email);
    const found=existing.data.users.find(u=>u.email===email);
    if(found && (!entry || entry.id!==found.id))throw new Error('An existing account lacks a matching private credential record; refusing to reset it: '+email);
    if(!found) {
      const password=crypto.randomBytes(24).toString('base64url');
      const created=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name,account_type:role==='coach'?'coach':'player'},app_metadata:{is_test_account:true}});
      if(created.error)throw created.error;
      entry={id:created.data.user.id,role,email,name,password};
      saved.accounts.push(entry);
      fs.writeFileSync(credentialsPath,JSON.stringify(saved,null,2),{mode:0o600});
    }
    console.log(JSON.stringify({id:entry.id,role,email,confirmedAdministratively:true}));
  }
  const lines=['# Accesos privados de prueba — IMPACT','',
    'Estas cuentas existen en Supabase Auth real. Sus correos son ficticios y se confirmaron administrativamente para pruebas. No se probó entrega de correo.','',
    'Portal local: http://localhost:8000/portal','',
    '| Rol | Correo | Contraseña |','| --- | --- | --- |',
    ...saved.accounts.map(a=>`| ${a.role} | ${a.email} | ${a.password} |`),'',
    'Archivo privado excluido de Git y del sitio servido. No copiar a Issues, PRs ni documentos públicos.'];
  fs.writeFileSync(path.join(local,'ACCESOS-IMPACT.md'),lines.join('\n'),{mode:0o600});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
