/**
 * Runs Wrangler's local Durable Object runtime and tests real HTTP/RPC/SQLite.
 * No Cloudflare API token, provider API key or paid model call is required.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';

const token = 'test-only-local-secret-not-for-production-987654321';
const varsFile = '.dev.vars';
const port = 18789;
const base = 'http://127.0.0.1:' + port;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let output = '';
let server;

async function fetchJson(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, body: data };
}
async function waitUntil(predicate, maxMs, desc) {
  const until = Date.now() + maxMs;
  let last;
  while (Date.now() < until) {
    try {
      const data = await predicate();
      if (data) return data;
    } catch (e) { last = e; }
    await delay(1200);
  }
  throw new Error('Timeout waiting for ' + desc + (last ? ': ' + last.message : ''));
}
async function main() {
  writeFileSync(varsFile, 'ACCESS_TOKEN=' + token + '\n', { flag: 'wx', mode: 0o600 });
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', '.wrangler/smoke-v02'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  server.stdout.on('data', b => { output = (output + b.toString()).slice(-15000); });
  server.stderr.on('data', b => { output = (output + b.toString()).slice(-15000); });

  await waitUntil(async () => {
    if (server.exitCode !== null) throw new Error('Wrangler exited ' + server.exitCode);
    const res = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
    return res.status === 200 && (await res.text()).includes('Pi Durable Edge');
  }, 40000, 'Wrangler local server');
  console.log('Worker local server: ready');

  const unauthorized = await fetch(base + '/api/state');
  assert.equal(unauthorized.status, 401, 'API must reject requests without Bearer token');
  const css = await fetch(base + '/style.css');
  assert.equal(css.status, 200);
  const page = await fetch(base + '/');
  assert.match(page.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const state = await fetchJson('/api/state');
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.ok(Array.isArray(state.body.messages));
  const model = await fetchJson('/api/model');
  assert.equal(model.status, 200);
  assert.equal(model.body.api, 'faux');

  const badJson = await fetchJson('/api/chat', { method: 'POST', body: '{not-json' });
  assert.equal(badJson.status, 400);
  const badInput = await fetchJson('/api/chat', { method: 'POST', body: JSON.stringify({ text: '', operationId: 'invalid' }) });
  assert.equal(badInput.status, 400);
  const badReminder = await fetchJson('/api/reminders', { method: 'POST', body: JSON.stringify({ text: 'test', seconds: 0 }) });
  assert.equal(badReminder.status, 400);
  const rejectedModel = await fetchJson('/api/model', { method: 'PUT', body: JSON.stringify({
    api: 'openai-completions', baseUrl: 'https://127.0.0.1/v1', model: 'x', apiKey: 'sk-test-token',
    reasoning: false, contextWindow: 128000, maxTokens: 512,
  }) });
  assert.equal(rejectedModel.status, 400);
  console.log('Auth, static assets, model validation and client errors: OK');

  const operationId = 'smoke-' + crypto.randomUUID().replaceAll('-', '');
  const payload = JSON.stringify({ text: 'Cloudflare durability smoke ' + operationId, operationId });
  const first = await fetchJson('/api/chat', { method: 'POST', body: payload });
  assert.equal(first.status, 202, JSON.stringify(first.body));
  assert.equal(first.body.accepted, true);
  const repeated = await fetchJson('/api/chat', { method: 'POST', body: payload });
  assert.equal(repeated.status, 202);
  assert.equal(repeated.body.accepted, false);

  const switchWhileBusy = await fetchJson('/api/model', { method: 'PUT', body: JSON.stringify({ api: 'faux' }) });
  assert.equal(switchWhileBusy.status, 409, 'Model switching must be blocked with running work');

  const reminder = await fetchJson('/api/reminders', { method: 'POST', body: JSON.stringify({ text: 'smoke reminder', seconds: 5 }) });
  assert.equal(reminder.status, 201, JSON.stringify(reminder.body));
  const reminderId = reminder.body.id;

  await waitUntil(async () => {
    const s = await fetchJson('/api/state');
    if (s.status !== 200) throw new Error('state HTTP ' + s.status);
    const i = s.body.messages.findLastIndex(m => m.role === 'user' && m.text.includes(operationId));
    const replied = i >= 0 && s.body.messages.slice(i + 1).some(m =>
      m.role === 'assistant' && m.text.includes('任务完成：Pi Durable'));
    const fired = s.body.reminders.some(m => m.id === reminderId && m.status === 'fired');
    return replied && fired;
  }, 60000, 'Faux durable chat and reminder alarm');
  console.log('PiHarness Faux transcript, idempotency and Agent alarm: OK');
  // Validate actual PiHarness session.setModel + encrypted SQLite config.
  // A fake API key is stored but no external model request is made.
  const apiKey = 'sk-test-not-a-real-provider-key';
  const realModel = {
    api: 'openai-completions', baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini', reasoning: false, contextWindow: 128000,
    maxTokens: 2048, apiKey,
  };
  const saved = await fetchJson('/api/model', { method: 'PUT', body: JSON.stringify(realModel) });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.hasKey, true);
  assert.equal(JSON.stringify(saved.body).includes(apiKey), false);

  const afterSave = await fetchJson('/api/model');
  assert.equal(afterSave.status, 200);
  assert.equal(afterSave.body.model, 'gpt-4.1-mini');
  assert.equal(afterSave.body.hasKey, true);
  assert.equal(JSON.stringify(afterSave.body).includes(apiKey), false);

  const reused = await fetchJson('/api/model', {
    method: 'PUT', body: JSON.stringify({ ...realModel, model: 'gpt-4.1-nano', apiKey: '' }),
  });
  assert.equal(reused.status, 200, JSON.stringify(reused.body));
  assert.equal(reused.body.hasKey, true);

  const reset = await fetchJson('/api/model', { method: 'PUT', body: JSON.stringify({ api: 'faux' }) });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  const afterReset = await fetchJson('/api/model');
  assert.equal(afterReset.body.api, 'faux');
  assert.equal(afterReset.body.hasKey, false);
  console.log('PiHarness live model switching, AES-GCM persistence and Key redaction: OK');

}
try {
  await main();
} catch (error) {
  console.error('Worker smoke test failed:', error.message);
  // Avoid printing any secrets in CI logs.
  console.error('Wrangler output (truncated):', output.replaceAll(token, '[REDACTED]').slice(-8000));
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try {
      if (process.platform === 'win32') server.kill('SIGTERM');
      else process.kill(-server.pid, 'SIGTERM');
    } catch { /* already stopped */ }
  }
  try { unlinkSync(varsFile); } catch { /* not created */ }
}
