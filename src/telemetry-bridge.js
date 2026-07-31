/**
 * Runs telemetry outside the Electron main process and restarts it without closing the user interface if the native SDK fails.
 */
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { utilityProcess } = require("electron");
class TelemetryBridge extends EventEmitter {
    constructor() {
        super();
        this.child = null;
        this.logFile = null;
        this.demo = true;
        this.running = false;
        this.stopping = false;
        this.restartTimer = null;
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
            this.child.postMessage({ type: "start", demo: this.demo, logFile: this.logFile });
    }
    spawn() {
        if (!this.running || this.child)
            return;
        const worker = utilityProcess.fork(path.join(__dirname, "telemetry-worker.js"), [], {
            serviceName: "Apex Inputs Telemetry"
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
            this.emit("status", {
                state: "error",
                label: "Telemetry restarted",
                detail: `The iRacing telemetry process stopped (code ${code}). The app remains open.`
            });
            this.restartTimer = setTimeout(() => this.spawn(), 2000);
        });
        worker.postMessage({ type: "start", demo: this.demo, logFile: this.logFile });
    }
    stop() {
        this.running = false;
        this.stopping = true;
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
        if (!this.child)
            return;
        try {
            this.child.postMessage({ type: "stop" });
        }
        catch { }
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
