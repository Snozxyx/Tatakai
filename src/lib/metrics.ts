// Simple Prometheus-style metrics collector. For production prefer a library or Pushgateway.

type Labels = Record<string, string> | undefined;

const counters: Map<string, number> = new Map();
const gauges: Map<string, number> = new Map();
const histograms: Map<string, number[]> = new Map();

export function incCounter(name: string, v = 1) {
  counters.set(name, (counters.get(name) || 0) + v);
}

export function setGauge(name: string, value: number) {
  gauges.set(name, value);
}

export function observeHistogram(name: string, value: number) {
  const arr = histograms.get(name) || [];
  arr.push(value);
  if (arr.length > 1000) arr.shift();
  histograms.set(name, arr);
}

export function collectPrometheus() {
  // Simple exposition: counters and gauges. Histograms are summarized by basic stats.
  let out = '';
  for (const [k, v] of counters) {
    out += `# TYPE ${k} counter\n`;
    out += `${k} ${v}\n`;
  }
  for (const [k, v] of gauges) {
    out += `# TYPE ${k} gauge\n`;
    out += `${k} ${v}\n`;
  }
  for (const [k, arr] of histograms) {
    const sum = arr.reduce((s, a) => s + a, 0);
    const count = arr.length;
    const avg = count ? sum / count : 0;
    out += `# TYPE ${k} summary\n`;
    out += `${k}_count ${count}\n`;
    out += `${k}_sum ${sum}\n`;
    out += `${k}_avg ${avg}\n`;
  }
  return out;
}

export async function pushToGateway(pushUrl: string) {
  try {
    const body = collectPrometheus();
    await fetch(pushUrl, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
  } catch (e) {
    // ignore push errors
  }
}
