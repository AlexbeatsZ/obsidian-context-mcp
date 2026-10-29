import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import vm from 'node:vm';

const source = (await readFile(new URL('../scripts/tunnel.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.dirname', JSON.stringify(path.resolve('fixture/scripts')));

async function fixture(state: unknown, disconnectCode = 0, timedOut = false) {
  const calls: string[][] = [], messages: string[] = [];
  let statusCalls = 0, credentialReads = 0;
  const processState = { argv: ['node', 'tunnel.mjs', 'connect'], env: { OPENAI_API_KEY: 'parent-key' }, execPath: process.execPath, exitCode: 0,
    exit: () => { throw new Error('fixture-exit'); } };
  let error: unknown;
  try {
    await vm.runInNewContext(`(async () => { ${source} })()`, {
      path, process: processState,
      fs: { access: async () => {}, readFile: async (file: string) => {
        if (file.endsWith('tunnel.json')) return JSON.stringify({ client: 'fixture-client', alias: 'fixture', tunnel_id: 'fixture-id', credential_source: 'fixture.env' });
        credentialReads++; return 'CONTROL_PLANE_API_KEY=fixture-key';
      } },
      console: { log: (message: string) => messages.push(message), error: (message: string) => messages.push(message) },
      execFile: (_client: string, args: string[], options: any, callback: Function) => {
        statusCalls++; assert.deepEqual(Array.from(args), ['runtimes', 'status', 'fixture', '--json']);
        assert.equal(options.timeout, 10000); assert.equal(options.windowsHide, true);
        assert.equal(options.env.OPENAI_API_KEY, undefined);
        queueMicrotask(() => callback(timedOut ? { killed: true } : null, typeof state === 'string' ? state : JSON.stringify(state)));
      },
      spawn: (_client: string, args: string[], options: any) => {
        calls.push(Array.from(args)); assert.equal(options.env.CONTROL_PLANE_API_KEY, 'fixture-key');
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', args[1] === 'disconnect' ? disconnectCode : 0));
        return child;
      },
    });
  } catch (reason) { if (!(reason instanceof Error && reason.message === 'fixture-exit') && String(reason) !== 'Error: fixture-exit') error = reason; }
  return { calls, messages, statusCalls, credentialReads, error, code: processState.exitCode };
}

test('manual connect checks once and leaves a healthy existing runtime untouched', async () => {
  const result = await fixture({ ready: true, healthy: true, process_running: true, stale: false });
  assert.equal(result.error, undefined); assert.equal(result.statusCalls, 1);
  assert.equal(result.credentialReads, 0); assert.deepEqual(result.calls, []);
  assert.match(result.messages.join('\n'), /Already connected/);
});

test('manual connect starts a stopped runtime without disconnecting it', async () => {
  const result = await fixture({ ready: false, healthy: false, process_running: false });
  assert.equal(result.error, undefined); assert.equal(result.statusCalls, 1);
  assert.equal(result.calls.length, 1); assert.equal(result.calls[0][1], 'connect');
});

test('manual connect repairs a running unhealthy or stale runtime with one stop/start', async () => {
  for (const state of [{ ready: false, healthy: false, process_running: true }, { ready: true, healthy: true, process_running: true, stale: true }]) {
    const result = await fixture(state);
    assert.equal(result.error, undefined); assert.equal(result.statusCalls, 1);
    assert.deepEqual(result.calls.map(args => args[1]), ['disconnect', 'connect']);
  }
});

test('manual connect never starts another runtime when stopping the old one fails', async () => {
  const result = await fixture({ ready: false, healthy: false, process_running: true }, 1);
  assert.match(String(result.error), /stop failed/);
  assert.deepEqual(result.calls.map(args => args[1]), ['disconnect']);
  assert.equal(result.statusCalls, 1);
});

test('manual connect refuses malformed or timed-out status without modifying a runtime', async () => {
  for (const [state, timeout] of [['not json', false], [{}, false], [{ ready: false, process_running: true }, true]] as const) {
    const result = await fixture(state, 0, timeout);
    assert.match(String(result.error), /no connection was changed/);
    assert.deepEqual(result.calls, []); assert.equal(result.statusCalls, 1); assert.equal(result.credentialReads, 0);
  }
});
