import { json, sha256Hex, randomToken, sameOrigin, securityHeaders } from './util.js';

const COOKIE = '__Host-ap_session';
const IDLE = 8 * 3600, ABSOLUTE = 7 * 86400, STATE_TTL = 600;
const G = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
};
const urls = env => ({ auth: env.GOOGLE_AUTH_URL || G.auth, token: env.GOOGLE_TOKEN_URL || G.token, jwks: env.GOOGLE_JWKS_URL || G.jwks });
const now = () => Math.floor(Date.now() / 1000);
const b64uBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const b64uJson = s => JSON.parse(new TextDecoder().decode(b64uBytes(s)));

let jwksCache = { keys: null, exp: 0 };
async function getJwks(env, force = false) {
  if (!force && jwksCache.keys && jwksCache.exp > Date.now()) return jwksCache.keys;
  const r = await fetch(urls(env).jwks);
  if (!r.ok) throw new Error('jwks');
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwksCache = { keys: j.keys, exp: Date.now() + Math.min(Math.max(parseInt(m?.[1] || '3600', 10), 60), 86400) * 1000 };
  return jwksCache.keys;
}

export async function verifyIdToken(idToken, env, expectedNonce) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('formato');
  const header = b64uJson(parts[0]), claims = b64uJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('alg');
  let keys = await getJwks(env);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { keys = await getJwks(env, true); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('assinatura');
  const issuers = env.GOOGLE_ISSUER ? [env.GOOGLE_ISSUER] : ['accounts.google.com', 'https://accounts.google.com'];
  if (!issuers.includes(claims.iss)) throw new Error('iss');
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('aud');
  if (!(claims.exp > now() - 30)) throw new Error('exp');
  if (claims.iat && claims.iat > now() + 300) throw new Error('iat');
  if (claims.nonce !== expectedNonce) throw new Error('nonce');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('email_nao_verificado');
  return claims;
}

async function audit(env, action, detail) {
  try { await env.DB.prepare('INSERT INTO audit_log (ts,action,detail) VALUES (?,?,?)').bind(now(), action, detail || null).run(); } catch {}
}

async function rateLimited(env, key, max, windowSec) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, window_start FROM auth_rate WHERE key=?').bind(key).first();
  if (!row || t - row.window_start > windowSec) {
    await env.DB.prepare('INSERT OR REPLACE INTO auth_rate (key,count,window_start) VALUES (?,?,?)').bind(key, 1, t).run();
    return false;
  }
  await env.DB.prepare('UPDATE auth_rate SET count=count+1 WHERE key=?').bind(key).run();
  return row.count + 1 > max;
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function getCookie(request) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`).exec(request.headers.get('cookie') || '');
  return m ? m[1] : null;
}
const denied = () => new Response('Acesso negado.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders() } });

export async function handleLogin(request, env) {
  if (request.method !== 'GET') return json({ ok: false }, 405);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ADMIN_EMAIL) return new Response('Login não configurado.', { status: 503 });
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  if (await rateLimited(env, 'login:' + (await sha256Hex(ip)).slice(0, 16), 10, 900)) return new Response('Muitas tentativas. Aguarde alguns minutos.', { status: 429 });
  const state = randomToken(24), nonce = randomToken(24), verifier = randomToken(48);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await env.DB.prepare('DELETE FROM oauth_state WHERE created < ?').bind(now() - STATE_TTL).run();
  await env.DB.prepare('INSERT INTO oauth_state (state,nonce,verifier,created) VALUES (?,?,?,?)').bind(state, nonce, verifier, now()).run();
  const u = new URL(urls(env).auth);
  u.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: new URL('/api/admin/callback', request.url).href, response_type: 'code',
    scope: 'openid email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return new Response(null, { status: 302, headers: { location: u.href, 'cache-control': 'no-store', ...securityHeaders() } });
}

export async function handleCallback(request, env) {
  if (request.method !== 'GET') return json({ ok: false }, 405);
  const url = new URL(request.url);
  const state = url.searchParams.get('state'), code = url.searchParams.get('code');
  if (!state || !code || url.searchParams.get('error')) { await audit(env, 'login_fail', 'parametros'); return denied(); }
  const st = await env.DB.prepare('SELECT nonce, verifier, created FROM oauth_state WHERE state=?').bind(state).first();
  await env.DB.prepare('DELETE FROM oauth_state WHERE state=?').bind(state).run(); // uso único
  if (!st || now() - st.created > STATE_TTL) { await audit(env, 'login_fail', 'state'); return denied(); }
  try {
    const tr = await fetch(urls(env).token, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: new URL('/api/admin/callback', request.url).href, grant_type: 'authorization_code', code_verifier: st.verifier }),
    });
    if (!tr.ok) throw new Error('token');
    const claims = await verifyIdToken((await tr.json()).id_token, env, st.nonce);
    const email = String(claims.email || '').toLowerCase();
    if (email !== String(env.ADMIN_EMAIL).trim().toLowerCase()) throw new Error('email_nao_autorizado');
    const pinned = await env.DB.prepare("SELECT value FROM settings WHERE key='admin_sub'").first();
    if (!pinned) await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('admin_sub',?)").bind(String(claims.sub)).run();
    else if (pinned.value !== String(claims.sub)) throw new Error('sub');
    const token = randomToken(32), t = now();
    await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(t).run();
    await env.DB.prepare('INSERT INTO sessions (token_hash,email,created,last_seen,expires) VALUES (?,?,?,?,?)').bind(await sha256Hex(token), email, t, t, t + ABSOLUTE).run();
    await audit(env, 'login_ok', null);
    return new Response('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/admin/"><title>Entrando…</title><p>Entrando… <a href="/admin/">continuar</a></p>', {
      status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': cookieHeader(token, ABSOLUTE), 'cache-control': 'no-store', ...securityHeaders() },
    });
  } catch (e) {
    await audit(env, 'login_fail', String(e.message || 'erro').slice(0, 40));
    return denied();
  }
}

export async function getSession(request, env) {
  const tok = getCookie(request);
  if (!tok) return null;
  const h = await sha256Hex(tok), t = now();
  const s = await env.DB.prepare('SELECT email, last_seen, expires FROM sessions WHERE token_hash=?').bind(h).first();
  if (!s || s.expires < t || t - s.last_seen > IDLE) { if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(h).run(); return null; }
  if (String(s.email).toLowerCase() !== String(env.ADMIN_EMAIL || '').trim().toLowerCase()) return null;
  if (t - s.last_seen > 300) await env.DB.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').bind(t, h).run();
  return { email: s.email, hash: h };
}

// Exige sessão válida; em métodos que alteram estado exige também Origin igual e cabeçalho customizado.
export async function requireAdmin(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const o = request.headers.get('origin');
    if (!o || !sameOrigin(request) || request.headers.get('x-requested-with') !== 'agropainel') return { res: json({ ok: false, error: 'csrf' }, 403) };
  }
  const s = await getSession(request, env);
  if (!s) return { res: json({ ok: false, error: 'unauthorized' }, 401) };
  return { session: s };
}

export async function handleLogout(request, env) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  const a = await requireAdmin(request, env);
  if (a.res) return a.res;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(a.session.hash).run();
  await audit(env, 'logout', null);
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
}

export async function handleMe(request, env) {
  const a = await requireAdmin(request, env);
  if (a.res) return a.res;
  return json({ ok: true, email: a.session.email });
}
