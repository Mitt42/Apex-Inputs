/**
 * Hosts telemetry in an isolated Node process and forwards normalized events to Electron.
 */
const { Telemetry } = require("./telemetry");
const telemetry = new Telemetry();
let started = false;
function send(type, payload) {
    try {
        process.send?.({ type, payload });
    }
    catch { }
}
telemetry.on("data", payload => send("data", payload));
telemetry.on("relative", payload => send("relative", payload));
telemetry.on("status", payload => send("status", payload));
process.on("message", message => {
    if (!message || typeof message !== "object")
        return;
    if (message.type === "start") {
        if (message.logFile)
            telemetry.setLogFile(message.logFile);
        started = true;
        void telemetry.start(Boolean(message.demo));
    }
    else if (message.type === "stop") {
        started = false;
        telemetry.stop();
        setTimeout(() => process.exit(0), 25);
    }
});
process.on("uncaughtException", error => {
    telemetry.log("telemetry-worker-uncaught-exception", { detail: error?.stack || error?.message || String(error) });
    send("status", { state: "error", label: "Telemetry error", detail: error?.message || String(error) });
});
process.on("unhandledRejection", error => {
    telemetry.log("telemetry-worker-unhandled-rejection", { detail: error?.stack || error?.message || String(error) });
    send("status", { state: "error", label: "Telemetry error", detail: error?.message || String(error) });
});
process.on("disconnect", () => {
    if (started)
        telemetry.stop();
    process.exit(0);
});
