import { db } from '../src/lib/db';
import { decryptSecret } from '../src/lib/server/api/crypto';
const users = await db.user.findMany({ select: { id: true, email: true, name: true } });
console.log('USERS:', JSON.stringify(users));
const ws = await db.workspace.findMany({ select: { id: true, name: true, ownerId: true } });
console.log('WORKSPACES:', JSON.stringify(ws));
const accounts = await db.socialAccount.findMany({ where: { status: 'CONNECTED' }, select: { id: true, platform: true, username: true, displayName: true, externalId: true, isDemo: true, workspaceId: true, scopes: true } });
console.log('CONNECTED ACCOUNTS:', JSON.stringify(accounts, null, 1));
for (const a of accounts.filter(a => a.platform === 'FACEBOOK')) {
  const row = await db.socialAccount.findUnique({ where: { id: a.id }, select: { accessTokenEnc: true } });
  const tok = decryptSecret(row.accessTokenEnc);
  console.log('FB token prefix:', tok.slice(0, 12), 'len:', tok.length);
}
process.exit(0);
