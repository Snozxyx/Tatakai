// Run against a staging deployment populated with representative catalog data.
// k6 run -e BASE_URL=http://localhost:4001 -e RPS=50 scripts/load/catalog.k6.js
import http from 'k6/http';
import { check } from 'k6';

const base = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) throw new Error('Set BASE_URL to an explicit staging origin');
const rate = Number(__ENV.RPS || 50);
if (!Number.isInteger(rate) || rate < 1) throw new Error('RPS must be a positive integer');
export const options = {
  scenarios: { catalog: { executor: 'constant-arrival-rate', rate, timeUnit: '1s',
    duration: __ENV.DURATION || '2m', preAllocatedVUs: 20, maxVUs: 200 } },
  thresholds: {
    http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99'], dropped_iterations: ['count==0'],
  },
};
const routes = ['/api/v3/content/home', '/api/v3/countries', '/api/v3/providers'];
export default function () {
  const route = routes[Math.floor(Math.random() * routes.length)];
  const response = http.get(`${base}${route}`, { tags: { name: route }, timeout: '15s' });
  check(response, { 'catalog returns 200': reply => reply.status === 200,
    'catalog returns JSON': reply => String(reply.headers['Content-Type']).includes('application/json') });
}
