"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");

class TranslationEngine extends EventEmitter {
  constructor({ binary, root }) {
    super();
    this.binary = binary;
    this.root = root;
    this.child = null;
    this.pending = new Map();
    this.sequence = 0;
    this.starting = null;
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.child) return;
    if (!fs.existsSync(this.binary))
      throw new Error(
        "Yomi engine is missing. Build it with npm run translate:build, or install a desktop build that includes it."
      );
    this.starting = new Promise((resolve, reject) => {
      const child = spawn(this.binary, [this.root], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
      });
      this.child = child;
      let buffer = Buffer.alloc(0);
      let ready = false;
      let failed = false;
      let diagnostic = "";
      const timer = setTimeout(() => {
        reject(new Error("Translation engine did not start in time."));
        child.kill();
      }, 15000);
      child.stderr.on("data", (chunk) => {
        diagnostic = (diagnostic + chunk.toString()).slice(-2000);
      });
      child.stdout.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > 128 * 1024 * 1024) {
          child.kill();
          return;
        }
        let end;
        while ((end = buffer.indexOf(10)) !== -1) {
          const line = buffer.subarray(0, end);
          buffer = buffer.subarray(end + 1);
          let message;
          try {
            message = JSON.parse(line.toString("utf8"));
          } catch {
            child.kill();
            return;
          }
          if (message.event === "ready") {
            if (message.protocol !== 1) {
              reject(new Error("Unsupported translation engine protocol."));
              child.kill();
              return;
            }
            ready = true;
            clearTimeout(timer);
            resolve();
          } else if (message.event) this.emit("event", message);
          else {
            const pending = this.pending.get(message.id);
            if (!pending) continue;
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.ok) pending.resolve(message.result);
            else
              pending.reject(
                new Error(String(message.error || "Translation command failed"))
              );
          }
        }
      });
      const fail = () => {
        if (failed) return;
        failed = true;
        clearTimeout(timer);
        this.child = null;
        this.starting = null;
        const error = new Error(
          ready
            ? "Translation engine stopped. Reopen the project to recover the last saved revision."
            : "Translation engine could not start. Check the installed native runtime."
        );
        // Native diagnostics may contain private project data; never forward stderr.
        diagnostic = "";
        if (!ready) reject(error);
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pending.clear();
        this.emit("event", { event: "error", message: error.message });
      };
      child.once("error", fail);
      child.once("exit", fail);
    });
    try {
      await this.starting;
    } catch (error) {
      this.starting = null;
      throw error;
    }
  }
  async request(command, args = {}) {
    await this.start();
    const id = ++this.sequence;
    const line = JSON.stringify({ id, command, args }) + "\n";
    if (Buffer.byteLength(line) > 96 * 1024 * 1024)
      throw new Error("Translation command exceeds the size limit.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Translation command timed out. Reopen the project to check its saved state."
          )
        );
      }, 300000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(line, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Translation engine connection closed."));
      });
    });
  }
  stop() {
    if (this.child) {
      this.child.stdin.end();
      this.child.kill();
    }
  }
}

function engineOptions(app) {
  const binaryName =
    process.platform === "win32"
      ? "tatakai-translate.exe"
      : "tatakai-translate";
  let binary = app.isPackaged
      ? path.join(
          process.resourcesPath,
          "bin",
          "translate-engine",
          process.arch,
          binaryName
        )
      : path.join(
          // `electron desktop/main.cjs` makes getAppPath() point at desktop/.
          // Resolve development resources from this module's repository location.
          path.resolve(__dirname, "..", "..", ".."),
          "resources",
          "bin",
          "translate-engine",
          process.arch,
          binaryName
        );
  if (!app.isPackaged) {
    const directory=path.join(path.dirname(binary),'development');
    try {
      const current=JSON.parse(fs.readFileSync(path.join(directory,'current.json'),'utf8'));
      if(typeof current.file==='string' && /^[a-f0-9]{64}(\.exe)?$/.test(current.file)) {
        const candidate=path.join(directory,current.file);
        if(fs.existsSync(candidate))binary=candidate;
      }
    } catch { /* First development build may not exist yet. */ }
  }
  return {
    binary,
    root: path.join(app.getPath("documents"), "Tatakai", "Translate"),
  };
}
module.exports = { TranslationEngine, engineOptions };
