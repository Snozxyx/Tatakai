import { expect, test } from 'bun:test';
import { UploadBudget } from '../src/core/watch-party/upload-budget';

test('fallback admission reserves upload headroom and releases disconnected viewers', () => {
  const budget = new UploadBudget(4);
  expect(() => budget.admit('a')).toThrow('measurement');
  budget.recordProbe(512 * 1024, 200); // 20.97 Mbps; 13.63 Mbps usable.
  budget.admit('a'); budget.admit('b'); budget.admit('c');
  expect(() => budget.admit('d')).toThrow('capacity');
  budget.admit('a'); // Repeated resource requests don't reserve another slot.
  budget.remove('b'); budget.admit('d');
});
test('invalid probes do not enable unmeasured fallback and source bitrate is respected', () => {
  const budget = new UploadBudget();
  budget.recordProbe(1, 1); budget.recordProbe(65536, 0);
  expect(() => budget.admit('a')).toThrow('measurement');
  budget.recordProbe(512 * 1024, 1000);
  expect(() => budget.admit('a')).toThrow('capacity');
  budget.setSourceBitrate(1_000_000); budget.admit('a');
});
