'use strict';
const { spawn } = require('node:child_process');
const readline = require('node:readline');

class PythonUpscaler {
    constructor(python, worker, models, onProgress) {
        this.python = python; this.worker = worker; this.models = models; this.onProgress = onProgress;
        this.child = null; this.starting = null; this.pending = new Map(); this.engine = null;
        this.stopping = null; this.cancelled = new Set();
    }
    async start() {
        if (this.stopping) await this.stopping;
        if (this.starting) return this.starting;
        if (this.child) return;
        this.starting = new Promise((resolve, reject) => {
            const child = spawn(this.python, ['-u', this.worker, '--serve', '--models', this.models], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
            this.child = child;
            let tail = '';
            const timer = setTimeout(() => { this.stop(); reject(new Error('AI worker did not start. Run setup again.')); }, 30000);
            child.stderr.on('data', chunk => { tail = (tail + chunk).slice(-2000); });
            const lines = readline.createInterface({ input: child.stdout });
            lines.on('line', line => {
                let event;
                try { event = JSON.parse(line); } catch { return; }
                if (event.type === 'ready') { clearTimeout(timer); resolve(); return; }
                const pending = this.pending.get(event.id);
                if (event.type === 'progress') { this.onProgress(event); return; }
                if (!pending) return;
                clearTimeout(pending.timer); this.pending.delete(event.id);
                if (event.type === 'result') { this.engine = event.engine; pending.resolve(); }
                else pending.reject(new Error(event.message || 'AI enhancement failed'));
            });
            const failed = error => {
                clearTimeout(timer); lines.close();
                if (this.child === child) { this.child = null; this.starting = null; this.engine = null; }
                for (const [id, pending] of this.pending) if (pending.child === child) { clearTimeout(pending.timer); pending.reject(error); this.pending.delete(id); }
                reject(error);
            };
            child.on('error', failed);
            child.on('close', code => failed(new Error(tail || `AI worker stopped (${code}). Retry enhancement or run setup again.`)));
            child.stdin.on('error', () => {});
        });
        try { await this.starting; } finally { this.starting = null; }
    }
    async request(job) {
        await this.start();
        if (this.cancelled.delete(job.id)) throw new Error('Enhancement cancelled');
        try { return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.stop(); reject(new Error('AI processing timed out. Try Anime4K or a smaller page.')); }, 600000);
            this.pending.set(job.id, { resolve, reject, timer, child: this.child });
            this.child.stdin.write(`${JSON.stringify(job)}\n`);
        }); } finally { this.cancelled.delete(job.id); }
    }
    cancel(id) { this.cancelled.add(id); this.child?.stdin.write(`${JSON.stringify({ command: 'cancel', id })}\n`); }
    stop() {
        if (!this.child) return this.stopping || Promise.resolve();
        const child = this.child;
        this.stopping = new Promise(resolve => child.once('close', resolve)).finally(() => { this.stopping = null; });
        child.kill(); return this.stopping;
    }
}
module.exports = { PythonUpscaler };
