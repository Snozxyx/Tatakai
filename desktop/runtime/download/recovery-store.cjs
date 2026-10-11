'use strict';
const fs = require('fs');
const path = require('path');

class DownloadRecoveryStore {
    constructor(directory) {
        this.file = path.join(directory, 'download-recovery.json');
        this.handlers = new Map();
        this.active = new Set();
        this.autoResume = true;
        this.jobs = {};
        try {
            const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            this.autoResume = saved.autoResume !== false;
            this.jobs = saved.jobs && typeof saved.jobs === 'object' && !Array.isArray(saved.jobs) ? saved.jobs : {};
        } catch (error) { if (error.code !== 'ENOENT') console.warn('[Recovery] Could not load download journal:', error.message); }
        for (const [id, job] of Object.entries(this.jobs)) {
            if (!job || !job.payload || !['anime', 'manga'].includes(job.type)) { delete this.jobs[id]; continue; }
            if (job.status === 'running' || job.status === 'queued') job.status = 'interrupted';
        }
    }
    persist() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        require('./atomic-file.cjs').writeAtomic(this.file, JSON.stringify({ autoResume: this.autoResume, jobs: this.jobs }));
    }
    register(type, handler) { this.handlers.set(type, handler); }
    save(id, type, payload) {
        const previous = this.jobs[id];
        const startedAt = previous?.status === 'failed'
            ? new Date(Math.max(Date.now(), Date.parse(previous.startedAt) + 1)).toISOString()
            : previous?.startedAt || new Date().toISOString();
        this.jobs[id] = { id, type, payload, status: 'queued', startedAt };
        this.active.add(id);
        this.persist();
    }
    finish(id) { delete this.jobs[id]; this.active.delete(id); this.persist(); }
    fail(id, error) { if (this.jobs[id]) { this.jobs[id].status = 'failed'; this.jobs[id].error = error; } this.active.delete(id); this.persist(); }
    summary() {
        return { autoResume: this.autoResume, jobs: Object.values(this.jobs).filter(job => !this.active.has(job.id)).map(job => ({ id: job.id, type: job.type, title: job.payload.animeName || job.payload.series?.title || 'Download', status: job.status, error: job.error })) };
    }
    async resume() {
        const results = [];
        for (const job of Object.values(this.jobs)) {
            if (this.active.has(job.id) || !this.handlers.has(job.type)) continue;
            this.active.add(job.id);
            try {
                const result = await this.handlers.get(job.type)(job.payload, job.startedAt);
                if (!result?.success) throw new Error(result?.error || 'Resume failed');
                results.push({ id: job.id, success: true });
            } catch (error) { this.fail(job.id, error.message); results.push({ id: job.id, success: false, error: error.message }); }
        }
        return { success: results.every(result => result.success), results };
    }
}
let instance;
module.exports = { DownloadRecoveryStore, getRecoveryStore: app => instance ||= new DownloadRecoveryStore(app.getPath('userData')) };
