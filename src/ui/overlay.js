/**
 * Renders pedal inputs, gear, speed, steering direction, and the optional input history graph.
 */
const pedals = { clutch: ["CLU"], brake: ["BRK"], throttle: ["THR"] };
const history = { clutch: [], brake: [], throttle: [] };
let settings;
const $ = id => document.getElementById(id);
const speedLabel = document.createElement("small");
speedLabel.className = "speed";
speedLabel.textContent = "0 km/h";
$("gear").appendChild(speedLabel);
function render(s) {
    settings = s;
    const root = document.documentElement.style;
    root.setProperty("--accent", s.accent);
    root.setProperty("--panel", s.panel);
    root.setProperty("--text", s.text);
    root.setProperty("--scale", s.scale / 100);
    root.setProperty("--pedal-width", `${s.pedalWidth}px`);
    root.setProperty("--pedal-height", `${s.pedalHeight}px`);
    root.setProperty("--graph-height", `${s.graphHeight}px`);
    root.setProperty("--font-scale", s.inputsFontSize / 100);
    $("overlay").classList.toggle("editing", s.editMode);
    $("pedals").innerHTML = Object.entries(pedals).filter(([key]) => s.modules[key]).map(([key, value]) => `<div class="pedal ${s.pedalValuePosition === "top" ? "value-top" : ""}" data-key="${key}" style="--color:${s.pedalColors[key]}"><div class="bar"><i class="fill"></i></div><strong class="${!s.showPedalValues || !s.pedalValueVisibility[key] ? "value-hidden" : ""}">0%</strong><span>${value[0]}</span></div>`).join("");
    $("gear").style.display = s.modules.gear ? "flex" : "none";
    $("steering").style.display = s.modules.steering ? "flex" : "none";
    $("graph").style.display = s.graphEnabled ? "block" : "none";
}
function drawGraph() {
    if (!settings?.graphEnabled)
        return;
    const canvas = $("graph").querySelector("canvas");
    const box = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, box.width * dpr);
    canvas.height = Math.max(1, box.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#ffffff12";
    ctx.lineWidth = 1;
    for (let y = 0; y <= 4; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * box.height / 4);
        ctx.lineTo(box.width, y * box.height / 4);
        ctx.stroke();
    }
    for (const key of ["clutch", "brake", "throttle"]) {
        ctx.strokeStyle = settings.pedalColors[key];
        ctx.lineWidth = 2;
        ctx.beginPath();
        history[key].forEach((value, index) => {
            const x = index * box.width / 119;
            const y = box.height - value * box.height;
            index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
    }
}
window.apex.getSettings().then(render);
window.apex.onSettings(render);
window.apex.onTelemetry(data => {
    for (const key of Object.keys(history)) {
        history[key].push(Math.max(0, Math.min(1, data[key] || 0)));
        if (history[key].length > 120)
            history[key].shift();
    }
    document.querySelectorAll(".pedal").forEach(element => {
        const value = Math.max(0, Math.min(1, data[element.dataset.key] || 0));
        element.querySelector(".fill").style.height = `${value * 100}%`;
        element.querySelector("strong").textContent = `${Math.round(value * 100)}%`;
        if (element.dataset.key === "brake")
            element.classList.toggle("abs-active", Boolean(data.abs));
    });
    $("gear").querySelector("strong").textContent = data.gear === -1 ? "R" : data.gear === 0 ? "N" : data.gear;
    speedLabel.textContent = `${Math.round(Math.max(0, data.speedKph || 0))} km/h`;
    const degrees = -Math.round((data.steering || 0) * 57.2958);
    $("steering").querySelector("strong").textContent = `${degrees >= 0 ? "+" : ""}${degrees}°`;
    $("steering").querySelector(".wheel i").style.transform = `rotate(${degrees}deg)`;
    drawGraph();
});
