import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildWorkflow, connectTelegram, prepareSignatureCode, readOrCreateConfig, validateEventCode, verificationCode } from './build-oura-workflow.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runCode = async (code, item, context = {}) => {
  const execute = new AsyncFunction('$input', code);
  return execute.call(context, { first: () => item });
};

const now = Date.now().toString();
const payload = { event_type: 'create', data_type: 'sleep', object_id: 'abc-123', user_id: 'user-1', event_time: '2026-09-22T12:00:00Z' };
const rawBody = JSON.stringify(payload);
const secret = 'test-webhook-secret';
const signature = createHmac('sha256', secret).update(now + rawBody).digest('hex');

const verification = verificationCode.replace('__VERIFICATION_TOKEN__', 'token');
assert.deepEqual(await runCode(verification, { json: { query: { verification_token: 'token', challenge: 'challenge-value' } } }), [{ json: { statusCode: 200, response: { challenge: 'challenge-value' } } }]);
assert.equal((await runCode(verification, { json: { query: { verification_token: 'wrong', challenge: 'challenge-value' } } }))[0].json.statusCode, 401);

const prepared = await runCode(prepareSignatureCode, { json: { headers: { 'x-oura-timestamp': now, 'X-Oura-Signature': signature }, body: payload } }, {
  helpers: { getBinaryDataBuffer: async () => Buffer.from(rawBody, 'utf8') },
});
assert.equal(prepared[0].json.signature_payload, now + rawBody);
assert.deepEqual(prepared[0].json.body, payload);
assert.equal(typeof prepared[0].json.received_at, 'string');

const validate = (overrides = {}) => runCode(validateEventCode, { json: { ...prepared[0].json, calculated_signature: signature, ...overrides } });
assert.equal((await validate())[0].json.accepted, true);
assert.equal((await validate({ signature: '' }))[0].json.statusCode, 401);
assert.equal((await validate({ signature: signature.replace(/^./, '0') }))[0].json.statusCode, 401);
assert.equal((await validate({ timestamp: String(Number(now) - 301000) }))[0].json.statusCode, 401);
assert.equal((await validate({ timestamp: String(Number(now) + 301000) }))[0].json.statusCode, 401);
assert.equal((await validate({ timestamp: String(Math.floor(Number(now) / 1000)) }))[0].json.statusCode, 401);
// Actual Oura header from execution 81812; freeze receipt time to avoid aging the fixture.
const replay = new AsyncFunction('$input', 'Date', validateEventCode);
assert.equal((await replay({ first: () => ({ json: { ...prepared[0].json,
  timestamp: '1790138124521', calculated_signature: signature,
} }) }, { now: () => Date.parse('2026-09-23T04:35:26.187Z') }))[0].json.accepted, true);
assert.equal((await validate({ body: { ...payload, data_type: 'readiness' } }))[0].json.statusCode, 400);
assert.equal((await validate({ body: { ...payload, object_id: '../../secrets' } }))[0].json.statusCode, 400);

const workflow = buildWorkflow({ verificationToken: 'token', callbackPath: 'oura-events-test' });
assert.equal(workflow.name, 'Oura Ring');
assert.equal(workflow.active, false);
assert.equal(workflow.nodes.find((entry) => entry.name === 'Receive Oura Event').parameters.options.rawBody, true);
assert.match(workflow.nodes.find((entry) => entry.name === 'Fetch Oura Record').parameters.url, /encodeURIComponent/);
assert.equal(workflow.nodes.find((entry) => entry.name === 'Calculate Oura HMAC').credentials.crypto.name, 'Oura Webhook HMAC');

const bridgeConfig={userId:123,appUrl:'https://example.test/oura-status',headerCredential:{id:'credential-id',name:'Oura Status Bridge'}};
const bridge=connectTelegram(workflow,bridgeConfig);
assert.equal(bridge.nodes.length,15);
assert.equal(workflow.nodes.length,11);
assert.deepEqual(connectTelegram(bridge,bridgeConfig),bridge);
assert.equal(bridge.nodes.find(n=>n.name==='Poll Oura Every 30 Minutes').parameters.rule.interval[0].minutesInterval,30);
assert.deepEqual(bridge.nodes.find(n=>n.name==='Check Latest Heart Rate').credentials,workflow.nodes.find(n=>n.name==='Fetch Oura Record').credentials);
assert.equal(bridge.connections['Summarize Oura Event'].main[0][0].node,'Update Telegram From Event');
assert.equal(bridge.connections['Check Latest Heart Rate'].main[0][0].node,'Update Telegram From Heart Rate');
for(const name of ['Update Telegram From Event','Update Telegram From Heart Rate']){
  const entry=bridge.nodes.find(n=>n.name===name);
  assert.equal(entry.parameters.url,'https://example.test/oura-status/api/oura');
  assert.deepEqual(entry.credentials.httpHeaderAuth,bridgeConfig.headerCredential);
}

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'oura-webhook-test-'));
const configPath = path.join(temporaryDirectory, 'oura-webhooks.local.json');
try {
  const initialConfig = await readOrCreateConfig(configPath);
  const reusedConfig = await readOrCreateConfig(configPath);
  assert.deepEqual(reusedConfig, initialConfig);
  assert.match(initialConfig.verificationToken, /^[a-f0-9]{64}$/);
  assert.match(initialConfig.callbackPath, /^oura-events-[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(initialConfig).sort(), ['callbackPath', 'verificationToken']);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log('oura webhook workflow tests passed');
