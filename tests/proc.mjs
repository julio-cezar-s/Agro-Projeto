// Utilitários de processos. SEM efeitos colaterais ao importar.
import { spawnSync } from 'node:child_process';
import { IS_WIN } from './paths.mjs';

// Um teste só é "ok" se terminou com status 0, sem sinal e sem erro de spawn.
// (spawn/spawnSync devolvem status null quando o filho morre por sinal ou não inicia.)
export function testFailed(r) { return !r || !!r.error || !!r.signal || r.status !== 0; }

// POSIX: tabela de processos [{pid,pgid,args}]; null se indisponível (Windows ou sem `ps`).
export function psTable() {
  if (IS_WIN) return null;
  const r = spawnSync('ps', ['-A', '-o', 'pid=,pgid=,stat=,args='], { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  // Zumbis (stat Z) já morreram e só aguardam o init recolher: não contam como membros vivos do grupo.
  return r.stdout.split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l)).filter(m => m && !m[3].startsWith('Z')).map(m => ({ pid: +m[1], pgid: +m[2], args: m[4] }));
}
export function groupMembers(pgid) { const t = psTable(); return t ? t.filter(p => p.pgid === pgid) : null; }
// Existência do PID (um zumbi ainda "existe" até o init recolhê-lo).
export function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

// Encerra a ÁRVORE iniciada por um spawn nosso.
//  - Windows: `taskkill /PID <líder> /T /F` (mata o líder e todos os descendentes; só funciona com o líder vivo,
//    por isso o código chama isto ANTES de o líder terminar sempre que possível).
//  - POSIX: o filho foi criado com detached:true, então pgid === pid do líder e todos os descendentes estão
//    nesse grupo. Sinaliza o GRUPO (process.kill(-pgid)) mesmo que o líder já tenha saído. Com o líder morto,
//    só sinaliza se `ps` confirmar que ainda há membros no grupo (enquanto houver membros o pgid não pode ser
//    reutilizado pelo sistema, então não há risco de atingir outro grupo).
// Retorna true se um sinal foi efetivamente enviado.
export function killTree({ pid, pgid }, signal = 'SIGTERM', { leaderAlive = false } = {}) {
  if (!pid) return false;
  if (IS_WIN) {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    return r.status === 0;
  }
  const g = pgid || pid;
  if (!leaderAlive) {
    const m = groupMembers(g);
    if (m !== null && m.length === 0) return false;
  }
  try { process.kill(-g, signal); return true; }
  catch (e) {
    if (e.code === 'ESRCH') return false;
    if (leaderAlive) { try { process.kill(pid, signal); return true; } catch {} }
    return false;
  }
}
