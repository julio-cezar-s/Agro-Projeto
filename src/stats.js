import { json, dayManaus } from './util.js';
import { requireAdmin } from './auth.js';

export async function handleStats(request, env) {
  const a = await requireAdmin(request, env);
  if (a.res) return a.res;
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10) || 7));
  const now = Math.floor(Date.now() / 1000);
  const since = dayManaus(now - (days - 1) * 86400);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(since, ...b).all().then(r => r.results);
  const [daily, tools, devices, countries, perf, errors, totals, realtime] = await Promise.all([
    q("SELECT day, COUNT(DISTINCT visitor) visitors, SUM(type='view') views, SUM(type='tool_open') opens, SUM(type='calc') calcs, SUM(type='error') errors FROM events WHERE day>=? GROUP BY day ORDER BY day"),
    q("SELECT tool, SUM(type='tool_open') opens, SUM(type='calc') calcs, COUNT(DISTINCT visitor) visitor_days FROM events WHERE day>=? AND tool IS NOT NULL AND type IN ('tool_open','calc') GROUP BY tool ORDER BY calcs DESC, opens DESC"),
    q("SELECT device, COUNT(DISTINCT day||visitor) n FROM events WHERE day>=? AND type='view' GROUP BY device ORDER BY n DESC"),
    q("SELECT COALESCE(country,'??') country, COUNT(DISTINCT day||visitor) n FROM events WHERE day>=? AND type='view' GROUP BY country ORDER BY n DESC LIMIT 15"),
    q("SELECT val FROM events WHERE day>=? AND type='perf' AND val IS NOT NULL ORDER BY val"),
    q("SELECT COALESCE(tool,'(geral)') tool, COUNT(*) n FROM events WHERE day>=? AND type='error' GROUP BY tool ORDER BY n DESC"),
    q("SELECT COUNT(DISTINCT day||visitor) visitor_days, SUM(type='view') views, SUM(type='calc') calcs, SUM(type='error') errors FROM events WHERE day>=?"),
    env.DB.prepare("SELECT COUNT(DISTINCT visitor) n FROM events WHERE ts>=?").bind(now - 300).first(),
  ]);
  const vals = perf.map(r => r.val), pct = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : null;
  const byDay = Object.fromEntries(daily.map(d => [d.day, d]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) { const d = dayManaus(now - i * 86400); series.push(byDay[d] || { day: d, visitors: 0, views: 0, opens: 0, calcs: 0, errors: 0 }); }
  return json({ ok: true, days, since, totals: totals[0], realtime: realtime?.n || 0, series, tools, devices, countries, perf: { n: vals.length, p50: pct(0.5), p95: pct(0.95) }, errors,
    note: 'Visitantes únicos são contados por dia (o identificador muda a cada dia por privacidade); o total é a soma dos visitantes diários.' });
}
