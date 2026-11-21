// `npm test` — seguro por padrão.
// Este runner NÃO cria, altera nem apaga nada na pasta do projeto, e NÃO importa tests/lib.mjs (que instala
// handlers de sinal): ele tem os seus próprios, só durante a execução. Cada teste usa uma sandbox temporária.
// Antes e depois ele confere que .dev.vars e os demais arquivos importantes da raiz não mudaram.
// Não há variável de ambiente que desative estas proteções.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT } from './paths.mjs';
import { snapshotRoot, compareRoot } from './rootguard.mjs';
import { findStaleSandboxes, formatStale } from './stale.mjs';
import { runSequence } from './runner-core.mjs';

const fail = msg => { console.error('\n✖ ' + msg + '\n'); process.exit(2); };

// 1. Pré-requisitos (somente leitura)
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 12)) fail(`Node.js ${process.versions.node} não atende: use Node.js 22.12 ou mais novo.`);
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const local = n => { try { return JSON.parse(readFileSync(path.join(ROOT, 'node_modules', n, 'package.json'), 'utf8')).version; } catch { return null; } };
for (const n of ['wrangler', 'playwright']) {
  const want = pkg.devDependencies?.[n], have = local(n);
  if (!have) fail(`Dependência "${n}" não instalada neste projeto. Rode: npm ci`);
  if (have !== want) fail(`"${n}" instalado é ${have}, mas o package.json fixa ${want}. Rode: npm ci`);
}

// 2. Chromium: prova real, no MESMO modo do teste (headless). Abrir e fechar um navegador só cria um perfil
//    temporário do próprio Playwright no diretório temporário do sistema; nada no projeto.
{
  const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
  let browser = null, aborted = false;
  const onSig = async sig => { aborted = true; console.error(`\n${sig}: interrompendo...`); try { await browser?.close(); } catch {} process.exit(130); };
  const sigs = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const s of sigs) process.on(s, onSig);
  try {
    browser = await Promise.race([
      chromium.launch({ headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado ao abrir o navegador')), 60000)),
    ]);
    await browser.close(); browser = null;
  } catch (e) {
    try { await browser?.close(); } catch {}
    fail(`Não foi possível abrir o Chromium headless do Playwright (${String(e.message || e).split('\n')[0]}).\nRode: npx playwright install chromium`);
  } finally { for (const s of sigs) process.off(s, onSig); }
  if (aborted) process.exit(130);
}

// 3. Informa (sem apagar nem encerrar nada) sobre sandboxes de execuções interrompidas à força
const stale = findStaleSandboxes();
if (stale.length) console.warn(formatStale(stale));

// 4. Fotografia dos arquivos protegidos da raiz
const before = snapshotRoot();

// 5. Executa cada teste (cada um cria e remove a própria sandbox)
const files = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.test.mjs')).sort();
const { results, interrupted } = await runSequence(files.map(f => ({ name: f, args: [path.join('tests', f)], cwd: ROOT })));

// 6. Confere a raiz (também depois de uma interrupção)
const diffs = compareRoot(before, snapshotRoot());
if (diffs.length) { console.error('\n✖ ALERTA: arquivos protegidos da raiz mudaram durante os testes:\n  ' + diffs.join('\n  ') + '\nInvestigue antes de continuar.'); process.exit(3); }
console.log('\nRaiz do projeto intacta (.dev.vars, configuração, src/, public/, migrations/, tests/ e bancos .wrangler/ presentes).');

const bad = results.filter(r => r.failed);
for (const r of bad) console.error(`✖ ${r.name}: ${r.error ? 'erro ao iniciar (' + r.error.message + ')' : r.signal ? 'morto pelo sinal ' + r.signal : 'status ' + r.status}`);
if (interrupted) { console.error('\nExecução interrompida: ' + results.length + ' de ' + files.length + ' teste(s) executado(s).'); process.exit(130); }
if (results.length !== files.length) { console.error('\n✖ Nem todos os testes foram executados.'); process.exit(1); }
process.exit(bad.length ? 1 : 0);
