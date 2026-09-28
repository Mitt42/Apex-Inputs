/**
 * Fuel Calculator renderer.
 *
 * Average, qualifying, last-lap and custom strategies share the same calculation,
 * allowing the driver to compare assumptions without duplicating business logic.
 */
let settings, telemetry;
const $ = id => document.getElementById(id);
const number = value => Number.isFinite(value) ? value.toFixed(2) : "--";
function temperature(value = 0, f) { const precise = f.preciseTemps ? 1 : 0, c = Number(value) || 0; if (f.tempUnits === "f")
    return `${(c * 9 / 5 + 32).toFixed(precise)}°F`; if (f.tempUnits === "both")
    return `${c.toFixed(precise)}°C/${(c * 9 / 5 + 32).toFixed(precise)}°F`; return `${c.toFixed(precise)}°C`; }
function calculate(usage, laps, fuel, reserve) { const needed = usage * (laps + reserve), refuel = Math.max(0, needed - fuel); return { usage, laps, refuel, end: fuel + refuel - usage * laps }; }
// Produce one complete visual row using the colour assigned to its strategy.
function row(label, values, color) { return `<div class="calc-label" style="color:${color}"><small>${label}</small><strong>${number(values.usage)}</strong></div><strong style="color:${color}">${number(values.laps)}</strong><strong style="color:${color}">${number(values.refuel)}</strong><strong style="color:${color}">${number(values.end)}</strong>`; }
function render() {
    // Settings can arrive before telemetry, so the two inputs are guarded separately.
    if (!settings)
        return;
    const f = settings.fuel, root = document.documentElement.style;
    root.setProperty("--accent", f.accent);
    root.setProperty("--pit", f.pitColor);
    root.setProperty("--bg", f.background);
    root.setProperty("--scale", f.scale / 100);
    root.setProperty("--font-scale", f.fontSize / 100);
    $("fuel").style.width = `${Math.max(1, (innerWidth - 16) / (f.scale / 100))}px`;
    $("fuel").style.height = `${Math.max(1, (innerHeight - 16) / (f.scale / 100))}px`;
    $("fuel").classList.toggle("editing", settings.fuelEditMode);
    if (!telemetry)
        return;
    // Visibility changes preserve the renderer and its accumulated state.
    const hidden = (f.hideReplay && telemetry.isReplay) || (f.hideGarage && telemetry.inGarage);
    $("fuel").style.visibility = hidden ? "hidden" : "visible";
    if (hidden)
        return;
    // All calculation inputs are clamped or defaulted before strategy formulas run.
    const fuel = telemetry.fuelLevel || 0, average = telemetry.fuelPerLap || 0, laps = Math.max(0, telemetry.lapsRemaining || 0), reserve = f.reserveLaps || 0;
    $("fuelLevel").textContent = number(fuel);
    $("raceLap").textContent = Math.max(0, Math.round(telemetry.lap || 0));
    $("pit").classList.toggle("active", Boolean(telemetry.onPitRoad));
    $("clock").textContent = f.multiclassClock && telemetry.isSlowerClass ? `Leader Lap ${telemetry.leaderLap || "--"}` : f.localTime ? new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: f.clockFormat === "12h" }) : "";
    // Optional information is assembled as tokens, then joined into one compact line.
    const top = [];
    if (f.oilTemp)
        top.push(`♨ ${temperature(telemetry.oilTemp, f)}`);
    if (f.waterTemp)
        top.push(`♨ ${temperature(telemetry.waterTemp, f)}`);
    if (f.humidity)
        top.push(`◉ ${((telemetry.humidity || 0) * 100).toFixed(f.preciseTemps ? 2 : 0)}%`);
    if (f.airTemp)
        top.push(`↳ ${temperature(telemetry.airTemp, f)}`);
    if (f.trackTemp)
        top.push(`S ${temperature(telemetry.trackTemp, f)}`);
    if (f.brakeBias)
        top.push(`◉ ${(telemetry.brakeBias || 0).toFixed(1)}%`);
    if (f.showSof)
        top.push(`SOF ${f.preciseSof ? telemetry.sof : Math.round((telemetry.sof || 0) / 100) * 100}`);
    const incidents = (/practice/i.test(telemetry.sessionType || "") && f.incidentsPractice) || (/qual/i.test(telemetry.sessionType || "") && f.incidentsQualifying) || (/race/i.test(telemetry.sessionType || "") && f.incidentsRace);
    if (incidents)
        top.push(`✕ ${telemetry.incidents || 0}`);
    $("topInfo").textContent = f.showInfoTop ? top.join("  ") : "";
    const calculations = $("calculations");
    calculations.innerHTML = "<div></div><small>Laps Remain</small><small>Refuel</small><small>Fuel at End</small>";
    calculations.insertAdjacentHTML("beforeend", row("Average", calculate(average, laps, fuel, reserve), "#83a8ff"));
    if (f.qualifying)
        calculations.insertAdjacentHTML("beforeend", row("Qualify", calculate(telemetry.qualifyingFuelPerLap || average, laps, fuel, reserve), "#e6a5ef"));
    if (f.lastLap)
        calculations.insertAdjacentHTML("beforeend", row("Last", calculate(telemetry.lastFuelPerLap || average, laps, fuel, reserve), "#e5d37a"));
    if (f.custom)
        calculations.insertAdjacentHTML("beforeend", row("Custom", calculate(Number(f.customUsage) || 0, laps, fuel, reserve), "#71d88b"));
}
window.apex.getSettings().then(value => { settings = value; render(); });
window.apex.onSettings(value => { settings = value; render(); });
window.apex.onTelemetry(value => { telemetry = value; render(); });
window.addEventListener("resize", render);
