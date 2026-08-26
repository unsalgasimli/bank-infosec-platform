/**
 * Read-only post-deploy gate for a bank-approved release endpoint.
 * It deliberately verifies public health/metrics only: state-changing workflow,
 * malware, failover, and restore drills remain controlled change activities.
 */
const baseUrlValue = process.env.AEGIS_RELEASE_URL;
const allowInsecure = process.env.ALLOW_INSECURE_LOCAL_RELEASE_PROBE === 'true';

if (!baseUrlValue) {
  throw new Error('AEGIS_RELEASE_URL is required, for example https://aegissec.bank.internal');
}

const baseUrl = new URL(baseUrlValue);
if (baseUrl.protocol !== 'https:' && !allowInsecure) {
  throw new Error('AEGIS_RELEASE_URL must use HTTPS. Set ALLOW_INSECURE_LOCAL_RELEASE_PROBE=true only for an isolated local probe.');
}

const readResponse = async (path, expectedStatus, expectedContentType) => {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    headers: { accept: expectedContentType },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}; expected ${expectedStatus}.`);
  }
  return { url: url.toString(), headers: response.headers, body };
};

const parseHealth = (path, body) => {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${path} did not return valid JSON.`);
  }
  if (payload.status !== 'UP') throw new Error(`${path} reports ${String(payload.status)}.`);
  return payload;
};

const live = await readResponse('/api/health/live', 200, 'application/json');
const livePayload = parseHealth('/api/health/live', live.body);
if (livePayload.service !== 'aegissec-banking-platform') {
  throw new Error('Liveness endpoint did not identify the expected AegisSec service.');
}

const readiness = await readResponse('/api/health/ready', 200, 'application/json');
const readinessPayload = parseHealth('/api/health/ready', readiness.body);
for (const name of ['database', 'cache', 'storage', 'queue', 'malwareScanner']) {
  if (readinessPayload.checks?.[name]?.status !== 'UP') {
    throw new Error(`Readiness dependency ${name} is not UP.`);
  }
}

const metrics = await readResponse('/api/metrics?format=prometheus', 200, 'text/plain');
if (!metrics.body.includes('aegissec_http_requests_total')) {
  throw new Error('Prometheus response does not contain the expected AegisSec request metric.');
}

console.log(JSON.stringify({
  status: 'PASS',
  baseUrl: baseUrl.origin,
  liveness: livePayload.timestamp,
  readiness: readinessPayload.timestamp,
  dependencies: Object.fromEntries(['database', 'cache', 'storage', 'queue', 'malwareScanner'].map((name) => [name, readinessPayload.checks[name].status])),
}, null, 2));
