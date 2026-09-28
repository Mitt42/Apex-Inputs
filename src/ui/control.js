/**
 * Controls the configuration interface, synchronizes form fields, manages the visual editor, and handles layout profiles.
 */
const moduleMeta = { throttle: ["\u2191", "Throttle", "Throttle percentage"], brake: ["\u25A0", "Brake", "Applied brake pressure"], clutch: ["\u25D0", "Clutch", "Clutch percentage"], gear: ["3", "Gear", "Current car gear"], steering: ["\u25CC", "Steering", "Steering wheel angle"] };
let settings, selectedOverlay = null, inputsOpen = false;
const $ = id => document.getElementById(id);
function selectOverlay(name) { selectedOverlay = name; $("inputsAppearance").classList.toggle("is-hidden", name !== "inputs"); $("relativeAppearance").classList.toggle("is-hidden", name !== "relative"); $("relativeSelect").classList.toggle("selected", name === "relative"); $("inputsDropdown").classList.toggle("selected", name === "inputs"); updateEditButton(); }
function setInputsOpen(open) { inputsOpen = open; $("inputsDropdown").setAttribute("aria-expanded", String(open)); $("inputsDropdown").classList.toggle("open", open); $("inputsContent").classList.toggle("is-hidden", !open); if (open)
    selectOverlay("inputs");
else if (selectedOverlay === "inputs")
    selectOverlay(null); }
function updateEditButton() { if (!settings)
    return; const editing = selectedOverlay === "relative" ? settings.relativeEditMode : settings.editMode; $("editMode").classList.toggle("active", editing); $("editMode").textContent = editing ? "Finish editing" : selectedOverlay ? `Move and resize ${selectedOverlay}` : "Select an overlay to edit"; $("editMode").disabled = !selectedOverlay; }
function render(s) { settings = s; document.documentElement.style.setProperty("--accent", s.accent); for (const id of ["overlayEnabled", "clickThrough", "demoMode"])
    $(id).checked = s[id]; $("relativeEnabled").checked = s.relativeEnabled; for (const id of ["scale", "opacity"]) {
    $(id).value = s[id];
    $(`${id}Out`).value = `${s[id]}%`;
} $("accent").value = s.accent; $("panel").value = s.panel; $("graphEnabled").checked = s.graphEnabled; $("showPedalValues").checked = s.showPedalValues; $("pedalValuePosition").value = s.pedalValuePosition; for (const id of ["clutch", "brake", "throttle"])
    $(`${id}ValueVisible`).checked = s.pedalValueVisibility[id]; for (const id of ["pedalWidth", "pedalHeight", "graphHeight"]) {
    $(id).value = s[id];
    $(`${id}Out`).value = `${s[id]} px`;
} $("clutchColor").value = s.pedalColors.clutch; $("brakeColor").value = s.pedalColors.brake; $("throttleColor").value = s.pedalColors.throttle; $("source").textContent = s.demoMode ? "Demo mode" : "iRacing SDK"; $("statusDot").style.background = s.demoMode ? "#ffb23e" : "#55e6a5"; $("modules").innerHTML = Object.entries(moduleMeta).map(([key, m]) => `<label class="module"><span class="module-icon">${m[0]}</span><span><strong>${m[1]}</strong><small>${m[2]}</small></span><input data-module="${key}" type="checkbox" ${s.modules[key] ? "checked" : ""}></label>`).join(""); document.querySelectorAll("[data-relative]").forEach(el => { const value = s.relative[el.dataset.relative]; if (el.type === "checkbox")
    el.checked = value;
else
    el.value = value; }); $("relativeScaleOut").value = `${s.relative.scale}%`; $("relativeOpacityOut").value = `${s.relative.opacity}%`; updateEditButton(); }
window.apex.getSettings().then(render);
window.apex.onSettings(render);
$("close").onclick = window.apex.close;
$("minimize").onclick = window.apex.minimize;
$("inputsDropdown").onclick = () => setInputsOpen(!inputsOpen);
$("relativeSelect").onclick = e => { if (e.target.id !== "relativeEnabled")
    selectOverlay("relative"); };
$("relativeEnabled").onchange = e => window.apex.toggleRelative(e.target.checked);
$("overlayEnabled").onchange = e => window.apex.toggleOverlay(e.target.checked);
$("clickThrough").onchange = e => window.apex.updateSettings({ clickThrough: e.target.checked });
$("demoMode").onchange = e => window.apex.updateSettings({ demoMode: e.target.checked });
$("graphEnabled").onchange = e => window.apex.updateSettings({ graphEnabled: e.target.checked });
$("showPedalValues").onchange = e => window.apex.updateSettings({ showPedalValues: e.target.checked });
$("pedalValuePosition").onchange = e => window.apex.updateSettings({ pedalValuePosition: e.target.value });
$("editMode").onclick = () => { const key = selectedOverlay === "relative" ? "relativeEditMode" : "editMode"; window.apex.setEditMode(!settings[key], selectedOverlay); };
for (const id of ["scale", "opacity"])
    $(id).oninput = e => { $(`${id}Out`).value = `${e.target.value}%`; window.apex.updateSettings({ [id]: Number(e.target.value) }); };
for (const id of ["pedalWidth", "pedalHeight", "graphHeight"])
    $(id).oninput = e => { $(`${id}Out`).value = `${e.target.value} px`; window.apex.updateSettings({ [id]: Number(e.target.value) }); };
for (const id of ["accent", "panel"])
    $(id).oninput = e => window.apex.updateSettings({ [id]: e.target.value });
for (const id of ["clutch", "brake", "throttle"])
    $(`${id}Color`).oninput = e => window.apex.updateSettings({ pedalColors: { [id]: e.target.value } });
for (const id of ["clutch", "brake", "throttle"])
    $(`${id}ValueVisible`).onchange = e => window.apex.updateSettings({ pedalValueVisibility: { [id]: e.target.checked } });
$("modules").onchange = e => { if (e.target.dataset.module)
    window.apex.updateSettings({ modules: { [e.target.dataset.module]: e.target.checked } }); };
document.querySelectorAll("[data-relative]").forEach(el => el.oninput = e => { const key = e.target.dataset.relative; let value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" || e.target.type === "range" ? Number(e.target.value) : e.target.value; if (key === "scale")
    $("relativeScaleOut").value = `${value}%`; if (key === "opacity")
    $("relativeOpacityOut").value = `${value}%`; window.apex.updateSettings({ relative: { [key]: value } }); });
window.apex.onTelemetryStatus(status => { const labels = { demo: "Demo mode", waiting: "Waiting for iRacing", connecting: "Syncing telemetry", connected: status.label.replace("iRacing ligado", "iRacing connected"), error: "SDK error" }; const colors = { connected: "#55e6a5", connecting: "#55c8ff", waiting: "#ffb23e", error: "#ff4d5d", demo: "#8c94a0" }; $("source").textContent = labels[status.state] || status.label; $("statusDot").style.background = colors[status.state] || "#8c94a0"; $("statusDot").style.boxShadow = `0 0 10px ${colors[status.state] || "#8c94a0"}`; });
const relativeFontLabel = document.createElement("label");
relativeFontLabel.innerHTML = "Text size <output id=\"relativeFontSizeOut\">100%</output><input data-relative=\"fontSize\" id=\"relativeFontSize\" type=\"range\" min=\"70\" max=\"160\">";
$("relativeAppearance").insertBefore(relativeFontLabel, $("relativeAppearance").querySelector(".colors"));
function showPage(page) { $("overlayPage").classList.toggle("is-hidden", page !== "overlays"); $("settingsPage").classList.toggle("is-hidden", page !== "settings"); $("overlaysNav").classList.toggle("active", page === "overlays"); $("settingsNav").classList.toggle("active", page === "settings"); }
$("overlaysNav").onclick = () => showPage("overlays");
$("settingsNav").onclick = () => showPage("settings");
function applyExtras(s) { $("inputsEnabled").checked = s.overlayEnabled; $("inputsFontSize").value = s.inputsFontSize; $("inputsFontSizeOut").value = `${s.inputsFontSize}%`; $("relativeFontSizeOut").value = `${s.relative.fontSize}%`; const theme = s.appTheme; document.documentElement.style.setProperty("--accent", theme.accent); document.documentElement.style.setProperty("--bg", theme.background); document.documentElement.style.setProperty("--card", theme.panel); document.documentElement.style.setProperty("--text", theme.text); document.documentElement.style.setProperty("--app-scale", theme.fontScale / 100); document.querySelectorAll("[data-theme]").forEach(el => el.value = theme[el.dataset.theme]); $("appFontScaleOut").value = `${theme.fontScale}%`; }
window.apex.getSettings().then(applyExtras);
window.apex.onSettings(applyExtras);
$("inputsDropdown").onclick = e => { if (e.target.id !== "inputsEnabled")
    setInputsOpen(!inputsOpen); };
$("inputsEnabled").onchange = e => window.apex.toggleOverlay(e.target.checked);
$("inputsFontSize").oninput = e => { $("inputsFontSizeOut").value = `${e.target.value}%`; window.apex.updateSettings({ inputsFontSize: Number(e.target.value) }); };
$("relativeFontSize").oninput = e => { $("relativeFontSizeOut").value = `${e.target.value}%`; window.apex.updateSettings({ relative: { fontSize: Number(e.target.value) } }); };
document.querySelectorAll("[data-theme]").forEach(el => el.oninput = e => { const key = e.target.dataset.theme, value = e.target.type === "range" ? Number(e.target.value) : e.target.value; if (key === "fontScale")
    $("appFontScaleOut").value = `${value}%`; window.apex.updateSettings({ appTheme: { [key]: value } }); });
$("resetTheme").onclick = () => window.apex.updateSettings({ appTheme: { accent: "#f3ff4b", background: "#0a0c0f", panel: "#11151a", text: "#f3f5f6", fontScale: 100 } });
function syncAllOverlays(s) {
    const all = $("allOverlaysEnabled");
    all.checked = s.overlayEnabled && s.relativeEnabled && s.fuelEnabled && s.pitEnabled && s.mguEnabled && s.radarEnabled && s.standingsEnabled;
    all.indeterminate = !all.checked && (s.overlayEnabled || s.relativeEnabled || s.fuelEnabled || s.pitEnabled || s.mguEnabled || s.radarEnabled || s.standingsEnabled);
}
window.apex.getSettings().then(syncAllOverlays);
window.apex.onSettings(syncAllOverlays);
$("allOverlaysEnabled").onchange = async (e) => {
    const enabled = e.target.checked;
    await Promise.all([window.apex.toggleOverlay(enabled), window.apex.toggleRelative(enabled), window.apex.toggleFuel(enabled), window.apex.togglePit(enabled), window.apex.toggleMgu(enabled), window.apex.toggleRadar(enabled), window.apex.toggleStandings(enabled)]);
};
$("inputsEnabled").onclick = e => e.stopPropagation();
$("relativeEnabled").onclick = e => e.stopPropagation();
$("relativeSelect").onclick = e => {
    if (e.target.id === "relativeEnabled")
        return;
    e.preventDefault();
    selectOverlay("relative");
};
const fuelSelect = document.createElement("label");
fuelSelect.id = "fuelSelect";
fuelSelect.className = "relative-select";
fuelSelect.innerHTML = "<span class=\"dropdown-icon\">F</span><span><strong>Fuel Calculator</strong><small>Fuel usage and pit calculation</small></span><input id=\"fuelEnabled\" type=\"checkbox\">";
$("relativeSelect").after(fuelSelect);
document.querySelector(".panel-title>span").textContent = "3 AVAILABLE";
const fuelAppearance = document.createElement("article");
fuelAppearance.id = "fuelAppearance";
fuelAppearance.className = "panel appearance is-hidden";
fuelAppearance.innerHTML = "<p class=\"eyebrow\">APPEARANCE \u00B7 FUEL</p><h3>Fuel Calculator</h3><div class=\"check-options\"><label><input data-fuel=\"showInfoTop\" type=\"checkbox\"> Show info at top</label><label><input data-fuel=\"localTime\" type=\"checkbox\"> Show local time</label><label><input data-fuel=\"qualifying\" type=\"checkbox\"> Qualifying calculations</label><label><input data-fuel=\"lastLap\" type=\"checkbox\"> Last lap calculations</label></div><label>Reserve laps <output id=\"fuelReserveOut\">1.0</output><input data-fuel=\"reserveLaps\" id=\"fuelReserve\" type=\"range\" min=\"0\" max=\"3\" step=\"0.1\"></label><label>Scale <output id=\"fuelScaleOut\">100%</output><input data-fuel=\"scale\" id=\"fuelScale\" type=\"range\" min=\"70\" max=\"140\"></label><label>Text size <output id=\"fuelFontSizeOut\">100%</output><input data-fuel=\"fontSize\" id=\"fuelFontSize\" type=\"range\" min=\"70\" max=\"160\"></label><label>Opacity <output id=\"fuelOpacityOut\">94%</output><input data-fuel=\"opacity\" id=\"fuelOpacity\" type=\"range\" min=\"35\" max=\"100\"></label><div class=\"colors\"><label>Values<input data-fuel=\"accent\" type=\"color\"></label><label>Pit<input data-fuel=\"pitColor\" type=\"color\"></label><label>Background<input data-fuel=\"background\" type=\"color\"></label></div>";
fuelAppearance.insertAdjacentHTML("beforeend", "<h3 class=\"fuel-section\">Information</h3><div class=\"check-options\"><label><input data-fuel=\"oilTemp\" type=\"checkbox\"> Oil temp</label><label><input data-fuel=\"waterTemp\" type=\"checkbox\"> Water temp</label><label><input data-fuel=\"brakeBias\" type=\"checkbox\"> Brake bias</label><label><input data-fuel=\"airTemp\" type=\"checkbox\"> Air temp</label><label><input data-fuel=\"trackTemp\" type=\"checkbox\"> Track temp</label><label><input data-fuel=\"humidity\" type=\"checkbox\"> Relative humidity</label><label><input data-fuel=\"preciseTemps\" type=\"checkbox\"> Precise temperatures</label><label><input data-fuel=\"showSof\" type=\"checkbox\"> Show SOF</label><label><input data-fuel=\"preciseSof\" type=\"checkbox\"> Precise SOF</label><label><input data-fuel=\"incidentsPractice\" type=\"checkbox\"> Practice incidents</label><label><input data-fuel=\"incidentsQualifying\" type=\"checkbox\"> Qualifying incidents</label><label><input data-fuel=\"incidentsRace\" type=\"checkbox\"> Race incidents</label><label><input data-fuel=\"multiclassClock\" type=\"checkbox\"> Multiclass race laps</label><label><input data-fuel=\"custom\" type=\"checkbox\"> Custom calculation</label><label><input data-fuel=\"hideReplay\" type=\"checkbox\"> Hide in replay</label><label><input data-fuel=\"hideGarage\" type=\"checkbox\"> Hide in garage</label></div><div class=\"option-grid\"><label>Temperature units<select data-fuel=\"tempUnits\"><option value=\"default\">Default</option><option value=\"c\">\u00B0C</option><option value=\"f\">\u00B0F</option><option value=\"both\">Both</option></select></label><label>Clock format<select data-fuel=\"clockFormat\"><option value=\"24h\">19:45</option><option value=\"12h\">7:45 PM</option></select></label><label>Custom usage<input data-fuel=\"customUsage\" type=\"number\" min=\"0\" max=\"99\" step=\"0.01\"></label></div>");
$("relativeAppearance").after(fuelAppearance);
selectOverlay = function (name) { selectedOverlay = name; $("inputsAppearance").classList.toggle("is-hidden", name !== "inputs"); $("relativeAppearance").classList.toggle("is-hidden", name !== "relative"); $("fuelAppearance").classList.toggle("is-hidden", name !== "fuel"); $("relativeSelect").classList.toggle("selected", name === "relative"); $("fuelSelect").classList.toggle("selected", name === "fuel"); $("inputsDropdown").classList.toggle("selected", name === "inputs"); updateEditButton(); };
updateEditButton = function () { if (!settings)
    return; const editing = selectedOverlay === "relative" ? settings.relativeEditMode : selectedOverlay === "fuel" ? settings.fuelEditMode : settings.editMode; $("editMode").classList.toggle("active", editing); $("editMode").textContent = editing ? "Finish editing" : selectedOverlay ? `Move and resize ${selectedOverlay}` : "Select an overlay to edit"; $("editMode").disabled = !selectedOverlay; };
$("editMode").onclick = () => { const key = selectedOverlay === "relative" ? "relativeEditMode" : selectedOverlay === "fuel" ? "fuelEditMode" : "editMode"; window.apex.setEditMode(!settings[key], selectedOverlay); };
$("fuelEnabled").onclick = e => e.stopPropagation();
$("fuelEnabled").onchange = e => window.apex.toggleFuel(e.target.checked);
$("fuelSelect").onclick = e => { if (e.target.id === "fuelEnabled")
    return; e.preventDefault(); selectOverlay("fuel"); };
document.querySelectorAll("[data-fuel]").forEach(el => el.oninput = e => { const key = e.target.dataset.fuel; const value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" || e.target.type === "number" ? Number(e.target.value) : e.target.value; if (key === "scale")
    $("fuelScaleOut").value = `${value}%`; if (key === "fontSize")
    $("fuelFontSizeOut").value = `${value}%`; if (key === "opacity")
    $("fuelOpacityOut").value = `${value}%`; if (key === "reserveLaps")
    $("fuelReserveOut").value = Number(value).toFixed(1); window.apex.updateSettings({ fuel: { [key]: value } }); });
function syncFuel(s) { $("fuelEnabled").checked = s.fuelEnabled; document.querySelectorAll("[data-fuel]").forEach(el => { const value = s.fuel[el.dataset.fuel]; if (el.type === "checkbox")
    el.checked = value;
else
    el.value = value; }); $("fuelScaleOut").value = `${s.fuel.scale}%`; $("fuelFontSizeOut").value = `${s.fuel.fontSize}%`; $("fuelOpacityOut").value = `${s.fuel.opacity}%`; $("fuelReserveOut").value = Number(s.fuel.reserveLaps).toFixed(1); }
window.apex.getSettings().then(syncFuel);
window.apex.onSettings(syncFuel);
const pitSelect = document.createElement("label");
pitSelect.id = "pitSelect";
pitSelect.className = "relative-select";
pitSelect.innerHTML = "<span class=\"dropdown-icon\">P</span><span><strong>Pit Helper</strong><small>Pit lane, limiter and race start</small></span><input id=\"pitEnabled\" type=\"checkbox\">";
$("fuelSelect").after(pitSelect);
document.querySelector(".panel-title>span").textContent = "4 AVAILABLE";
const pitAppearance = document.createElement("article");
pitAppearance.id = "pitAppearance";
pitAppearance.className = "panel appearance is-hidden";
pitAppearance.innerHTML = "<p class=\"eyebrow\">APPEARANCE \u00B7 PIT HELPER</p><h3>Pit Helper</h3><div class=\"check-options\"><label><input data-pit=\"pitLaneHelper\" type=\"checkbox\"> Pit-lane distance and speed</label><label><input data-pit=\"pitLimiter\" type=\"checkbox\"> Pit limiter indication</label><label><input data-pit=\"raceStartHelper\" type=\"checkbox\"> Race start clutch and throttle</label></div><label>Scale <output id=\"pitScaleOut\">100%</output><input data-pit=\"scale\" type=\"range\" min=\"70\" max=\"140\"></label><label>Text size <output id=\"pitFontSizeOut\">100%</output><input data-pit=\"fontSize\" type=\"range\" min=\"70\" max=\"160\"></label><label>Opacity <output id=\"pitOpacityOut\">94%</output><input data-pit=\"opacity\" type=\"range\" min=\"35\" max=\"100\"></label><div class=\"colors\"><label>Safe<input data-pit=\"safeColor\" type=\"color\"></label><label>Warning<input data-pit=\"warningColor\" type=\"color\"></label><label>Clutch<input data-pit=\"clutchColor\" type=\"color\"></label><label>Background<input data-pit=\"background\" type=\"color\"></label></div>";
$("fuelAppearance").after(pitAppearance);
selectOverlay = function (name) { selectedOverlay = name; $("inputsAppearance").classList.toggle("is-hidden", name !== "inputs"); $("relativeAppearance").classList.toggle("is-hidden", name !== "relative"); $("fuelAppearance").classList.toggle("is-hidden", name !== "fuel"); $("pitAppearance").classList.toggle("is-hidden", name !== "pit"); for (const item of ["relative", "fuel", "pit"])
    $(`${item}Select`).classList.toggle("selected", name === item); $("inputsDropdown").classList.toggle("selected", name === "inputs"); updateEditButton(); };
updateEditButton = function () { if (!settings)
    return; const editing = selectedOverlay === "relative" ? settings.relativeEditMode : selectedOverlay === "fuel" ? settings.fuelEditMode : selectedOverlay === "pit" ? settings.pitEditMode : settings.editMode; $("editMode").classList.toggle("active", editing); $("editMode").textContent = editing ? "Finish editing" : selectedOverlay ? `Move and resize ${selectedOverlay}` : "Select an overlay to edit"; $("editMode").disabled = !selectedOverlay; };
$("editMode").onclick = () => { const key = selectedOverlay === "relative" ? "relativeEditMode" : selectedOverlay === "fuel" ? "fuelEditMode" : selectedOverlay === "pit" ? "pitEditMode" : "editMode"; window.apex.setEditMode(!settings[key], selectedOverlay); };
$("pitEnabled").onclick = e => e.stopPropagation();
$("pitEnabled").onchange = e => window.apex.togglePit(e.target.checked);
$("pitSelect").onclick = e => { if (e.target.id === "pitEnabled")
    return; e.preventDefault(); selectOverlay("pit"); };
document.querySelectorAll("[data-pit]").forEach(el => el.oninput = e => { const key = e.target.dataset.pit, value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? Number(e.target.value) : e.target.value; if (key === "scale")
    $("pitScaleOut").value = `${value}%`; if (key === "fontSize")
    $("pitFontSizeOut").value = `${value}%`; if (key === "opacity")
    $("pitOpacityOut").value = `${value}%`; window.apex.updateSettings({ pit: { [key]: value } }); });
function syncPit(s) { $("pitEnabled").checked = s.pitEnabled; document.querySelectorAll("[data-pit]").forEach(el => { const value = s.pit[el.dataset.pit]; if (el.type === "checkbox")
    el.checked = value;
else
    el.value = value; }); $("pitScaleOut").value = `${s.pit.scale}%`; $("pitFontSizeOut").value = `${s.pit.fontSize}%`; $("pitOpacityOut").value = `${s.pit.opacity}%`; }
window.apex.getSettings().then(syncPit);
window.apex.onSettings(syncPit);
const pitDistanceOption = document.createElement("div");
pitDistanceOption.className = "option-grid";
pitDistanceOption.innerHTML = "<label>Show near pit within<input id=\"pitActivationDistance\" type=\"number\" min=\"50\" max=\"1500\" step=\"25\"><small>metres before the pit box</small></label>";
$("pitAppearance").appendChild(pitDistanceOption);
$("pitActivationDistance").oninput = e => window.apex.updateSettings({ pit: { activationDistance: Number(e.target.value) } });
function syncPitDistance(s) { $("pitActivationDistance").value = s.pit.activationDistance; }
window.apex.getSettings().then(syncPitDistance);
window.apex.onSettings(syncPitDistance);
const mguSelect = document.createElement("label");
mguSelect.id = "mguSelect";
mguSelect.className = "relative-select";
mguSelect.innerHTML = "<span class=\"dropdown-icon\">\u03DF</span><span><strong>MGU</strong><small>Hybrid battery and deployment</small></span><input id=\"mguEnabled\" type=\"checkbox\">";
$("pitSelect").after(mguSelect);
document.querySelector(".panel-title>span").textContent = "5 AVAILABLE";
const mguAppearance = document.createElement("article");
mguAppearance.id = "mguAppearance";
mguAppearance.className = "panel appearance is-hidden";
mguAppearance.innerHTML = "<p class=\"eyebrow\">APPEARANCE \u00B7 MGU</p><h3>Hybrid energy</h3><div class=\"check-options\"><label><input data-mgu=\"precision\" type=\"checkbox\"> Show 0.1 precision</label><label><input data-mgu=\"batteryBorder\" type=\"checkbox\"> Battery change border</label><label><input data-mgu=\"showDeployBar\" type=\"checkbox\"> Show deploy bar</label></div><label>Scale <output id=\"mguScaleOut\">100%</output><input data-mgu=\"scale\" type=\"range\" min=\"70\" max=\"140\"></label><label>Text size <output id=\"mguFontSizeOut\">100%</output><input data-mgu=\"fontSize\" type=\"range\" min=\"70\" max=\"160\"></label><label>Opacity <output id=\"mguOpacityOut\">96%</output><input data-mgu=\"opacity\" type=\"range\" min=\"35\" max=\"100\"></label><div class=\"colors\"><label>Battery<input data-mgu=\"batteryColor\" type=\"color\"></label><label>Deploy<input data-mgu=\"deployColor\" type=\"color\"></label><label>Charging<input data-mgu=\"chargeColor\" type=\"color\"></label><label>Draining<input data-mgu=\"drainColor\" type=\"color\"></label><label>Background<input data-mgu=\"background\" type=\"color\"></label></div>";
$("pitAppearance").after(mguAppearance);
selectOverlay = function (name) { selectedOverlay = name; for (const item of ["inputs", "relative", "fuel", "pit", "mgu"])
    $(`${item}Appearance`).classList.toggle("is-hidden", name !== item); for (const item of ["relative", "fuel", "pit", "mgu"])
    $(`${item}Select`).classList.toggle("selected", name === item); $("inputsDropdown").classList.toggle("selected", name === "inputs"); updateEditButton(); };
updateEditButton = function () { if (!settings)
    return; const map = { relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode" }, key = map[selectedOverlay] || "editMode", editing = settings[key]; $("editMode").classList.toggle("active", editing); $("editMode").textContent = editing ? "Finish editing" : selectedOverlay ? `Move and resize ${selectedOverlay}` : "Select an overlay to edit"; $("editMode").disabled = !selectedOverlay; };
$("editMode").onclick = () => { const map = { relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode" }, key = map[selectedOverlay] || "editMode"; window.apex.setEditMode(!settings[key], selectedOverlay); };
$("mguEnabled").onclick = e => e.stopPropagation();
$("mguEnabled").onchange = e => window.apex.toggleMgu(e.target.checked);
$("mguSelect").onclick = e => { if (e.target.id === "mguEnabled")
    return; e.preventDefault(); selectOverlay("mgu"); };
document.querySelectorAll("[data-mgu]").forEach(el => el.oninput = e => { const key = e.target.dataset.mgu, value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? Number(e.target.value) : e.target.value; if (key === "scale")
    $("mguScaleOut").value = `${value}%`; if (key === "fontSize")
    $("mguFontSizeOut").value = `${value}%`; if (key === "opacity")
    $("mguOpacityOut").value = `${value}%`; window.apex.updateSettings({ mgu: { [key]: value } }); });
function syncMgu(s) { $("mguEnabled").checked = s.mguEnabled; document.querySelectorAll("[data-mgu]").forEach(el => { const value = s.mgu[el.dataset.mgu]; if (el.type === "checkbox")
    el.checked = value;
else
    el.value = value; }); $("mguScaleOut").value = `${s.mgu.scale}%`; $("mguFontSizeOut").value = `${s.mgu.fontSize}%`; $("mguOpacityOut").value = `${s.mgu.opacity}%`; }
window.apex.getSettings().then(syncMgu);
window.apex.onSettings(syncMgu);
const radarSelect = document.createElement("label");
radarSelect.id = "radarSelect";
radarSelect.className = "relative-select";
radarSelect.innerHTML = "<span class=\"dropdown-icon\">)(</span><span><strong>Radar</strong><small>Side-by-side car detection</small></span><input id=\"radarEnabled\" type=\"checkbox\">";
$("mguSelect").after(radarSelect);
document.querySelector(".panel-title>span").textContent = "6 AVAILABLE";
const radarAppearance = document.createElement("article");
radarAppearance.id = "radarAppearance";
radarAppearance.className = "panel appearance is-hidden";
radarAppearance.innerHTML = "<p class=\"eyebrow\">APPEARANCE \u00B7 RADAR</p><h3>Side-by-side radar</h3><label>Background width <output id=\"radarBackgroundWidthOut\">20 px</output><input data-radar=\"backgroundWidth\" type=\"range\" min=\"4\" max=\"45\"></label><label>Line width <output id=\"radarLineWidthOut\">10 px</output><input data-radar=\"lineWidth\" type=\"range\" min=\"2\" max=\"30\"></label><label>Line opacity <output id=\"radarLineOpacityOut\">100%</output><input data-radar=\"lineOpacity\" type=\"range\" min=\"10\" max=\"100\"></label><label>Curvature <output id=\"radarCurvatureOut\">0%</output><input data-radar=\"curvature\" type=\"range\" min=\"0\" max=\"100\"></label><div class=\"option-grid\"><label>Cap style<select data-radar=\"capStyle\"><option value=\"none\">None</option><option value=\"square\">Square</option><option value=\"round\">Round</option></select></label><label>Distance ahead<input data-radar=\"distanceAhead\" type=\"number\" min=\"1\" max=\"15\" step=\"0.5\"></label><label>Distance behind<input data-radar=\"distanceBehind\" type=\"number\" min=\"1\" max=\"15\" step=\"0.5\"></label></div><div class=\"check-options\"><label><input data-radar=\"transition\" type=\"checkbox\"> Smooth transition</label></div><label>Scale <output id=\"radarScaleOut\">100%</output><input data-radar=\"scale\" type=\"range\" min=\"60\" max=\"160\"></label><label>Opacity <output id=\"radarOpacityOut\">100%</output><input data-radar=\"opacity\" type=\"range\" min=\"20\" max=\"100\"></label><div class=\"colors\"><label>Line<input data-radar=\"lineColor\" type=\"color\"></label><label>Background<input data-radar=\"background\" type=\"color\"></label></div>";
$("mguAppearance").after(radarAppearance);
selectOverlay = function (name) { selectedOverlay = name; for (const item of ["inputs", "relative", "fuel", "pit", "mgu", "radar"])
    $(`${item}Appearance`).classList.toggle("is-hidden", name !== item); for (const item of ["relative", "fuel", "pit", "mgu", "radar"])
    $(`${item}Select`).classList.toggle("selected", name === item); $("inputsDropdown").classList.toggle("selected", name === "inputs"); updateEditButton(); };
updateEditButton = function () { if (!settings)
    return; const map = { relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode", radar: "radarEditMode" }, key = map[selectedOverlay] || "editMode", editing = settings[key]; $("editMode").classList.toggle("active", editing); $("editMode").textContent = editing ? "Finish editing" : selectedOverlay ? `Move and resize ${selectedOverlay}` : "Select an overlay to edit"; $("editMode").disabled = !selectedOverlay; };
$("editMode").onclick = () => { const map = { relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode", radar: "radarEditMode" }, key = map[selectedOverlay] || "editMode"; window.apex.setEditMode(!settings[key], selectedOverlay); };
$("radarEnabled").onclick = e => e.stopPropagation();
$("radarEnabled").onchange = e => window.apex.toggleRadar(e.target.checked);
$("radarSelect").onclick = e => { if (e.target.id === "radarEnabled")
    return; e.preventDefault(); selectOverlay("radar"); };
document.querySelectorAll("[data-radar]").forEach(el => el.oninput = e => { const key = e.target.dataset.radar, value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" || e.target.type === "number" ? Number(e.target.value) : e.target.value; const suffix = { backgroundWidth: " px", lineWidth: " px", lineOpacity: "%", curvature: "%", scale: "%", opacity: "%" }[key]; if (suffix)
    $(`radar${key[0].toUpperCase() + key.slice(1)}Out`).value = `${value}${suffix}`; window.apex.updateSettings({ radar: { [key]: value } }); });
function syncRadar(s) { $("radarEnabled").checked = s.radarEnabled; document.querySelectorAll("[data-radar]").forEach(el => { const value = s.radar[el.dataset.radar]; if (el.type === "checkbox")
    el.checked = value;
else
    el.value = value; }); for (const [key, suffix] of Object.entries({ backgroundWidth: " px", lineWidth: " px", lineOpacity: "%", curvature: "%", scale: "%", opacity: "%" }))
    $(`radar${key[0].toUpperCase() + key.slice(1)}Out`).value = `${s.radar[key]}${suffix}`; }
window.apex.getSettings().then(syncRadar);
window.apex.onSettings(syncRadar);
const radarCurvatureControl = document.querySelector("[data-radar=\"curvature\"]").closest("label");
radarCurvatureControl.remove();
const radarCurvatureOut = document.createElement("output");
radarCurvatureOut.id = "radarCurvatureOut";
radarCurvatureOut.className = "is-hidden";
$("radarAppearance").appendChild(radarCurvatureOut);
const radarCapLabel = document.querySelector("[data-radar=\"capStyle\"]").closest("label");
radarCapLabel.firstChild.textContent = "Background cap style";
const standingsSelect = document.createElement("label");
standingsSelect.id = "standingsSelect";
standingsSelect.className = "relative-select";
standingsSelect.innerHTML = "<span class=\"dropdown-icon\">\u2261</span><span><strong>Standings</strong><small>Race order and class positions</small></span><input id=\"standingsEnabled\" type=\"checkbox\">";
$("radarSelect").after(standingsSelect);
document.querySelector(".panel-title>span").textContent = "7 AVAILABLE";
const standingsAppearance = document.createElement("article");
standingsAppearance.id = "standingsAppearance";
standingsAppearance.className = "panel appearance relative-options is-hidden";
standingsAppearance.innerHTML = "<p class=\"eyebrow\">APPEARANCE \u00B7 STANDINGS</p><h3>Standings</h3><div class=\"option-grid\"><label>Rows<input data-standings=\"rows\" type=\"number\" min=\"3\" max=\"64\"></label><label>Classes limit<input data-standings=\"classesLimit\" type=\"number\" min=\"1\" max=\"8\"></label><label>Multiclass color<select data-standings=\"multiclassColor\"><option value=\"car-number\">Car number</option><option value=\"car-number-bg\">Car number background</option></select></label><label>Name format<select data-standings=\"driverNameStyle\"><option value=\"full\">Joshua K Rogers</option><option value=\"initial-last\">J. Rogers</option><option value=\"last-first\">Rogers J.</option><option value=\"last\">Rogers</option><option value=\"initials\">J. R.</option></select></label><label>Name case<select data-standings=\"nameCase\"><option value=\"normal\">Normal</option><option value=\"small-caps\">Small caps</option><option value=\"uppercase\">UPPERCASE</option></select></label><label>Manufacturer logo<select data-standings=\"manufacturerLogo\"><option value=\"off\">Off</option><option value=\"multiclass\">Multiple car session</option><option value=\"always\">Always</option></select></label><label>Rating style<select data-standings=\"ratingStyle\"><option value=\"combined\">Combined badges</option><option value=\"separate\">Separate badges</option></select></label><label>Last lap seconds<input data-standings=\"lastLapSeconds\" type=\"number\" min=\"1\" max=\"60\"></label><label>Gain history laps<input data-standings=\"gainHistory\" type=\"number\" min=\"0\" max=\"10\"></label></div><label>Driver name width <output id=\"standingsDriverNameWidthOut\">100%</output><input data-standings=\"driverNameWidth\" type=\"range\" min=\"50\" max=\"180\"></label><div class=\"check-options\"><label><input data-standings=\"showCarNumbers\" type=\"checkbox\"> Show car numbers</label><label><input data-standings=\"multiclass\" type=\"checkbox\"> Multiclass standings</label><label><input data-standings=\"ratingBadges\" type=\"checkbox\"> Safety rating and iRating</label><label><input data-standings=\"iratingGain\" type=\"checkbox\"> Show iRating gain</label><label><input data-standings=\"showGap\" type=\"checkbox\"> Show gap</label><label><input data-standings=\"showInterval\" type=\"checkbox\"> Show interval</label><label><input data-standings=\"precisePracticeQualifying\" type=\"checkbox\"> Precise Practice & Qualifying</label><label><input data-standings=\"preciseRace\" type=\"checkbox\"> Precise Race</label><label><input data-standings=\"showPit\" type=\"checkbox\"> Show PIT indicator</label><label><input data-standings=\"showPitTime\" type=\"checkbox\"> Show pitting time</label><label><input data-standings=\"showLastLap\" type=\"checkbox\"> Show last lap time</label></div><label>Scale <output id=\"standingsScaleOut\">100%</output><input data-standings=\"scale\" type=\"range\" min=\"60\" max=\"150\"></label><label>Text size <output id=\"standingsFontSizeOut\">100%</output><input data-standings=\"fontSize\" type=\"range\" min=\"70\" max=\"160\"></label><label>Opacity <output id=\"standingsOpacityOut\">96%</output><input data-standings=\"opacity\" type=\"range\" min=\"30\" max=\"100\"></label><div class=\"colors\"><label>Accent<input data-standings=\"accent\" type=\"color\"></label><label>Background<input data-standings=\"background\" type=\"color\"></label></div>";
$("radarAppearance").after(standingsAppearance);
selectOverlay = function (name) { selectedOverlay = name; for (const item of ["inputs", "relative", "fuel", "pit", "mgu", "radar", "standings"])
    $(`${item}Appearance`).classList.toggle("is-hidden", name !== item); for (const item of ["relative", "fuel", "pit", "mgu", "radar", "standings"])
    $(`${item}Select`).classList.toggle("selected", name === item); $("inputsDropdown").classList.toggle("selected", name === "inputs"); updateEditButton(); };
updateEditButton = function () { if (!settings)
    return; const map = { relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode", radar: "radarEditMode", standings: "standingsEditMode" }, key = map[selectedOverlay] || "editMode", editing = settings[key]; $("editMode").classList.toggle("active", editing); $("editMode").textContent = editing ? "Finish editing" : selectedOverlay ? `Move and resize ${selectedOverlay}` : "Select an overlay to edit"; $("editMode").disabled = !selectedOverlay; };
$("editMode").onclick = () => { const map = { relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode", radar: "radarEditMode", standings: "standingsEditMode" }, key = map[selectedOverlay] || "editMode"; window.apex.setEditMode(!settings[key], selectedOverlay); };
$("standingsEnabled").onclick = e => e.stopPropagation();
$("standingsEnabled").onchange = e => window.apex.toggleStandings(e.target.checked);
$("standingsSelect").onclick = e => { if (e.target.id === "standingsEnabled")
    return; e.preventDefault(); selectOverlay("standings"); };
document.querySelectorAll("[data-standings]").forEach(el => el.oninput = e => { const key = e.target.dataset.standings, value = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" || e.target.type === "number" ? Number(e.target.value) : e.target.value; for (const output of ["driverNameWidth", "scale", "fontSize", "opacity"])
    if (key === output)
        $(`standings${output[0].toUpperCase() + output.slice(1)}Out`).value = `${value}%`; window.apex.updateSettings({ standings: { [key]: value } }); });
function syncStandings(s) { $("standingsEnabled").checked = s.standingsEnabled; document.querySelectorAll("[data-standings]").forEach(el => { const value = s.standings[el.dataset.standings]; if (el.type === "checkbox")
    el.checked = value;
else
    el.value = value; }); for (const key of ["driverNameWidth", "scale", "fontSize", "opacity"])
    $(`standings${key[0].toUpperCase() + key.slice(1)}Out`).value = `${s.standings[key]}%`; }
window.apex.getSettings().then(syncStandings);
window.apex.onSettings(syncStandings);
$("minimize").textContent = "\u2212";
$("minimize").title = "Minimize";
$("close").textContent = "\u00D7";
$("close").title = "Close";
const maximizeButton = document.createElement("button");
maximizeButton.id = "maximize";
maximizeButton.textContent = "\u25A1";
maximizeButton.title = "Maximize or restore";
$("close").before(maximizeButton);
maximizeButton.onclick = window.apex.maximize;
const customCard = document.createElement("div");
customCard.className = "settings-card custom-code";
customCard.innerHTML = "<p class=\"eyebrow\">ADVANCED</p><h3>Custom CSS</h3><p>Override the appearance of the app and overlays without changing internal files.</p><textarea id=\"customCssEditor\" spellcheck=\"false\" placeholder=\"Write CSS here...\"></textarea><div class=\"custom-actions\"><button id=\"saveCustomCss\" class=\"outline\">Apply and save</button><button id=\"openCustomCss\" class=\"outline\">Open CSS file</button><button id=\"reloadCustomCss\" class=\"outline\">Reload file</button><button id=\"resetCustomCss\" class=\"outline danger\">Reset</button></div><small id=\"customCssStatus\">Changes are stored in custom.css beside your settings.</small>";
$("settingsPage").appendChild(customCard);
$("resetCustomCss").textContent = "Load examples / reset";
window.apex.getCustomCss().then(css => $("customCssEditor").value = css);
$("saveCustomCss").onclick = async () => { const result = await window.apex.saveCustomCss($("customCssEditor").value); const hasContent = $("customCssEditor").value.trim().length > 0; $("customCssStatus").textContent = !result?.ok ? "Saved, but one or more windows could not apply the CSS." : hasContent && result.activeRules === 0 ? "Saved, but no active CSS rules were found. Check the comment markers and CSS syntax." : `Saved and applied (${result.activeRules} active rule${result.activeRules === 1 ? "" : "s"}).`; };
$("openCustomCss").onclick = async () => { const result = await window.apex.openCustomCss(); $("customCssStatus").textContent = result.error || `Opened ${result.file}`; };
$("reloadCustomCss").onclick = async () => { const css = await window.apex.reloadCustomCss(); $("customCssEditor").value = css; $("customCssStatus").textContent = "File reloaded and applied."; };
$("resetCustomCss").onclick = async () => { const css = await window.apex.resetCustomCss(); $("customCssEditor").value = css; $("customCssStatus").textContent = "Custom CSS reset."; };
const layoutEditor = document.createElement("section");
layoutEditor.className = "layout-editor";
layoutEditor.innerHTML = "<div class=\"layout-editor-title\"><div><strong>Visual layout editor</strong><small>Arrange every overlay on one screen</small></div><span class=\"layout-status\">OFF</span></div><button id=\"layoutEdit\" class=\"outline\">Edit all overlays</button><div class=\"layout-actions\"><button id=\"layoutUndo\" class=\"outline\" title=\"Undo the last complete move or resize\">Undo</button><button id=\"layoutReset\" class=\"outline\" title=\"Restore the selected overlay position and size\">Reset selected</button></div><label class=\"layout-lock\"><span><strong>Lock selected overlay</strong><small id=\"layoutSelection\">Select an overlay from the list</small></span><input id=\"layoutLock\" type=\"checkbox\"></label><p class=\"edit-help\">Overlays snap to screen edges, the centre and nearby overlays. Locked overlays stay visible but cannot be moved.</p>";
$("editMode").closest(".panel").appendChild(layoutEditor);
function syncLayoutEditor(s) {
    const active = Boolean(s.layoutEditMode), hasSelection = Boolean(selectedOverlay), locked = hasSelection && Boolean(s.lockedOverlays?.[selectedOverlay]);
    $("layoutEdit").classList.toggle("active", active);
    $("layoutEdit").textContent = active ? "Finish layout editing" : "Edit all overlays";
    layoutEditor.querySelector(".layout-status").textContent = active ? "EDITING" : "OFF";
    layoutEditor.classList.toggle("active", active);
    $("layoutLock").disabled = !hasSelection;
    $("layoutReset").disabled = !hasSelection;
    $("layoutLock").checked = locked;
    $("layoutSelection").textContent = hasSelection ? `${selectedOverlay[0].toUpperCase() + selectedOverlay.slice(1)} · ${locked ? "locked" : "unlocked"}` : "Select an overlay from the list";
}
const selectOverlayBeforeLayout = selectOverlay;
selectOverlay = function (name) { selectOverlayBeforeLayout(name); if (settings)
    syncLayoutEditor(settings); };
window.apex.getSettings().then(syncLayoutEditor);
window.apex.onSettings(syncLayoutEditor);
$("layoutEdit").onclick = () => window.apex.setLayoutEditMode(!settings.layoutEditMode);
$("layoutUndo").onclick = () => window.apex.layoutUndo();
$("layoutReset").onclick = () => { if (selectedOverlay)
    window.apex.resetOverlayLayout(selectedOverlay); };
$("layoutLock").onclick = e => e.stopPropagation();
$("layoutLock").onchange = e => { if (selectedOverlay)
    window.apex.setOverlayLocked(selectedOverlay, e.target.checked); };
const profilesNav = document.querySelector("nav button[disabled]");
profilesNav.id = "profilesNav";
profilesNav.disabled = false;
profilesNav.innerHTML = "<span>\u25EB</span> Profiles";
const profilesPage = document.createElement("section");
profilesPage.id = "profilesPage";
profilesPage.className = "settings-page profiles-page is-hidden";
profilesPage.innerHTML = "<p class=\"eyebrow\">PROFILES</p><h1>Your layouts.</h1><p>Save the position, size and visibility of every overlay, then restore them with one click.</p><div class=\"settings-card profile-create\"><h3>Create a profile</h3><p>Uses the layout that is currently visible on your screen.</p><div><input id=\"profileName\" maxlength=\"48\" placeholder=\"Profile name\"><button id=\"saveProfile\" class=\"outline\">Save current layout</button></div><small id=\"profileStatus\"></small></div><div id=\"profileList\" class=\"profile-list\"></div>";
document.querySelector("main").appendChild(profilesPage);
const showPageBeforeProfiles = showPage;
showPage = function (page) { showPageBeforeProfiles(page); $("profilesPage").classList.toggle("is-hidden", page !== "profiles"); $("profilesNav").classList.toggle("active", page === "profiles"); };
$("profilesNav").onclick = () => { showPage("profiles"); renderProfiles(); };
function escapeProfileName(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char])); }
async function renderProfiles() {
    const data = await window.apex.getProfiles();
    $("profileList").innerHTML = data.profiles.map(profile => `<article class="settings-card profile-card ${data.activeProfile === profile.id ? "selected" : ""}" data-profile="${profile.id}"><div class="profile-copy"><div><span class="profile-badge">${profile.builtin ? "INCLUDED" : "CUSTOM"}</span><h3>${escapeProfileName(profile.name)}</h3></div>${data.activeProfile === profile.id ? "<strong class=\"profile-active\">ACTIVE</strong>" : ""}</div><p>${profile.builtin ? "Responsive race layout: central Inputs, MGU and Radar; Standings and Fuel left; Relative right." : "Saved positions, sizes and enabled overlays."}</p><div class="profile-actions"><button class="outline" data-profile-action="apply">Apply profile</button>${profile.builtin ? "" : "<button class=\"outline danger\" data-profile-action=\"delete\">Delete</button>"}</div></article>`).join("");
}
$("saveProfile").onclick = async () => { const result = await window.apex.saveProfile($("profileName").value); if (result.error) {
    $("profileStatus").textContent = result.error;
    return;
} $("profileName").value = ""; $("profileStatus").textContent = "Profile saved from the current layout."; renderProfiles(); };
$("profileName").onkeydown = e => { if (e.key === "Enter")
    $("saveProfile").click(); };
$("profileList").onclick = async (e) => { const action = e.target.dataset.profileAction; if (!action)
    return; const id = e.target.closest("[data-profile]").dataset.profile; if (action === "apply") {
    await window.apex.applyProfile(id);
    $("profileStatus").textContent = "Profile applied.";
}
else if (action === "delete") {
    await window.apex.deleteProfile(id);
    $("profileStatus").textContent = "Profile deleted.";
} renderProfiles(); };
