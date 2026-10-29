import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { temporary } from './temp';

test('manual recovery checks the native endpoint and delegates without changing Tunnel identity', { skip: process.platform !== 'win32' }, async context => {
  const root = await temporary(context), scripts = path.join(root, 'scripts');
  await fs.mkdir(scripts); await fs.mkdir(path.join(root, '.local'));
  const script = path.join(scripts, 'manual-start-mcp.ps1'), calls = path.join(root, 'calls.json');
  await fs.copyFile(new URL('../scripts/manual-start-mcp.ps1', import.meta.url), script);
  await fs.writeFile(path.join(scripts, 'tunnel.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)));`);
  const endpoint = path.join(root, 'endpoint.json');
  const launcher = { command: process.execPath, args: [], cwd: root, env: { WEBOBSIDIAN_ENDPOINT_FILE: endpoint } };
  await fs.writeFile(path.join(root, '.local', 'mcp-launcher.json'), JSON.stringify(launcher));
  const run = (action: string) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-NodeExe', process.execPath, '-Action', action], { windowsHide: true });
    let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    child.once('error', reject); child.once('close', code => resolve({ code, output }));
  });
  await fs.writeFile(endpoint, JSON.stringify({ protocol: 1, url: 'http://127.0.0.1:1' }));
  const unavailable = await run('Restart');
  assert.equal(unavailable.code, 1, unavailable.output);
  assert.match(unavailable.output, /Tunnel was not restarted/);
  await assert.rejects(fs.access(calls));
  assert.equal((await run('Stop')).code, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(calls, 'utf8')), ['stop']);
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/healthz'); response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as import('node:net').AddressInfo;
    await fs.writeFile(endpoint, JSON.stringify({ protocol: 1, url: `http://127.0.0.1:${address.port}` }));
    for (const action of ['Start', 'Status', 'Restart']) {
      const result = await run(action); assert.equal(result.code, 0, result.output);
      assert.deepEqual(JSON.parse(await fs.readFile(calls, 'utf8')), [action.toLowerCase()]);
    }
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, '.local', 'mcp-launcher.json'), 'utf8')), launcher);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
