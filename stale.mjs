// Localiza sandboxes de testes abandonadas (execução morta à força). findStaleSandboxes/formatStale são SOMENTE
// LEITURA: não apagam pastas nem encerram processos. Executado diretamente (`node tests/stale.mjs`) só lista.
// reapOwnedBy() é usada pelo runner apenas quando ele próprio precisou forçar o fim de um teste (veja abaixo).
import { readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_PREFIX, INFO_FILE, IS_WIN } from './paths.mjs';
import { psTable, pidAlive, killTree } from './proc.mjs';

export function findStaleSandboxes() {
  const tmp = realpathSync(tmpdir());
  const table = psTable();
  const out = [];
  for (const name of readdirSync(tmp)) {
    if (!name.startsWith(SANDBOX_PREFIX)) continue;
    const dir = path.join(tmp, name);
    let st; try { st = statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    let info = null; try { info = JSON.parse(readFileSync(path.join(dir, INFO_FILE), 'utf8')); } catch {}
    const workers = (info?.workers || []).map(w => {
      let alive = false, confirmed = false;
      if (!IS_WIN && table && w.pgid) {
        const m = table.filter(p => p.pgid === w.pgid);
        alive = m.length > 0;
        // A linha de comando do `wrangler dev` contém `--persist-to <sandbox>/state`: é a prova de que o grupo é do teste.
        confirmed = m.some(p => p.args.includes(dir));
      } else if (IS_WIN) alive = pidAlive(w.pid);
      return { ...w, alive, confirmed };
    });
    out.push({ dir, ageMin: Math.round((Date.now() - st.mtimeMs) / 60000), createdAt: info?.createdAt ?? null, ownerPid: info?.ownerPid ?? null, ownerAlive: info?.ownerPid ? pidAlive(info.ownerPid) : null, test: info?.test ?? null, hasInfo: !!info, workers });
  }
  return out;
}

export function formatStale(list) {
  const L = [`Aviso: ${list.length} pasta(s) de teste em ${realpathSync(tmpdir())} (${SANDBOX_PREFIX}*). Nada foi apagado nem encerrado automaticamente.`];
  for (const s of list) {
    L.push(`  - ${s.dir}`);
    L.push(`    idade: ${s.ageMin} min | teste: ${s.test ?? 'desconhecido'} | registro ${INFO_FILE}: ${s.hasInfo ? 'sim' : 'ausente'}`);
    if (s.ownerPid) L.push(`    processo dono: PID ${s.ownerPid} (${s.ownerAlive ? 'ainda existe — pode estar em uso por outra execução' : 'não existe mais — provável abandono'})`);
    for (const w of s.workers) {
      const st = w.alive ? (IS_WIN ? 'PID existe (confirme a linha de comando antes de encerrar)' : (w.confirmed ? 'ATIVO e confirmado como deste teste' : 'grupo ativo, mas SEM confirmação de que é deste teste')) : 'não está mais ativo';
      L.push(`    wrangler dev PID ${w.pid}${w.pgid ? ' / grupo ' + w.pgid : ''} porta ${w.port}: ${st}`);
      if (w.alive && w.confirmed && !IS_WIN) L.push(`      para encerrar manualmente: kill -TERM -- -${w.pgid}`);
      if (w.alive && IS_WIN) L.push(`      para conferir: Get-CimInstance Win32_Process -Filter "ProcessId=${w.pid}" | Select-Object CommandLine   (deve conter ${s.dir})  e então: taskkill /PID ${w.pid} /T /F`);
    }
    if (!s.workers.some(w => w.alive)) L.push('    sem processos ativos registrados: a pasta pode ser removida manualmente se o dono não existir mais.');
  }
  return L.join('\n');
}

// Usada SÓ pelo runner, depois de forçar (SIGKILL/taskkill) o fim de um teste que não terminou sozinho:
// encerra apenas os grupos do `wrangler dev` que (1) estão registrados em sandbox.json cujo ownerPid é o teste
// que o runner acabou de matar e (2) têm, na linha de comando, o caminho da sandbox (prova de que são dos testes).
// Sem confirmação (inclusive no Windows, onde não há essa prova) nada é encerrado: apenas se informa.
export function reapOwnedBy(ownerPid) {
  const done = [], skipped = [];
  for (const s of findStaleSandboxes()) {
    if (s.ownerPid !== ownerPid) continue;
    for (const w of s.workers) {
      if (!w.alive) continue;
      if (w.confirmed && !IS_WIN) { if (killTree({ pid: w.pid, pgid: w.pgid }, 'SIGKILL', { leaderAlive: false })) done.push(`${s.dir} (grupo ${w.pgid})`); }
      else skipped.push(`${s.dir} (PID ${w.pid}) — sem confirmação automática`);
    }
  }
  return { done, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const l = findStaleSandboxes();
  console.log(l.length ? formatStale(l) : 'Nenhuma sandbox de teste antiga encontrada.');
}
