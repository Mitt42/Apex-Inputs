/**
 * Push-to-Pass overlay renderer.
 *
 * telemetry.js confirms capability because session-wide P2P arrays may also exist
 * for unsupported cars. This page remains invisible without positive evidence.
 */
let settings, telemetry;
const $ = id => document.getElementById(id);
function value(label, text) { return `<div class="value"><small>${label}</small><strong>${text}</strong></div>`; }
function render() {
    if (!settings)
        return;
    const p = settings.p2p, root = document.documentElement.style;
    root.setProperty("--ready", p.readyColor);
    root.setProperty("--active", p.activeColor);
    root.setProperty("--cooldown", p.cooldownColor);
    root.setProperty("--bg", p.background);
    root.setProperty("--scale", p.scale / 100);
    root.setProperty("--font-scale", p.fontSize / 100);
    const panel = $("p2p");
    panel.classList.toggle("editing", settings.p2pEditMode);
    if (!telemetry)
        return;
    const available = Boolean(telemetry.demo || telemetry.p2pAvailable);
    panel.style.visibility = settings.p2pEditMode || available ? "visible" : "hidden";
    const active = Boolean(telemetry.p2pActive);
    // Cooldown is derived because the SDK has no universal cooldown timer channel.
    const cooldown = !active && telemetry.p2pCooldownElapsed > 0 && telemetry.p2pCooldownElapsed < p.cooldownDuration;
    panel.classList.toggle("active", active);
    panel.classList.toggle("cooldown", cooldown);
    $("state").textContent = active ? "ACTIVE" : cooldown ? "COOLDOWN" : "READY";
    const parts = [];
    if (p.showRemaining)
        parts.push(value("Uses left", String(Math.max(0, telemetry.p2pRemaining || 0))));
    if (p.showUsageTime)
        parts.push(value("Use time", `${Math.max(0, telemetry.p2pUsageTime || 0).toFixed(1)} s`));
    if (p.showCooldown) {
        const remaining = cooldown ? Math.max(0, p.cooldownDuration - telemetry.p2pCooldownElapsed) : 0;
        parts.push(value("Cooldown", cooldown ? `${remaining.toFixed(1)} s` : "READY"));
    }
    $("values").innerHTML = parts.join("");
}
window.apex.getSettings().then(value => { settings = value; render(); });
window.apex.onSettings(value => { settings = value; render(); });
window.apex.onTelemetry(value => { telemetry = value; render(); });
