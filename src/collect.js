import { TOOLS, EVENT_TYPES, json, dayManaus, sha256Hex, deviceFromUA, sameOrigin } from './util.js';

const MAX_BODY = 4096, MAX_BATCH = 20;
const bucket = new Map(); // limite por isolate (melhor esforço)

function limited(key, now) {
  const w = bucket.get(key);
  if (!w || now - w.s > 60) { bucket.set(key, { s: now, n: 1 }); if (bucket.size > 5000) bucket.clear(); return false; }
  return ++w.n > 30;
}

export async function handleCollect(request, env, ctx) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  if (env.TELEMETRY === 'off') return json({ t: 0 });
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  const list = Array.isArray(body?.e) ? body.e.slice(0, MAX_BATCH) : [];
  const now = Math.floor(Date.now() / 1000);
  const day = dayManaus(now);
  const ua = request.headers.get('user-agent') || '';
  const ip = request.headers.get('cf-connecting-ip') || '';
  const visitor = (await sha256Hex(`${ip}|${ua}|${day}|${env.VISITOR_SALT || 'dev-salt'}`)).slice(0, 16);
  if (limited(visitor, now)) return json({ ok: false }, 429);
  const country = (request.cf && request.cf.country) || null;
  const device = deviceFromUA(ua);

  const rows = [];
  for (const ev of list) {
    if (!ev || !EVENT_TYPES.includes(ev.t)) continue;
    const tool = ev.k == null ? null : String(ev.k);
    if (tool !== null && !TOOLS.includes(tool)) continue;
    let val = Number.isFinite(ev.v) ? Math.max(0, Math.min(600000, Math.round(ev.v))) : null;
    rows.push([now, day, ev.t, tool, visitor, country, device, val]);
  }
  if (rows.length) {
    const stmt = env.DB.prepare('INSERT INTO events (ts,day,type,tool,visitor,country,device,val) VALUES (?,?,?,?,?,?,?,?)');
    await env.DB.batch(rows.map(r => stmt.bind(...r)));
  }
  if (Math.random() < 0.01) {
    const days = Math.max(7, parseInt(env.RETENTION_DAYS || '90', 10));
    ctx.waitUntil(env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(now - days * 86400).run());
  }
  return json({ ok: true, n: rows.length });
}
