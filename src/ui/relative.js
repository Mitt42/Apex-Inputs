/**
 * Relative overlay renderer.
 *
 * telemetry.js supplies an ordered list of nearby drivers. This renderer focuses
 * on names, class colours, badges, temperatures, gaps and user-selected formatting.
 */
let settings;
let data;
const $ = id => document.getElementById(id);
const style = document.createElement("style");
style.textContent = ".car-row{font-size:calc(10px * var(--font-scale,1))}.driver small{font-size:calc(7px * var(--font-scale,1))}.pit{font-size:7px;color:#ffb34a;margin-left:5px}.badge{font-size:7px;padding:2px 3px;border-radius:2px;background:#e5e8eb;color:#17191c;margin-left:4px;font-weight:800}.gain{margin-left:4px;color:#65df8b}.gain.loss{color:#ff737d}.maker{margin-left:5px;color:#c8cdd2;font-size:8px}header>strong{font-size:calc(12px * var(--font-scale,1))}#sessionInfo{font-size:calc(8px * var(--font-scale,1));font-weight:700}.relative-footer{display:flex;justify-content:space-between;padding:8px 10px;background:color-mix(in srgb,var(--bg) 96%,transparent);border-top:1px solid #ffffff14;border-radius:0 0 5px 5px;font-size:calc(9px * var(--font-scale,1));font-weight:700}.cars{border-radius:0}";
document.head.appendChild(style);
const editBorder = document.createElement("style");
editBorder.textContent = "body:has(.relative.editing){outline:2px solid var(--accent);outline-offset:-2px}header{height:34px;padding:0 10px}header>strong{font-size:11px}#sessionInfo{gap:12px}.car-row{height:28px;grid-template-columns:24px 35px 1fr 55px;padding:0 6px;font-size:9px}.number{min-width:26px;height:17px;padding:0 4px}.driver small{display:none}.relative-footer{padding:6px 9px;font-size:8px}";
document.head.appendChild(editBorder);
function formatName(name = "", format, nameCase) {
    // Splitting defensively keeps empty and single-word driver names valid.
    const parts = name.trim().split(/\s+/), first = parts[0] || "", last = parts.at(-1) || "";
    let result = name;
    if (format === "initial-last")
        result = `${first[0] || ""}. ${last}`;
    if (format === "last-first")
        result = `${last} ${first[0] || ""}.`;
    if (format === "last")
        result = last;
    if (format === "initials")
        result = parts.map(part => `${part[0]}.`).join(" ");
    if (nameCase === "uppercase")
        result = result.toUpperCase();
    return result;
}
function temp(value = 0) {
    const precise = settings.relative.preciseTemps;
    if (settings.relative.tempUnits === "f")
        return `${(value * 9 / 5 + 32).toFixed(precise ? 1 : 0)}°F`;
    if (settings.relative.tempUnits === "both")
        return `${value.toFixed(precise ? 1 : 0)}°C/${(value * 9 / 5 + 32).toFixed(precise ? 1 : 0)}°F`;
    return `${value.toFixed(precise ? 1 : 0)}°C`;
}
const classColor = value => `#${(Number(value) >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
function clock(seconds) {
    const value = Math.max(0, Number(seconds) || 0), hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), secs = Math.floor(value % 60);
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}
function manufacturer(car = "") {
    return [["Porsche", "POR"], ["BMW", "BMW"], ["Ferrari", "FER"], ["Mercedes", "AMG"], ["Audi", "AUD"], ["McLaren", "MCL"], ["Toyota", "TOY"], ["Chevrolet", "CHE"]].find(([name]) => car.toLowerCase().includes(name.toLowerCase()))?.[1] || "CAR";
}
function clearRelative() {
    // Remove stale demo content while waiting for the first real participant frame.
    $("sessionInfo").innerHTML = "";
    $("cars").innerHTML = "";
    const footer = $("relativeFooter");
    if (footer)
        footer.remove();
}
function render() {
    if (!settings)
        return;
    // CSS variables update appearance without duplicating style rules per row.
    const r = settings.relative, root = document.documentElement.style;
    root.setProperty("--accent", r.accent);
    root.setProperty("--bg", r.background);
    root.setProperty("--scale", r.scale / 100);
    root.setProperty("--font-scale", r.fontSize / 100);
    $("relative").style.width = `${Math.max(1, (innerWidth - 16) / (r.scale / 100))}px`;
    $("relative").style.height = `${Math.max(1, (innerHeight - 16) / (r.scale / 100))}px`;
    $("relative").classList.toggle("editing", settings.relativeEditMode);
    // Never retain demonstration drivers after Demo mode is disabled. The
    // overlay remains empty until a real iRacing participant frame arrives.
    if (!data || (!settings.demoMode && data.demo !== false) || !Array.isArray(data.cars) || data.cars.length === 0) {
        clearRelative();
        return;
    }
    const info = [];
    if (r.oilTemp)
        info.push(`OIL ${temp(data.oilTemp)}`);
    if (r.waterTemp)
        info.push(`WATER ${temp(data.waterTemp)}`);
    if (r.airTemp)
        info.push(`AIR ${temp(data.airTemp)}`);
    if (r.trackTemp)
        info.push(`TRACK ${temp(data.trackTemp)}`);
    if (r.humidity)
        info.push(`RH ${Math.round((data.humidity || 0) * 100)}%`);
    if (r.brakeBias)
        info.push(`BB ${(data.brakeBias || 0).toFixed(1)}%`);
    if (r.showSof) {
        const ratings = data.cars.map(car => car.irating).filter(Boolean);
        const sof = ratings.length ? Math.round(ratings.length / ratings.reduce((sum, value) => sum + 1 / value, 0)) : 0;
        info.push(`SOF ${r.preciseSof ? sof : Math.round(sof / 100) * 100}`);
    }
    const incidents = (/practice/i.test(data.sessionType) && r.incidentsPractice) || (/qual/i.test(data.sessionType) && r.incidentsQualifying) || (/race/i.test(data.sessionType) && r.incidentsRace);
    if (incidents)
        info.push(`X ${data.incidents || 0}`);
    if (r.localTime)
        info.push(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    if (r.sessionTimeOfDay)
        info.push(`◷ ${clock(data.sessionTime)}`);
    $("sessionInfo").innerHTML = r.showInfoTop ? info.map(item => `<span>${item}</span>`).join("") : "";
    const playerIndex = data.cars.findIndex(car => car.isPlayer), half = Math.floor(r.rows / 2);
    const start = Math.max(0, Math.min(data.cars.length - r.rows, playerIndex - half));
    const cars = data.cars.slice(start, start + r.rows), multipleClasses = new Set(data.cars.map(car => car.classColor)).size > 1;
    $("cars").innerHTML = cars.length ? cars.map(car => {
        const stripe = r.rowStyle === "stripes" ? "stripe" : r.rowStyle === "stripes-reversed" ? "stripe-reversed" : "";
        const color = classColor(car.classColor), numberStyle = r.multiclassColor === "car-number" ? `color:${color}` : r.multiclassColor === "car-number-bg" ? `background:${color}` : "";
        const rowStyle = r.multiclassColor === "row-bg" ? `background:color-mix(in srgb,${color} 18%,var(--bg))` : "";
        const gap = car.isPlayer ? "\u2014" : `${car.gap > 0 ? "+" : ""}${car.gap.toFixed(1)}`;
        const license = (car.license || "").replace(/\s+/g, ""), badges = r.ratingBadges ? `<b class="badge">${license || "R"}</b><b class="badge">${(car.irating / 1000).toFixed(1)}k</b>` : "";
        const gain = r.iratingGain && car.iratingGain ? `<b class="gain ${car.iratingGain < 0 ? "loss" : ""}">${car.iratingGain > 0 ? "\u25B2" : "\u25BC"}${Math.abs(car.iratingGain)}</b>` : "";
        const maker = r.manufacturerLogo === "always" || (r.manufacturerLogo === "multiclass" && multipleClasses) ? `<b class="maker">${manufacturer(car.car)}</b>` : "";
        const lapBadge = r.pitBadge && car.lastLap ? ` · LAST ${clock(car.lastLap)}` : "";
        return `<div class="car-row ${stripe} ${car.isPlayer ? "player" : ""}" style="${rowStyle}"><span class="position">${car.position}</span><span class="number" style="${numberStyle}">${r.showCarNumbers ? car.number : ""}</span><span class="driver">${formatName(car.name, r.driverNameStyle, r.nameCase)}${car.onPitRoad && r.pitBadge ? "<b class=\"pit\">PIT</b>" : ""}${badges}${gain}${maker}<small>${car.car || ""}${lapBadge}</small></span><span class="gap ${car.isPlayer ? "player-gap" : car.gap < 0 ? "ahead" : "behind"}">${gap}</span></div>`;
    }).join("") : "";
    let footer = $("relativeFooter");
    if (!footer) {
        footer = document.createElement("div");
        footer.id = "relativeFooter";
        footer.className = "relative-footer";
        $("relative").appendChild(footer);
    }
    footer.innerHTML = `<span>Lap: ${Math.max(0, Math.round(data.lap || 0))}${data.sessionLapsRemaining >= 0 ? ` / +${Math.round(data.sessionLapsRemaining)}` : ""}</span><span>${data.sessionTimeRemaining > 0 ? `Race: ${clock(data.sessionTimeRemaining)}` : ""}</span>`;
}
window.apex.getSettings().then(value => { settings = value; render(); });
window.apex.onSettings(value => { settings = value; render(); });
window.apex.onRelative(value => { data = value; render(); });
window.addEventListener("resize", render);
