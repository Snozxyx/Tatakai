import { expect, test } from "bun:test";
import {
  parseBetterStackStatus,
  formatServiceDuration,
  formatServiceUptime,
  fetchBetterStackReport,
} from "../src/lib/betterStackStatus";
test("Better Stack badge handles degraded, missing and stale monitoring truthfully", () => {
  const now = Date.now();
  const data = {
    source: "betterstack",
    checkedAt: new Date(now).toISOString(),
    status: "operational",
  };
  expect(parseBetterStackStatus(data, now)).toBe("operational");
  expect(parseBetterStackStatus({ ...data, status: "degraded" }, now)).toBe(
    "degraded"
  );
  expect(parseBetterStackStatus(data, now + 181000)).toBe("unknown");
  expect(parseBetterStackStatus({ ...data, checkedAt: "invalid" }, now)).toBe(
    "unknown"
  );
  expect(parseBetterStackStatus({ ...data, source: "other" }, now)).toBe(
    "unknown"
  );
  expect(parseBetterStackStatus(null, now)).toBe("unknown");
});

test("monitoring falls back when one public origin rejects the request", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const payload = {
    source: "betterstack",
    status: "operational",
    checkedAt: new Date().toISOString(),
    monitors: [],
    incidents: [],
    incidentsAvailable: true,
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return calls.length === 1
      ? new Response("blocked", { status: 403 })
      : Response.json(payload);
  }) as typeof fetch;
  try {
    expect((await fetchBetterStackReport()).status).toBe("operational");
    expect(calls.length).toBe(2);
  } finally {
    globalThis.fetch = original;
  }
});

test("monitoring figures preserve missing values and normalize duration boundaries", () => {
  expect(formatServiceUptime(null)).toBe("Unavailable");
  expect(formatServiceUptime(100)).toBe("100.000%");
  expect(formatServiceUptime(101)).toBe("Unavailable");
  expect(formatServiceDuration(null)).toBe("Unavailable");
  expect(formatServiceDuration(59.6)).toBe("1m 0s");
  expect(formatServiceDuration(3599.6)).toBe("1h 0m");
  expect(formatServiceDuration(86400)).toBe("1d 0h");
});
