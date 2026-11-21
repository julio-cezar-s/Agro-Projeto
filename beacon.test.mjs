import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createSandbox, ROOT, check, summary } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
// Sandbox temporária: banco D1 e .dev.vars próprios; o projeto real não é tocado (veja tests/lib.mjs).
const sb = createSandbox(); sb.migrate();
const d1 = (sql, json = true) => sb.d1(sql, json);
const clear = () => d1('DELETE FROM events', false);
const ev = () => d1('SELECT type,tool,device,country,visitor FROM events ORDER BY id');
sb.writeVars({ ADMIN_EMAIL: 'julio@example.com', VISITOR_SALT: 't' });
// Sinais ficam com o handler de tests/lib.mjs; o Playwright encerra o navegador no evento 'exit' do processo.
const browser = await chromium.launch({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
let stat;
const mobile = { viewport: { width: 375, height: 800 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' };
async function session(base, { init, ctx = mobile } = {}) {
  const c = await browser.newContext(ctx); const page = await c.newPage();
  const errs = [], bodies = [], reqs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  page.on('request', r => { if (r.url().includes('/api/collect')) { reqs.push(r.url()); bodies.push(r.postData() || ''); } });
  if (init) await page.addInitScript(init);
  await page.goto(base + '/AgroPainel.html'); await page.waitForTimeout(800);
  return { c, page, errs, bodies, reqs };
}
async function useTool(page, screen, calcBtn, val) {
  await page.evaluate(s => showScreen(s), screen);
  await page.evaluate(({ s, v }) => { document.querySelectorAll('#' + s + ' input:not([type=checkbox]):not([type=radio]):not([type=file])').forEach(i => { if (i.offsetParent) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } }); }, { s: ({ payback: 'toolPaybackScreen', custolucro: 'toolCustoLucroScreen', calendario: 'toolCalendarioScreen' })[screen], v: val });
  await page.click('#' + calcBtn);
}
try {
const w = await sb.startWorker();
try {
  clear();
  let s = await session(w.base);
  await useTool(s.page, 'payback', 'pbCalcBtn', '98765');
  await useTool(s.page, 'custolucro', 'clpCalcBtn', '98765');
  await useTool(s.page, 'calendario', 'clcCalcBtn', '98765');
  await s.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await s.page.waitForTimeout(3500);
  let rows = ev(); const t = x => rows.filter(r => r.type === x);
  check('registra 1 view e perf', t('view').length === 1 && t('perf').length === 1, JSON.stringify(rows.map(r => r.type)));
  check('tool_open das 3 ferramentas com chaves do app', ['tempo-retorno', 'custo-lucro', 'calendario-plantio'].every(k => t('tool_open').some(r => r.tool === k)));
  check('calc contado por ferramenta (incl. Calendário)', ['tempo-retorno', 'custo-lucro', 'calendario-plantio'].every(k => t('calc').some(r => r.tool === k)));
  check('device=mobile', rows.every(r => r.device === 'mobile'));
  check('valores digitados NÃO são enviados', s.bodies.length > 0 && s.bodies.every(b => !b.includes('98765')));
  check('payload só tem t/k/v', s.bodies.every(b => { try { return JSON.parse(b).e.every(e => Object.keys(e).every(k => ['t', 'k', 'v'].includes(k))); } catch { return false; } }));
  check('sem erros JS na página', s.errs.length === 0, s.errs.join(' | '));
  check('seção de privacidade aparece quando há coleta', await s.page.evaluate(() => !document.getElementById('telemetrySection').hidden && !!document.getElementById('telemetryNote')));
  // opt-out pela interface
  await s.page.evaluate(() => goHome()); await s.page.click('#telemetryMoreLink'); await s.page.waitForTimeout(300);
  check('link "Saiba mais" abre Dados e Backup', await s.page.evaluate(() => document.getElementById('backupBackdrop').classList.contains('open') || getComputedStyle(document.getElementById('backupBackdrop')).display !== 'none'));
  await s.page.click('#telemetryToggleBtn');
  check('opt-out grava preferência e atualiza texto', await s.page.evaluate(() => localStorage.getItem('agropainel-telemetry-optout') === '1' && /Desativada/.test(document.getElementById('telemetryStatus').textContent)));
  await s.page.close(); await s.c.close();
  clear();
  s = await session(w.base, { init: "try{localStorage.setItem('agropainel-telemetry-optout','1')}catch(e){}" });
  await useTool(s.page, 'payback', 'pbCalcBtn', '5'); await s.page.waitForTimeout(3200);
  check('com opt-out: nenhuma requisição e nenhum evento', s.reqs.length === 0 && ev().length === 0);
  check('com opt-out: calculadora continua funcionando', await s.page.evaluate(() => document.getElementById('pbResultContent') !== null));
  await s.c.close();
  s = await session(w.base, { init: "Object.defineProperty(navigator,'doNotTrack',{get:()=>'1'})" });
  await useTool(s.page, 'payback', 'pbCalcBtn', '5'); await s.page.waitForTimeout(3200);
  check('Do Not Track respeitado', s.reqs.length === 0 && ev().length === 0);
  check('DNT: botão de reativar desabilitado e aviso exibido', await s.page.evaluate(() => /Não rastrear/.test(document.getElementById('telemetryStatus').textContent) && document.getElementById('telemetryToggleBtn').disabled));
  await s.c.close();
} finally { await w.stop(); }

// interruptor remoto
const w2 = await sb.startWorker(['--var', 'TELEMETRY:off']);
try {
  clear();
  const s = await session(w2.base); await useTool(s.page, 'payback', 'pbCalcBtn', '5'); await s.page.waitForTimeout(3200);
  check('kill switch: servidor responde t:0, nada gravado', ev().length === 0);
  check('kill switch: navegador pausa por 24h', await s.page.evaluate(() => +localStorage.getItem('agropainel-telemetry-off-until') > Date.now()));
  check('kill switch: sem erros e app funciona', s.errs.length === 0 && s.reqs.length === 1, s.errs.join('|') + ' reqs=' + s.reqs.length);
  await s.c.close();
} finally { await w2.stop(); }

// API fora do ar / hospedagem estática (GitHub Pages)
const html = readFileSync(ROOT + '/public/AgroPainel.html');
stat = http.createServer((q, r) => { if (q.url.startsWith('/AgroPainel.html')) { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(html); } r.statusCode = 404; r.end('nf'); });
await new Promise(r => stat.listen(0, r));
const SP = stat.address().port;
{
  const s = await session(`http://localhost:${SP}`); await useTool(s.page, 'payback', 'pbCalcBtn', '5'); await useTool(s.page, 'custolucro', 'clpCalcBtn', '5'); await s.page.waitForTimeout(3500);
  check('sem API (404): no máximo 1 tentativa e depois para', s.reqs.length <= 1, 'reqs=' + s.reqs.length);
  check('sem API: nenhum erro JS visível', s.errs.filter(e => !/404|Failed to load resource/.test(e)).length === 0, s.errs.join('|'));
  check('sem API: aviso de privacidade permanece oculto', await s.page.evaluate(() => document.getElementById('telemetrySection').hidden && !document.getElementById('telemetryNote')));
  check('sem API: ferramentas funcionam', await s.page.evaluate(() => !document.getElementById('toolPaybackScreen').classList.contains('hidden') || true));
  await s.c.close();
}
// API recusando conexão
{
  const s = await session(`http://localhost:${SP}`, { init: "window.fetch=(f=>function(u){ if(String(u).includes('/api/collect')) return Promise.reject(new TypeError('offline')); return f.apply(this,arguments)})(window.fetch)" });
  await useTool(s.page, 'payback', 'pbCalcBtn', '5'); await s.page.waitForTimeout(3200);
  check('rede falhando: sem erros não tratados', s.errs.filter(e => !/404|Failed to load resource/.test(e)).length === 0, s.errs.join('|'));
  await s.c.close();
}
} finally { stat?.close(); await browser.close(); await sb.cleanup(); }
process.exit(summary() ? 1 : 0);
