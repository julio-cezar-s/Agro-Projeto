import http from 'node:http';
import crypto from 'node:crypto';
import { createSandbox, check, summary } from './lib.mjs';
// Sandbox temporária: banco D1 e .dev.vars próprios; o projeto real não é tocado (veja tests/lib.mjs).
const sb = createSandbox(); sb.migrate();
const d1 = (sql, json = false) => sb.d1(sql, json);

const CLIENT = 'cid-teste.apps.googleusercontent.com', ADMIN = 'Julio@Example.com';
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), kp2 = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64u = b => Buffer.from(b).toString('base64url');
function sign(claims, key = kp.privateKey, hdr = { alg: 'RS256', kid: 'k1', typ: 'JWT' }) {
  const i = b64u(JSON.stringify(hdr)) + '.' + b64u(JSON.stringify(claims));
  return i + '.' + (hdr.alg === 'none' ? '' : crypto.sign('RSA-SHA256', Buffer.from(i), key).toString('base64url'));
}
let next = null, lastTokenReq = null; const pend = new Map();
const mock = http.createServer((req, res) => {
  if (req.url === '/certs') { res.setHeader('cache-control', 'public, max-age=3600'); return res.end(JSON.stringify({ keys: [jwk] })); }
  if (req.url === '/token') { let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const p = new URLSearchParams(b); lastTokenReq = p; const info = pend.get(p.get('code'));
    const chal = crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
    if (!info || chal !== info.challenge || p.get('client_secret') !== 'segredo') { res.statusCode = 400; return res.end('{"error":"invalid_grant"}'); }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id_token: next(info) })); }); return; }
  res.statusCode = 404; res.end();
});
await new Promise(r => mock.listen(0, r));
const MP = mock.address().port;

sb.writeVars({ ADMIN_EMAIL: ADMIN, GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'segredo', GOOGLE_AUTH_URL: `http://localhost:${MP}/auth`, GOOGLE_TOKEN_URL: `http://localhost:${MP}/token`, GOOGLE_JWKS_URL: `http://localhost:${MP}/certs`, VISITOR_SALT: 'teste' });
const w = await sb.startWorker();
const good = (info, o = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'sub-A', email: 'julio@example.com', email_verified: true, nonce: info.nonce, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 3600, ...o });
async function flow(mk, { reuseState = false } = {}) {
  d1('DELETE FROM auth_rate');
  const r = await fetch(w.base + '/api/admin/login', { redirect: 'manual' });
  if (r.status !== 302) return { start: r };
  const u = new URL(r.headers.get('location'));
  const code = 'c' + Math.random().toString(36).slice(2);
  pend.set(code, { nonce: u.searchParams.get('nonce'), challenge: u.searchParams.get('code_challenge'), u });
  next = info => mk(info);
  const cb = await fetch(`${w.base}/api/admin/callback?code=${code}&state=${u.searchParams.get('state')}`, { redirect: 'manual' });
  return { start: r, u, cb, code, state: u.searchParams.get('state') };
}
const cookieOf = r => (r.headers.get('set-cookie') || '').split(';')[0];
try {
  let f = await flow(i => sign(good(i)));
  const sc = f.cb.headers.get('set-cookie') || '';
  check('login válido → 200', f.cb.status === 200);
  check('cookie HttpOnly+Secure+SameSite=Strict+__Host-', /^__Host-ap_session=/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc) && /Path=\//.test(sc) && !/Domain=/i.test(sc));
  check('PKCE S256 + state + nonce no redirect', f.u.searchParams.get('code_challenge_method') === 'S256' && f.u.searchParams.get('state').length > 20 && f.u.searchParams.get('nonce').length > 20);
  check('escopo mínimo openid email', f.u.searchParams.get('scope') === 'openid email');
  check('client_secret enviado só ao token endpoint (servidor)', lastTokenReq.get('client_secret') === 'segredo' && !f.u.href.includes('segredo'));
  const cookie = cookieOf(f.cb), tok = cookie.split('=')[1];
  let r = await fetch(w.base + '/api/admin/me', { headers: { cookie } });
  check('/me com sessão → 200 e e-mail', r.status === 200 && (await r.json()).email === 'julio@example.com');
  const rows = d1('SELECT token_hash FROM sessions', true);
  check('sessão guardada como hash (token não está no banco)', rows.length === 1 && rows[0].token_hash !== tok && rows[0].token_hash.length === 64);
  check('/me sem cookie → 401', (await fetch(w.base + '/api/admin/me')).status === 401);
  check('/me com cookie forjado → 401', (await fetch(w.base + '/api/admin/me', { headers: { cookie: '__Host-ap_session=forjado123' } })).status === 401);
  r = await fetch(w.base + '/api/admin/logout', { method: 'POST', headers: { cookie } });
  check('logout sem Origin/cabeçalho → 403 (CSRF)', r.status === 403);
  r = await fetch(w.base + '/api/admin/logout', { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'x-requested-with': 'agropainel' } });
  check('logout com Origin alheio → 403', r.status === 403);
  check('sessão ainda válida após tentativas CSRF', (await fetch(w.base + '/api/admin/me', { headers: { cookie } })).status === 200);
  // expiração por inatividade
  d1("UPDATE sessions SET last_seen = last_seen - 30000");
  check('sessão ociosa (>8h) expira → 401', (await fetch(w.base + '/api/admin/me', { headers: { cookie } })).status === 401);
  // novo login para testar logout legítimo
  f = await flow(i => sign(good(i))); const c2 = cookieOf(f.cb);
  r = await fetch(w.base + '/api/admin/logout', { method: 'POST', headers: { cookie: c2, origin: w.base, 'x-requested-with': 'agropainel' } });
  check('logout legítimo → 200 e cookie limpo', r.status === 200 && /Max-Age=0/.test(r.headers.get('set-cookie') || ''));
  check('após logout /me → 401', (await fetch(w.base + '/api/admin/me', { headers: { cookie: c2 } })).status === 401);

  const bad = async (name, mk) => { const x = await flow(mk); check(name, x.cb.status === 403 && !(x.cb.headers.get('set-cookie')), 'status ' + x.cb?.status); };
  await bad('e-mail de outra conta → negado', i => sign(good(i, { email: 'outro@example.com' })));
  await bad('email_verified=false → negado', i => sign(good(i, { email_verified: false })));
  await bad('audience errada → negado', i => sign(good(i, { aud: 'outro-cliente' })));
  await bad('issuer errado → negado', i => sign(good(i, { iss: 'https://evil.com' })));
  await bad('token expirado → negado', i => sign(good(i, { exp: Math.floor(Date.now()/1000) - 3600 })));
  await bad('nonce errado → negado', i => sign(good(i, { nonce: 'outro' })));
  await bad('assinatura de outra chave → negado', i => sign(good(i), kp2.privateKey));
  await bad('alg=none → negado', i => sign(good(i), null, { alg: 'none', kid: 'k1' }));
  await bad('alg HS256 → negado', i => sign(good(i), kp.privateKey, { alg: 'HS256', kid: 'k1' }));
  await bad('sub diferente do fixado → negado', i => sign(good(i, { sub: 'sub-B' })));
  // reuso de state e state desconhecido
  f = await flow(i => sign(good(i)));
  const again = await fetch(`${w.base}/api/admin/callback?code=${f.code}&state=${f.state}`, { redirect: 'manual' });
  check('reuso do state → negado', again.status === 403);
  check('state desconhecido → negado', (await fetch(`${w.base}/api/admin/callback?code=x&state=inexistente`)).status === 403);
  check('callback sem parâmetros → negado', (await fetch(`${w.base}/api/admin/callback`)).status === 403);
  // PKCE: verificador errado no Google
  { const r1 = await fetch(w.base + '/api/admin/login', { redirect: 'manual' }); const u = new URL(r1.headers.get('location'));
    const code = 'z' + Math.random(); pend.set(code, { nonce: u.searchParams.get('nonce'), challenge: 'desafio-diferente' }); next = i => sign(good(i));
    const cb = await fetch(`${w.base}/api/admin/callback?code=${code}&state=${u.searchParams.get('state')}`);
    check('PKCE incompatível → negado', cb.status === 403); }
  const audit = d1('SELECT action FROM audit_log', true);
  check('auditoria registra login_ok e login_fail', audit.some(a => a.action === 'login_ok') && audit.some(a => a.action === 'login_fail'));
  check('auditoria não guarda e-mail', !JSON.stringify(d1('SELECT detail FROM audit_log', true)).includes('example.com'));
  // limite de tentativas (por último)
  d1('DELETE FROM auth_rate');
  let st = []; for (let i = 0; i < 12; i++) st.push((await fetch(w.base + '/api/admin/login', { redirect: 'manual' })).status);
  check('limite de tentativas de login → 429', st.includes(429), st.join(','));
  check('app continua servido', (await fetch(w.base + '/AgroPainel.html')).status === 200);
} finally { await w.stop(); mock.close(); await sb.cleanup(); }
process.exit(summary() ? 1 : 0);
