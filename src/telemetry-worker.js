/**
 * Entry point for the isolated telemetry child process.
 *
 * The native iRacing SDK is deliberately kept outside Electron's main process.
 * A native failure can therefore be recovered without closing the control panel.
 * Only plain serializable objects cross this process boundary; native buffers and
 * SDK instances remain private to this worker.
 */
const { Telemetry } = require("./telemetry");
const telemetry = new Telemetry();
// `started` distinguishes an intentional shutdown from an unexpected disconnect.
let started = false;
/** Send a typed message only while the parent IPC channel remains available. */
function send(type, payload) {
    try {
        process.send?.({ type, payload });
    }
    catch { }
}
// Translate EventEmitter events into explicit process messages for the bridge.
telemetry.on("data", payload => send("data", payload));
telemetry.on("relative", payload => send("relative", payload));
telemetry.on("status", payload => send("status", payload));
process.on("message", message => {
    // Reject malformed messages before inspecting their command type.
    if (!message || typeof message !== "object")
        return;
    if (message.type === "start") {
        // Logging is configured before reading telemetry so startup failures are captured.
        if (message.logFile)
            telemetry.setLogFile(message.logFile);
        started = true;
        void telemetry.start(Boolean(message.demo));
    }
    else if (message.type === "stop") {
        // Release timers and the shared-memory connection before ending the process.
        started = false;
        telemetry.stop();
        setTimeout(() => process.exit(0), 25);
    }
});
process.on("uncaughtException", error => {
    // Report JavaScript failures without silently losing telemetry.
    telemetry.log("telemetry-worker-uncaught-exception", { detail: error?.stack || error?.message || String(error) });
    send("status", { state: "error", label: "Telemetry error", detail: error?.message || String(error) });
});
process.on("unhandledRejection", error => {
    // Promise failures receive the same diagnostic treatment as synchronous errors.
    telemetry.log("telemetry-worker-unhandled-rejection", { detail: error?.stack || error?.message || String(error) });
    send("status", { state: "error", label: "Telemetry error", detail: error?.message || String(error) });
});
process.on("disconnect", () => {
    // If Electron disappears, no consumer remains for telemetry frames.
    if (started)
        telemetry.stop();
    process.exit(0);
});
