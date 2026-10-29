'use strict';
class UpscaleJobQueue {
    constructor(run, cancelActive, limit = 8) {
        this.run = run; this.cancelActive = cancelActive; this.limit = limit;
        this.jobs = []; this.active = null; this.sequence = 0; this.closed = false;
    }
    submit(job) {
        if (this.closed) return Promise.reject(new Error('Upscaler is shutting down'));
        if (this.jobs.length + Number(Boolean(this.active)) >= this.limit) return Promise.reject(new Error('The upscaler is busy. Try again in a moment.'));
        if ([this.active, ...this.jobs].some(item => item?.id === job.id)) return Promise.reject(new Error('Duplicate enhancement job'));
        return new Promise((resolve, reject) => {
            this.jobs.push({ ...job, sequence: this.sequence++, resolve, reject, cancelled: false });
            queueMicrotask(() => this.pump());
        });
    }
    async pump() {
        if (this.active || this.closed) return;
        this.jobs.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
        const job = this.jobs.shift();
        if (!job) return;
        this.active = job;
        try {
            const result = await this.run(job);
            if (job.cancelled) throw new Error('Enhancement cancelled');
            job.resolve(result);
        } catch (err) { job.reject(err); }
        finally { this.active = null; queueMicrotask(() => this.pump()); }
    }
    cancel(id, owner) {
        const index = this.jobs.findIndex(job => job.id === id && job.owner === owner);
        if (index >= 0) { this.jobs.splice(index, 1)[0].reject(new Error('Enhancement cancelled')); return true; }
        if (this.active?.id === id && this.active.owner === owner) {
            this.active.cancelled = true; this.cancelActive(id); return true;
        }
        return false;
    }
    cancelOwner(owner) { for (const job of [...this.jobs, this.active]) if (job?.owner === owner) this.cancel(job.id, owner); }
    close() {
        this.closed = true;
        for (const job of this.jobs.splice(0)) job.reject(new Error('Upscaler stopped'));
        if (this.active) { this.active.cancelled = true; this.cancelActive(this.active.id); }
    }
    get size() { return this.jobs.length + Number(Boolean(this.active)); }
}
module.exports = { UpscaleJobQueue };
