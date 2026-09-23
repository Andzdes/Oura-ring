import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'D:/Documents/API_Keys/oura-webhooks.local.json';
const DEFAULT_OUTPUT_PATH = 'D:/Documents/API_Keys/oura-webhooks.import.json';

// region workflow-code
export const verificationCode = `
const input = $input.first();
const query = input.json.query ?? {};
const verificationToken = ${JSON.stringify('__VERIFICATION_TOKEN__')};
const challenge = typeof query.challenge === 'string' ? query.challenge : '';
const token = typeof query.verification_token === 'string' ? query.verification_token : '';
const accepted = token.length === verificationToken.length && token === verificationToken && challenge.length > 0;
return [{ json: {
  statusCode: accepted ? 200 : 401,
  response: accepted ? { challenge } : { ok: false, error: 'verification_failed' },
} }];
`;

export const prepareSignatureCode = `
const input = $input.first();
const headers = input.json.headers ?? {};
const header = (name) => {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  const value = key === undefined ? undefined : headers[key];
  return Array.isArray(value) ? value[0] : value;
};
const rawBody = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const timestamp = header('x-oura-timestamp');
const signature = header('x-oura-signature');
return [{ json: {
  headers,
  body: input.json.body,
  raw_body: rawBody,
  received_at: new Date().toISOString(),
  timestamp: typeof timestamp === 'string' ? timestamp : '',
  signature: typeof signature === 'string' ? signature : '',
  signature_payload: String(timestamp ?? '') + rawBody,
} }];
`;

export const validateEventCode = `
const input = $input.first();
const reject = (statusCode, error) => [{ json: {
  accepted: false,
  statusCode,
  response: { ok: false, error },
  received_at: input.json.received_at,
} }];
const safeEqual = (left, right) => {
  let difference = left.length ^ right.length;
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};
const supplied = typeof input.json.signature === 'string' ? input.json.signature.toUpperCase() : '';
const calculated = typeof input.json.calculated_signature === 'string' ? input.json.calculated_signature.toUpperCase() : '';
if (!/^[A-F0-9]{64}$/.test(supplied) || !/^[A-F0-9]{64}$/.test(calculated) || !safeEqual(supplied, calculated)) {
  return reject(401, 'invalid_signature');
}
const timestamp = typeof input.json.timestamp === 'string' ? input.json.timestamp : '';
const timestampSeconds = /^\\d{10}$/.test(timestamp) ? Number(timestamp) : NaN;
if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
  return reject(401, 'invalid_timestamp');
}
const body = input.json.body;
if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(400, 'invalid_event');
const eventType = body.event_type;
const dataType = body.data_type;
const objectId = body.object_id;
const userId = body.user_id;
if (!['create', 'update'].includes(eventType) || !['daily_activity', 'sleep', 'workout'].includes(dataType) ||
    typeof objectId !== 'string' || !/^[A-Za-z0-9-]+$/.test(objectId) || typeof userId !== 'string' || userId.length === 0) {
  return reject(400, 'invalid_event');
}
const event = { event_type: eventType, data_type: dataType, object_id: objectId, user_id: userId, event_time: body.event_time };
return [{ json: {
  accepted: true,
  statusCode: 202,
  response: { ok: true, accepted: true },
  event,
  received_at: input.json.received_at,
} }];
`;

export const summaryCode = `
const input = $input.first();
const source = $('Validate Oura Event').first().json;
return [{ json: {
  event_type: source.event.event_type,
  data_type: source.event.data_type,
  object_id: source.event.object_id,
  event_time: source.event.event_time,
  received_at: source.received_at,
  fetched_at: new Date().toISOString(),
  data: input.json,
  current_state: 'unknown',
} }];
`;
// endregion workflow-code

function node(name, type, typeVersion, position, parameters = {}, credentials) {
  return { id: randomUUID(), name, type, typeVersion, position, parameters, ...(credentials ? { credentials } : {}) };
}

// region workflow-definition
export function buildWorkflow(config) {
  if (!config?.verificationToken || !config?.callbackPath) throw new Error('Missing webhook configuration');
  const pathValue = config.callbackPath;
  const nodes = [
    node('Verify Oura Webhook', 'n8n-nodes-base.webhook', 2, [-920, -180], {
      httpMethod: 'GET', path: pathValue, responseMode: 'responseNode', options: {},
    }),
    node('Verify Oura Challenge', 'n8n-nodes-base.code', 2, [-680, -180], {
      jsCode: verificationCode.replace('__VERIFICATION_TOKEN__', config.verificationToken),
    }),
    node('Respond Oura Verification', 'n8n-nodes-base.respondToWebhook', 1.4, [-440, -180], {
      respondWith: 'json', responseBody: '={{ $json.response }}', options: { responseCode: '={{ $json.statusCode }}' },
    }),
    node('Receive Oura Event', 'n8n-nodes-base.webhook', 2, [-920, 140], {
      httpMethod: 'POST', path: pathValue, responseMode: 'responseNode', options: { rawBody: true },
    }),
    node('Prepare Oura Signature', 'n8n-nodes-base.code', 2, [-680, 140], { jsCode: prepareSignatureCode }),
    node('Calculate Oura HMAC', 'n8n-nodes-base.crypto', 2, [-440, 140], {
      action: 'hmac', binaryData: false, type: 'SHA256', value: '={{ $json.signature_payload }}', dataPropertyName: 'calculated_signature', encoding: 'hex',
    }, { crypto: { name: 'Oura Webhook HMAC' } }),
    node('Validate Oura Event', 'n8n-nodes-base.code', 2, [-200, 140], { jsCode: validateEventCode }),
    node('Respond Oura Event', 'n8n-nodes-base.respondToWebhook', 1.4, [40, 140], {
      respondWith: 'json', responseBody: '={{ $json.response }}', enableResponseOutput: true,
      options: { responseCode: '={{ $json.statusCode }}' },
    }),
    node('Is Accepted Oura Event', 'n8n-nodes-base.if', 2.2, [280, 140], {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: randomUUID(), leftValue: '={{ $json.accepted }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] },
      options: {},
    }),
    node('Fetch Oura Record', 'n8n-nodes-base.httpRequest', 4.2, [520, 80], {
      method: 'GET', url: "={{ 'https://api.ouraring.com/v2/usercollection/' + $json.event.data_type + '/' + encodeURIComponent($json.event.object_id) }}", authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', options: {},
    }, { oAuth2Api: { name: 'Oura Ring' } }),
    node('Summarize Oura Event', 'n8n-nodes-base.code', 2, [760, 80], { jsCode: summaryCode }),
  ];
  const byName = Object.fromEntries(nodes.map((entry) => [entry.name, entry]));
  const connect = (from, to, output = 0) => ({ node: byName[to].name, type: 'main', index: 0, ...(output ? { sourceIndex: output } : {}) });
  return {
    name: 'Oura Ring', active: false, settings: { executionOrder: 'v1', saveExecutionProgress: false, saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
    nodes,
    connections: {
      [byName['Verify Oura Webhook'].name]: { main: [[connect('Verify Oura Webhook', 'Verify Oura Challenge')]] },
      [byName['Verify Oura Challenge'].name]: { main: [[connect('Verify Oura Challenge', 'Respond Oura Verification')]] },
      [byName['Receive Oura Event'].name]: { main: [[connect('Receive Oura Event', 'Prepare Oura Signature')]] },
      [byName['Prepare Oura Signature'].name]: { main: [[connect('Prepare Oura Signature', 'Calculate Oura HMAC')]] },
      [byName['Calculate Oura HMAC'].name]: { main: [[connect('Calculate Oura HMAC', 'Validate Oura Event')]] },
      [byName['Validate Oura Event'].name]: { main: [[connect('Validate Oura Event', 'Respond Oura Event')]] },
      [byName['Respond Oura Event'].name]: { main: [[connect('Respond Oura Event', 'Is Accepted Oura Event')]] },
      [byName['Is Accepted Oura Event'].name]: { main: [[connect('Is Accepted Oura Event', 'Fetch Oura Record')], []] },
      [byName['Fetch Oura Record'].name]: { main: [[connect('Fetch Oura Record', 'Summarize Oura Event')]] },
    },
    pinData: {},
    versionId: randomUUID(),
  };
}
// endregion workflow-definition

export async function readOrCreateConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    if (typeof config.verificationToken !== 'string' || typeof config.callbackPath !== 'string') throw new Error('invalid config');
    return config;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`Cannot read ${configPath}: ${error.message}`);
    const config = { verificationToken: randomBytes(32).toString('hex'), callbackPath: `oura-events-${randomUUID()}` };
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return config;
  }
}

export async function main({ configPath = DEFAULT_CONFIG_PATH, outputPath = DEFAULT_OUTPUT_PATH } = {}) {
  const config = await readOrCreateConfig(configPath);
  const workflow = buildWorkflow(config);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
  return { outputPath, callbackPath: config.callbackPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(({ outputPath, callbackPath }) => {
    console.log(`Created workflow import: ${outputPath}`);
    console.log(`Callback path: ${callbackPath}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
