import { getPlatformProxy } from 'wrangler';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bootstrap is local-only; subsequent assignments use the platform administrator's audited API.
export async function bootstrapModuleAdministrator(db, account, reason) {
  if (!account?.trim() || !reason?.trim() || reason.length > 1000) throw new Error('Account and reason are required');
  const user = await db.prepare("SELECT id FROM users WHERE (id=? OR emp_id=? OR email=?) AND status='ACTIVE' AND is_dcc=1").bind(account, account, account).first();
  if (!user) throw new Error('Active DCC account not found');
  if (await db.prepare("SELECT 1 FROM module_permission_grants WHERE user_id=? AND permission='PLATFORM_ADMIN'").bind(user.id).first()) return { alreadyAssigned: true };
  if (await db.prepare("SELECT 1 FROM module_permission_grants WHERE permission='PLATFORM_ADMIN' LIMIT 1").first()) throw new Error('Platform administrator already exists; use Module Management');
  await db.batch([
    db.prepare("INSERT INTO module_permission_grants(user_id,permission,module_id,granted_by) VALUES(?,'PLATFORM_ADMIN','*',?)").bind(user.id,user.id),
    db.prepare('INSERT INTO audit_log(actor_id,action,details) VALUES(?,?,?)').bind(user.id,'MODULE_PERMISSION_GRANTED',JSON.stringify({ user_id:user.id,permission:'PLATFORM_ADMIN',module_id:'*',before:null,after:{granted:true},reason:reason.trim(),bootstrap:'LOCAL_ONLY' }))
  ]);
  return { alreadyAssigned: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { values } = parseArgs({ options: { user: { type:'string' }, reason: { type:'string' } }, strict: true });
  const proxy = await getPlatformProxy({ persist:{ path:'.wrangler/state/v3' } });
  try { console.log(JSON.stringify(await bootstrapModuleAdministrator(proxy.env.DB,values.user,values.reason))); }
  finally { await proxy.dispose(); }
}
