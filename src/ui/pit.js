/**
 * Renders the contextual pit-lane helper, limiter state, speed comparison, and race-start controls.
 */
let settings, telemetry;
const $ = id => document.getElementById(id);
function meter(type, label, value, height) { return `<div class="meter ${type} ${type === "speed" && value > 100 ? "over" : ""}"><div class="fill" style="height:${Math.max(0, Math.min(100, height))}%"></div><strong>${label}</strong><small>${type}</small></div>`; }
function render() {
    if (!settings)
        return;
    const p = settings.pit, root = document.documentElement.style;
    root.setProperty("--safe", p.safeColor);
    root.setProperty("--warning", p.warningColor);
    root.setProperty("--clutch", p.clutchColor);
    root.setProperty("--bg", p.background);
    root.setProperty("--scale", p.scale / 100);
    root.setProperty("--font-scale", p.fontSize / 100);
    $("pitHelper").style.width = `${Math.max(1, (innerWidth - 16) / (p.scale / 100))}px`;
    $("pitHelper").style.height = `${Math.max(1, (innerHeight - 16) / (p.scale / 100))}px`;
    $("pitHelper").classList.toggle("editing", settings.pitEditMode);
    if (!telemetry)
        return;
    const distance = Number(telemetry.pitDistance), demo = Boolean(telemetry.demo);
    const nearPit = demo || Boolean(telemetry.onPitRoad) || Boolean(telemetry.pitWarning) || (Number.isFinite(distance) && distance >= 0 && distance <= p.activationDistance);
    const raceStart = p.raceStartHelper && (demo || (telemetry.speedKph || 0) < 3);
    $("pitHelper").style.visibility = settings.pitEditMode || nearPit || raceStart ? "visible" : "hidden";
    $("limiter").classList.toggle("on", Boolean(telemetry.pitLimiterOn));
    $("limiter").style.display = p.pitLimiter && nearPit ? "inline-block" : "none";
    const parts = [];
    if (p.pitLaneHelper && nearPit) {
        const remaining = Math.max(0, distance || 0), limit = Math.max(1, telemetry.pitSpeedLimit || 60), speed = Math.max(0, telemetry.speedKph || 0);
        parts.push(meter("distance", `${Math.round(remaining)} m`, remaining, Math.min(100, remaining / 50 * 100)));
        parts.push(meter("speed", speed.toFixed(1), speed / limit * 100, speed / limit * 100));
    }
    if (raceStart) {
        parts.push(meter("clutch", `${Math.round((telemetry.clutch || 0) * 100)}%`, 0, (telemetry.clutch || 0) * 100));
        parts.push(meter("throttle", `${Math.round((telemetry.throttle || 0) * 100)}%`, 0, (telemetry.throttle || 0) * 100));
    }
    $("bars").innerHTML = parts.join("");
}
window.apex.getSettings().then(v => { settings = v; render(); });
window.apex.onSettings(v => { settings = v; render(); });
window.apex.onTelemetry(v => { telemetry = v; render(); });
window.addEventListener("resize", render);
