// Infraestrutura de testes com ISOLAMENTO TOTAL.
//
// Garantias deste arquivo (os testes não precisam repeti-las):
//  - Todo teste roda numa "sandbox": pasta nova em os.tmpdir() (agro-projeto-test-XXXX) com uma CÓPIA de
//    wrangler.toml, src/, public/ e migrations/. O projeto original só é LIDO.
//  - O wrangler roda com cwd = sandbox. O `.dev.vars` e o banco D1 local dos testes ficam DENTRO da sandbox;
//    o `.dev.vars` e o `.wrangler/` da raiz nunca são tocados. Não existe variável de ambiente nem flag que
//    desligue isso.
//  - Logs e registro do wrangler também ficam na sandbox (WRANGLER_LOG_PATH, WRANGLER_REGISTRY_PATH, XDG_CONFIG_HOME).
//  - cwd, env e --persist-to são fixos: não há como um teste sobrescrevê-los. Os argumentos extras do Worker
//    aceitam somente pares `--var NOME:valor`.
//  - Só são encerrados processos iniciados por esta sandbox (grupo de processos próprio no Linux/macOS;
//    `taskkill /T` no Windows). Sem pkill.
//  - A sandbox é apagada ao final, inclusive em falha, Ctrl+C, SIGTERM e SIGHUP. Em morte à força (SIGKILL,
//    queda de energia) a pasta fica com `sandbox.json` descrevendo os processos; tests/stale.mjs a localiza.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, renameSync, rmSync, realpathSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { ROOT, SANDBOX_PREFIX, INFO_FILE, WRANGLER, DB_NAME, IS_WIN } from './paths.mjs';
import { killTree, groupMembers } from './proc.mjs';

export { ROOT };

const sandboxes = new Set();

function inside(child, parent) { return child === parent || child.startsWith(parent + path.sep); }

// Recusa qualquer pasta que não seja uma sandbox criada por este arquivo, fora do projeto.
function assertSandbox(dir) {
  const real = realpathSync(dir);
  const tmp = realpathSync(tmpdir());
  if (path.dirname(real) !== tmp || !path.basename(real).startsWith(SANDBOX_PREFIX)) throw new Error('Pasta fora da área de testes: ' + real);
  if (inside(real, ROOT) || inside(ROOT, real)) throw new Error('A sandbox não pode estar dentro (nem conter) o projeto: ' + real);
  return real;
}

// Argumentos extras do `wrangler dev`: SOMENTE `--var NOME:valor`. Qualquer outra coisa (--persist-to, --config,
// --env-file, --remote, -c, --cwd...) é recusada antes de iniciar qualquer processo.
export function validateWorkerArgs(extra) {
  if (!Array.isArray(extra) || extra.length % 2) throw new Error('Argumentos do Worker de teste inválidos (use pares --var NOME:valor).');
  for (let i = 0; i < extra.length; i += 2) {
    if (extra[i] !== '--var' || !/^[A-Za-z_][A-Za-z0-9_]*:\S*$/.test(String(extra[i + 1] ?? ''))) {
      throw new Error(`Argumento não permitido para o Worker de teste: ${extra[i]} ${extra[i + 1] ?? ''}`.trim());
    }
  }
  return extra;
}

export function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

function waitUntil(fn, ms) {
  return new Promise(res => {
    const t0 = Date.now();
    const tick = () => { if (fn()) return res(true); if (Date.now() - t0 >= ms) return res(false); setTimeout(tick, 100); };
    tick();
  });
}

export function createSandbox() {
  const dir = assertSandbox(mkdtempSync(path.join(realpathSync(tmpdir()), SANDBOX_PREFIX)));
  const state = path.join(dir, 'state');
  const wlogs = path.join(dir, 'wrangler-logs');
  const wreg = path.join(dir, 'wrangler-registry');
  const xdg = path.join(dir, 'xdg-config');
  const recs = [];
  let removed = false;
  const info = { version: 1, createdAt: new Date().toISOString(), ownerPid: process.pid, test: process.argv[1] ? path.basename(process.argv[1]) : null, platform: process.platform, workers: [] };
  const writeInfo = () => {
    try { const f = path.join(assertSandbox(dir), INFO_FILE); writeFileSync(f + '.tmp', JSON.stringify(info, null, 1)); renameSync(f + '.tmp', f); } catch {}
  };

  try {
    cpSync(path.join(ROOT, 'wrangler.toml'), path.join(dir, 'wrangler.toml'));
    for (const d of ['src', 'public', 'migrations']) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
    for (const d of [state, wlogs, wreg, xdg]) mkdirSync(d);
  } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
  writeInfo();

  // Ambiente fixo do wrangler: sem credenciais Cloudflare, sem WRANGLER_* do usuário, e com logs/registro/config na sandbox.
  const env = () => {
    const e = { ...process.env, NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1' };
    for (const k of Object.keys(e)) if (/^(CLOUDFLARE_|CF_|WRANGLER_)/.test(k)) delete e[k];
    return Object.assign(e, { WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: wlogs, WRANGLER_REGISTRY_PATH: wreg, XDG_CONFIG_HOME: xdg });
  };

  // Único ponto que executa o wrangler de forma síncrona: cwd, env e --persist-to não são configuráveis de fora.
  const exec = args => {
    assertSandbox(dir);
    return execFileSync(process.execPath, [WRANGLER, ...args], { cwd: dir, env: env(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 64 * 1024 * 1024 }).toString();
  };

  const leaderAlive = r => !r.exited;
  const gone = r => r.exited && (IS_WIN || (groupMembers(r.pgid || r.pid) ?? []).length === 0);
  async function stopRec(r) {
    if (gone(r)) return;
    killTree(r, IS_WIN ? 'SIGKILL' : 'SIGTERM', { leaderAlive: leaderAlive(r) });
    if (!(await waitUntil(() => gone(r), 5000))) {
      killTree(r, 'SIGKILL', { leaderAlive: leaderAlive(r) });
      await waitUntil(() => gone(r), 3000);
    }
    const w = info.workers.find(x => x.pid === r.pid); if (w) w.stoppedAt = new Date().toISOString();
  }
  function removeDir() {
    if (removed) return;
    try {
      assertSandbox(dir);
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      removed = true; sandboxes.delete(sb);
    } catch (e) {
      info.cleanupFailed = String(e && e.message || e); writeInfo();
      console.error(`Aviso: não foi possível remover ${dir} (${info.cleanupFailed}). Veja ${INFO_FILE} e rode: node tests/stale.mjs`);
    }
  }

  const sb = {
    dir,
    // Variáveis do Worker: o `.dev.vars` DESTA sandbox (nunca o da raiz).
    writeVars(vars) {
      const file = path.join(assertSandbox(dir), '.dev.vars');
      writeFileSync(file, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    },
    env,
    // SQL sempre contra o D1 LOCAL desta sandbox (--local + --persist-to dentro da sandbox).
    d1(sql, json = false) {
      const o = exec(['d1', 'execute', DB_NAME, '--local', '--persist-to', state, ...(json ? ['--json'] : []), '--command', String(sql)]);
      return json ? JSON.parse(o)[0].results : o;
    },
    // Aplica as migrations (cópia) somente no banco temporário, em ordem alfabética.
    migrate() {
      const files = readdirSync(path.join(dir, 'migrations')).filter(f => f.endsWith('.sql')).sort();
      if (!files.length) throw new Error('Nenhuma migration encontrada');
      for (const f of files) exec(['d1', 'execute', DB_NAME, '--local', '--persist-to', state, '--file', path.join('migrations', f)]);
    },
    async startWorker(extra = []) {
      validateWorkerArgs(extra);
      assertSandbox(dir);
      const port = await freePort();
      const p = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(port), '--local', '--persist-to', state, ...extra], { cwd: dir, stdio: 'pipe', detached: !IS_WIN, env: env() });
      const r = { child: p, pid: p.pid, pgid: IS_WIN ? null : p.pid, port, exited: false };
      p.once('exit', () => { r.exited = true; });
      p.once('error', () => { r.exited = true; });
      recs.push(r);
      info.workers.push({ pid: r.pid, pgid: r.pgid, port, startedAt: new Date().toISOString() }); writeInfo();
      let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
      const w = { base: `http://localhost:${port}`, log: () => log, stop: () => stopRec(r) };
      for (let i = 0; i < 120; i++) {
        if (r.exited) break;
        try { if ((await fetch(`${w.base}/AgroPainel.html`)).ok) return w; } catch {}
        await new Promise(res => setTimeout(res, 500));
      }
      await stopRec(r);
      throw new Error('O Worker de teste não iniciou. Log:\n' + log.slice(-2000));
    },
    async cleanup() {
      for (const r of recs) { try { await stopRec(r); } catch {} }
      removeDir();
    },
    cleanupSync() {
      for (const r of recs) { try { killTree(r, 'SIGKILL', { leaderAlive: leaderAlive(r) }); } catch {} }
      removeDir();
    },
  };
  sandboxes.add(sb);
  return sb;
}

// Rede de segurança: limpa as sandboxes mesmo em erro não tratado, Ctrl+C, SIGTERM, SIGHUP, SIGQUIT e Ctrl+Break.
// (Importar este arquivo instala estes handlers; o runner NÃO o importa de propósito.)
const cleanAll = () => { for (const s of [...sandboxes]) s.cleanupSync(); };
process.on('exit', cleanAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGBREAK']) {
  try { process.on(sig, () => { cleanAll(); process.exit(130); }); } catch {}
}

let pass = 0, fail = 0;
export function check(name, cond, info = '') { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, info); } }
export function summary() { console.log(`\nPassou ${pass} / Falhou ${fail}`); return fail; }
