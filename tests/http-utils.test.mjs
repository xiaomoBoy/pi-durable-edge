import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientError, readJsonObject, publicError } from '../src/http-utils.js';

const req = (body, headers = { 'content-type': 'application/json' }) =>
  new Request('https://example.com/api/model', { method: 'POST', headers, body });

test('bounded JSON parser accepts a normal object', async () => {
  assert.deepEqual(await readJsonObject(req('{"text":"hello","seconds":5}')), { text: 'hello', seconds: 5 });
});
test('JSON parser rejects arrays, bad JSON and invalid UTF-8', async () => {
  await assert.rejects(() => readJsonObject(req('[]')), { status: 400 });
  await assert.rejects(() => readJsonObject(req('{invalid')), { status: 400 });
  await assert.rejects(() => readJsonObject(req(new Uint8Array([0xff]))), { status: 400 });
});
test('JSON parser enforces content type and actual byte size', async () => {
  await assert.rejects(() => readJsonObject(req('{}', { 'content-type': 'text/plain' })), { status: 415 });
  await assert.rejects(() => readJsonObject(req(JSON.stringify({ text: '中'.repeat(500) })), 300), { status: 413 });
});
test('status mapping never leaks unexpected provider error messages', () => {
  const internal = publicError(new Error('sk-should-not-be-disclosed'));
  assert.equal(internal.status, 500);
  assert.equal(internal.message.includes('sk-should-not-be-disclosed'), false);
  const client = publicError(new ClientError('输入错误'));
  assert.deepEqual(client, { status: 400, message: '输入错误' });
});

test('reconstructed Durable Object RPC client errors preserve safe HTTP status', () => {
  const remote = { name: 'ClientError', code: 'PI_EDGE_CLIENT_ERROR_V1', status: 400, message: '消息长度须为 1–4000 字' };
  assert.deepEqual(publicError(remote), { status: 400, message: remote.message });
  assert.equal(publicError({ ...remote, code: 'fake' }).status, 500);
  assert.equal(publicError({ ...remote, status: 500 }).status, 500);
});
