/**
 * Supervises the isolated telemetry process.
 *
 * main.js sees this class as an EventEmitter service. Internally it creates a
 * normal Node child, forwards normalized frames, records failures and applies a
 * circuit breaker so repeated native crashes cannot create an endless loop.
 */
const { EventEmitter } = require("node:events");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
class TelemetryBridge extends EventEmitter {
    /** Create lifecycle state; start() performs the actual process launch. */
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
        // The next start command forwards this destination to the worker.
        this.logFile = file;
    }
    log(event, data = {}) {
        // Bridge logs cover failures that happen outside or before Telemetry itself.
        if (!this.logFile)
            return;
        try {
            fs.appendFileSync(this.logFile, `${JSON.stringify({ time: new Date().toISOString(), event, ...data })}\n`);
        }
        catch { }
    }
    start(demo = true) {
        // Reuse a healthy worker when switching between demo and live modes.
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
        // ChildProcess.send throws after disconnection, so guard and contain it.
        if (!this.child?.connected)
            return;
        try {
            this.child.send(message);
        }
        catch { }
    }
    spawn() {
        // Never run two native readers against the same application state.
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
            // The envelope type determines which public event consumers receive.
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
            // Expected exits happen during normal application shutdown.
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
        // Set stopping state before messaging the worker so its exit is expected.
        this.running = false;
        this.stopping = true;
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
        if (!this.child)
            return;
        this.send({ type: "stop" });
        const child = this.child;
        // Give Telemetry a short grace period, then force termination if required.
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
