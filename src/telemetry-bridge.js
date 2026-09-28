/**
 * Runs telemetry outside the Electron main process and restarts it without closing the user interface if the native SDK fails.
 */
const { EventEmitter } = require("node:events");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
class TelemetryBridge extends EventEmitter {
    constructor() {
        super();
        this.child = null;
        this.logFile = null;
        this.demo = true;
        this.running = false;
        this.stopping = false;
        this.restartTimer = null;
        this.recentCrashes = [];
    }
    setLogFile(file) {
        this.logFile = file;
    }
    log(event, data = {}) {
        if (!this.logFile)
            return;
        try {
            fs.appendFileSync(this.logFile, `${JSON.stringify({ time: new Date().toISOString(), event, ...data })}\n`);
        }
        catch { }
    }
    start(demo = true) {
        this.demo = Boolean(demo);
        this.running = true;
        this.stopping = false;
        clearTimeout(this.restartTimer);
        if (!this.child)
            this.spawn();
        else
            this.send({ type: "start", demo: this.demo, logFile: this.logFile });
    }
    send(message) {
        if (!this.child?.connected)
            return;
        try {
            this.child.send(message);
        }
        catch { }
    }
    spawn() {
        if (!this.running || this.child)
            return;
        // Electron utility processes can terminate inside some native shared-memory
        // bindings on Windows. Running the worker as an ordinary Node child keeps
        // the SDK isolated while using the native module in its supported context.
        const worker = fork(path.join(__dirname, "telemetry-worker.js"), [], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
            stdio: ["ignore", "ignore", "ignore", "ipc"],
            windowsHide: true
        });
        this.child = worker;
        this.log("telemetry-worker-started", { pid: worker.pid, demo: this.demo });
        worker.on("message", message => {
            if (!message || typeof message !== "object")
                return;
            if (message.type === "data")
                this.emit("data", message.payload);
            else if (message.type === "relative")
                this.emit("relative", message.payload);
            else if (message.type === "status")
                this.emit("status", message.payload);
            else if (message.type === "log")
                this.log(message.event, message.data);
        });
        worker.on("exit", code => {
            const expected = this.stopping || !this.running;
            this.log("telemetry-worker-exited", { code, expected, demo: this.demo });
            this.child = null;
            if (expected)
                return;
            const now = Date.now();
            this.recentCrashes = this.recentCrashes.filter(time => now - time < 15000);
            this.recentCrashes.push(now);
            this.emit("status", {
                state: "error",
                label: "SDK error",
                detail: `The iRacing telemetry process stopped (code ${code}). The app remains open.`
            });
            // Avoid an endless crash loop. Changing telemetry mode or restarting
            // the application gives the worker a clean opportunity to reconnect.
            if (this.recentCrashes.length >= 3) {
                this.log("telemetry-worker-restart-paused", { crashes: this.recentCrashes.length });
                return;
            }
            this.restartTimer = setTimeout(() => this.spawn(), 2000);
        });
        this.send({ type: "start", demo: this.demo, logFile: this.logFile });
    }
    stop() {
        this.running = false;
        this.stopping = true;
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
        if (!this.child)
            return;
        this.send({ type: "stop" });
        const child = this.child;
        setTimeout(() => {
            try {
                child.kill();
            }
            catch { }
        }, 250);
        this.child = null;
    }
}
module.exports = { TelemetryBridge };
