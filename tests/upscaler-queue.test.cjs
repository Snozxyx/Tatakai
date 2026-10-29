const { test, expect } = require('bun:test');
const { UpscaleJobQueue } = require('../desktop/runtime/upscaler/job-queue.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('visible and preview requests overtake lower-priority queued pages', async () => {
    const gate = deferred(), order = [];
    const queue = new UpscaleJobQueue(async job => { order.push(job.id); if (job.id === 'running') await gate.promise; return job.id; }, () => {});
    const first = queue.submit({ id: 'running', owner: 1, priority: 1 });
    await Promise.resolve();
    const low = queue.submit({ id: 'low', owner: 1, priority: 10 });
    const visible = queue.submit({ id: 'visible', owner: 1, priority: 80 });
    const preview = queue.submit({ id: 'preview', owner: 1, priority: 100 });
    gate.resolve(); await Promise.all([first, low, visible, preview]);
    expect(order).toEqual(['running', 'preview', 'visible', 'low']);
});

test('cancellation respects ownership and skips obsolete queued work', async () => {
    const gate = deferred(), ran = [], cancelled = [];
    const queue = new UpscaleJobQueue(async job => { ran.push(job.id); await gate.promise; }, id => cancelled.push(id));
    const first = queue.submit({ id: 'active', owner: 1, priority: 1 });
    await Promise.resolve();
    const pending = queue.submit({ id: 'queued', owner: 1, priority: 1 });
    const pendingRejected = pending.catch(error => error.message);
    const activeRejected = first.catch(error => error.message);
    expect(queue.cancel('queued', 2)).toBe(false);
    queue.cancelOwner(1); gate.resolve();
    expect(await pendingRejected).toContain('cancelled'); expect(await activeRejected).toContain('cancelled');
    expect(ran).toEqual(['active']); expect(cancelled).toEqual(['active']); expect(queue.size).toBe(0);
});
