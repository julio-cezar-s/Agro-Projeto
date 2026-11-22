// Executa uma sequência de comandos Node, um de cada vez, com tratamento de interrupção.
// Importar este arquivo NÃO instala nada: os handlers de sinal só existem enquanto runSequence() roda.
import { spawn } from 'node:child_process';
import { IS_WIN } from './paths.mjs';
import { testFailed, killTree } from './proc.mjs';
import { reapOwnedBy } from './stale.mjs';

// cmds: [{ name, args, cwd }]  ->  { results: [{ name, status, signal, error, failed }], interrupted }
export function runSequence(cmds, { log = console.log, graceMs = 15000 } = {}) {
  return new Promise(resolve => {
    const results = [];
    let i = 0, child = null, interrupted = false, timer = null;
    const handlers = {};

    const finish = () => {
      for (const [s, h] of Object.entries(handlers)) process.off(s, h);
      clearTimeout(timer);
      resolve({ results, interrupted });
    };
    const force = () => {
      if (!child) return;
      const pid = child.pid;
      if (IS_WIN) killTree({ pid }, 'SIGKILL', { leaderAlive: true });   // taskkill /T /F: mata também os descendentes
      else child.kill('SIGKILL');
      const r = reapOwnedBy(pid);                                         // só o que for confirmado como dos testes
      if (r.done.length) log('Encerrados (confirmados como dos testes): ' + r.done.join('; '));
      if (r.skipped.length) log('NÃO encerrados (sem confirmação): ' + r.skipped.join('; ') + '\nVeja: node tests/stale.mjs');
    };
    const onSignal = sig => {
      if (interrupted) { force(); return; }                               // 2º sinal = forçar já
      interrupted = true;
      log(`\n${sig} recebido: interrompendo (nenhum teste novo será iniciado)...`);
      if (!child) return finish();
      if (IS_WIN) { if (sig !== 'SIGINT') killTree({ pid: child.pid }, 'SIGKILL', { leaderAlive: true }); }  // no Ctrl+C o console já avisou o filho
      else child.kill('SIGTERM');                                         // o handler do teste limpa a própria sandbox
      timer = setTimeout(force, graceMs);
    };
    for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) { handlers[s] = () => onSignal(s); process.on(s, handlers[s]); }

    const next = () => {
      if (interrupted || i >= cmds.length) return finish();
      const c = cmds[i++];
      log('\n== ' + c.name);
      const r = { name: c.name, status: null, signal: null, error: null, failed: true };
      let settled = false;
      const end = () => { if (settled) return; settled = true; r.failed = testFailed(r); results.push(r); child = null; clearTimeout(timer); next(); };
      child = spawn(process.execPath, c.args, { cwd: c.cwd, stdio: 'inherit' });
      child.once('error', e => { r.error = e; if (child && child.pid === undefined) end(); });
      child.once('close', (status, signal) => { r.status = status; r.signal = signal; end(); });
    };
    next();
  });
}
