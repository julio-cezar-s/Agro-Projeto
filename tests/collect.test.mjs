import { createSandbox, check, summary } from './lib.mjs';
// Sandbox temporária com banco D1 próprio (veja tests/lib.mjs).
const sb = createSandbox(); sb.migrate();
const q = s => sb.d1(s, true);
const w = await sb.startWorker();
const post = (body, h = {}) => fetch(w.base + '/api/collect', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'text/plain', ...h } });
try {
  let r = await post({ e: [{ t: 'view' }, { t: 'tool_open', k: 'custo-lucro' }, { t: 'calc', k: 'tempo-retorno' }, { t: 'perf', v: 1234.6 }] });
  let j = await r.json(); check('aceita lote válido', r.status === 200 && j.n === 4, JSON.stringify(j));
  r = await post({ e: [{ t: 'hack' }, { t: 'calc', k: 'naoexiste' }, { t: 'calc', k: 'custo-lucro; DROP TABLE events' }] });
  j = await r.json(); check('rejeita tipo/ferramenta fora da lista', j.n === 0);
  r = await post('{nao json'); check('JSON inválido → 400', r.status === 400);
  r = await post('x'.repeat(5000)); check('corpo grande → 413', r.status === 413);
  r = await post({ e: [{ t: 'view' }] }, { origin: 'https://evil.example' }); check('Origin de outro site → 403', r.status === 403);
  r = await fetch(w.base + '/api/collect'); check('GET → 405', r.status === 405);
  r = await post({ e: Array.from({ length: 50 }, () => ({ t: 'view' })) }); j = await r.json(); check('lote limitado a 20', j.n === 20);
  r = await post({ e: [{ t: 'perf', v: 99999999 }, { t: 'perf', v: -5 }] });
  const rows = q('SELECT type,tool,visitor,country,device,val FROM events ORDER BY id');
  check('sem IP bruto (visitor é hash de 16 hex)', rows.every(x => /^[0-9a-f]{16}$/.test(x.visitor)));
  check('val limitado 0..600000', rows.some(x => x.val === 600000) && rows.some(x => x.val === 0));
  check('perf arredondado', rows.some(x => x.val === 1235));
  check('device detectado', rows.every(x => ['desktop','mobile','tablet'].includes(x.device)));
  r = await fetch(w.base + '/api/nada'); check('rota API desconhecida → 404 JSON', r.status === 404 && (await r.json()).ok === false);
  r = await fetch(w.base + '/AgroPainel.html'); check('app servido (200)', r.status === 200);
} finally { await w.stop(); await sb.cleanup(); }
process.exit(summary() ? 1 : 0);
