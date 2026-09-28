/**
 * Electron main process and central coordinator for Apex Inputs.
 *
 * The application is split into three security and reliability layers:
 *
 * 1. This main process owns native desktop windows, files and application state.
 * 2. Renderer pages under src/ui draw the interface without direct Node.js access.
 * 3. A separate Node child process reads iRacing shared memory through the SDK.
 *
 * Telemetry follows this route:
 * iRacing shared memory -> telemetry worker -> TelemetryBridge -> main process
 * -> Electron IPC -> individual overlay renderer.
 *
 * User commands travel in the opposite direction through preload.js. Keeping
 * these responsibilities separate prevents a renderer or SDK failure from gaining
 * unrestricted file access or unnecessarily closing the complete interface.
 */
const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const { Store } = require("./store");
const { defaults } = require("./defaults");
const { TelemetryBridge } = require("./telemetry-bridge");
// Each overlay is a separate transparent BrowserWindow. Independent windows let
// users position overlays freely and allow hidden overlays to consume no screen area.
let controlWindow, overlayWindow, relativeWindow, fuelWindow, pitWindow, mguWindow, p2pWindow, radarWindow, standingsWindow, store;
// This flag distinguishes closing the control window from an intentional full shutdown.
let isQuitting = false;
const telemetry = new TelemetryBridge();

// Default examples shown in the advanced CSS editor. The file is copied to the
// user data directory once and is never overwritten during normal updates.
const DEFAULT_CUSTOM_CSS = `/* =====================================================
   APEX INPUTS - CUSTOM CSS
   =====================================================
   This file is preserved beside your settings.
   All examples below are disabled with comment markers.
   To enable one, remove the standalone opening marker before its CSS and the
   standalone closing marker after it. Keep the labelled heading comment.

   Window names:
   control, overlay, relative, fuel, pit, mgu, p2p, radar, standings
   ===================================================== */

/* APP - Purple theme */
/*
html[data-apex-page="control"] {
  --accent: #b26cff;
  --bg: #090611;
  --card: #151020;
  --text: #f8f3ff;
}
*/

/* APP - Rounder panels and buttons */
/*
html[data-apex-page="control"] .panel,
html[data-apex-page="control"] .settings-card,
html[data-apex-page="control"] .module,
html[data-apex-page="control"] button {
  border-radius: 14px;
}
*/

/* INPUTS - Rounded glass style */
/*
html[data-apex-page="overlay"] .pedal,
html[data-apex-page="overlay"] .gear,
html[data-apex-page="overlay"] .steering,
html[data-apex-page="overlay"] .graph {
  border-radius: 14px;
  background: rgba(8, 12, 18, 0.78);
  backdrop-filter: blur(10px);
}
*/

/* INPUTS - Bigger gear and speed */
/*
html[data-apex-page="overlay"] .gear strong { font-size: 90px; }
html[data-apex-page="overlay"] .gear .speed { font-size: 13px; color: #ffffff; }
*/

/* RELATIVE - Taller rows and highlighted player */
/*
html[data-apex-page="relative"] .car-row { height: 32px; }
html[data-apex-page="relative"] .car-row.player {
  background: #5b3df033;
  border-left-color: #b26cff;
}
*/

/* RELATIVE - Hide manufacturer and rating badges */
/*
html[data-apex-page="relative"] .maker,
html[data-apex-page="relative"] .badge { display: none; }
*/

/* FUEL - Large values with transparent background */
/*
html[data-apex-page="fuel"] .fuel { background: rgba(0, 0, 0, 0.55); }
html[data-apex-page="fuel"] .calculations strong { font-size: 28px; }
*/

/* PIT HELPER - Neon limiter */
/*
html[data-apex-page="pit"] .limiter {
  text-shadow: 0 0 10px currentColor;
  box-shadow: 0 0 14px currentColor;
}
*/

/* MGU - Thin compact bars */
/*
html[data-apex-page="mgu"] .energy { height: 26px; border-width: 2px; }
html[data-apex-page="mgu"] .energy strong { font-size: 14px; }
*/

/* PUSH TO PASS - Compact status panel */
/*
html[data-apex-page="p2p"] main {
  border-radius: 12px;
  background: rgba(8, 12, 18, 0.82);
}
*/

/* RADAR - Wider background bars */
/*
html[data-apex-page="radar"] .rail { width: 28px; opacity: 0.85; }
html[data-apex-page="radar"] .segment { width: 12px; }
*/

/* STANDINGS - Compact broadcast style */
/*
html[data-apex-page="standings"] .standing-row {
  min-height: 25px;
  font-family: Consolas, monospace;
  background: rgba(10, 10, 12, 0.88);
}
html[data-apex-page="standings"] .standing-row.player {
  background: #f3ff4b22;
}
*/

/* ALL OVERLAYS - Stronger shadow */
/*
html:not([data-apex-page="control"]) main {
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.85));
}
*/
`;
// Portable builds keep settings beside the executable. Source/development builds
// use Electron's normal userData directory under the current Windows account.
if (app.isPackaged)
    app.setPath("userData", path.join(path.dirname(process.execPath), "data"));

// Every application window receives the saved stylesheet after its document
// has loaded. The same path is used by newly enabled overlays and reloads.
app.on("web-contents-created", (_event, contents) => {
    // Apply custom CSS after every document load, including overlays created later.
    contents.on("did-finish-load", () => void applyCustomCssToContents(contents));
});

// -----------------------------------------------------------------------------
// Window creation
// -----------------------------------------------------------------------------

function createControl() {
    // The control panel uses a custom title bar, therefore the native frame is disabled.
    controlWindow = new BrowserWindow({
        width: 1120,
        height: 760,
        minWidth: 920,
        minHeight: 650,
        frame: false,
        backgroundColor: "#0b0d10",
        title: "Apex Inputs",
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
    });
    controlWindow.loadFile(path.join(__dirname, "ui", "control.html"));
    controlWindow.webContents.on("did-finish-load", () => controlWindow?.webContents.send("telemetry:status", telemetry.status));
    controlWindow.on("closed", () => {
        controlWindow = null;
        if (!isQuitting)
            app.quit();
    });
}
function safeBounds(position) {
    // Clamp saved coordinates to the closest monitor. This recovers windows after a
    // monitor is removed or desktop resolution changes between launches.
    const area = screen.getDisplayMatching(position).workArea;
    return {
        width: Math.min(position.width, area.width),
        height: Math.min(position.height, area.height),
        x: Math.max(area.x, Math.min(position.x, area.x + area.width - 160)),
        y: Math.max(area.y, Math.min(position.y, area.y + area.height - 80))
    };
}
function createOverlay() {
    // Inputs is transparent, always on top and click-through outside edit mode.
    const b = safeBounds(store.data.position);
    overlayWindow = new BrowserWindow({
        ...b,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        hasShadow: false,
        focusable: store.data.editMode,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.setOpacity(store.data.opacity / 100);
    overlayWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.editMode, { forward: true });
    overlayWindow.loadFile(path.join(__dirname, "ui", "overlay.html"));
    overlayWindow.on("moved", saveBounds);
    overlayWindow.on("resized", saveBounds);
    if (!store.data.overlayEnabled)
        overlayWindow.hide();
}
function createRelativeOverlay() {
    // Relative receives the slower participant model rather than every 60 Hz input frame.
    const b = safeBounds(store.data.relativePosition);
    relativeWindow = new BrowserWindow({
        ...b,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        hasShadow: false,
        focusable: store.data.relativeEditMode,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    relativeWindow.setAlwaysOnTop(true, "screen-saver");
    relativeWindow.setOpacity(store.data.relative.opacity / 100);
    relativeWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.relativeEditMode, { forward: true });
    relativeWindow.loadFile(path.join(__dirname, "ui", "relative.html"));
    const saveRelativeBounds = () => {
        if (relativeWindow && !relativeWindow.isDestroyed())
            store.set({ relativePosition: relativeWindow.getBounds() });
    };
    relativeWindow.on("moved", saveRelativeBounds);
    relativeWindow.on("resized", saveRelativeBounds);
    if (!store.data.relativeEnabled)
        relativeWindow.hide();
}
function createFuelOverlay() {
    // Fuel calculations are rendered in their own resizable transparent surface.
    const b = safeBounds(store.data.fuelPosition);
    fuelWindow = new BrowserWindow({
        ...b,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        hasShadow: false,
        focusable: store.data.fuelEditMode,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    fuelWindow.setAlwaysOnTop(true, "screen-saver");
    fuelWindow.setOpacity(store.data.fuel.opacity / 100);
    fuelWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.fuelEditMode, { forward: true });
    fuelWindow.loadFile(path.join(__dirname, "ui", "fuel.html"));
    const saveFuelBounds = () => { if (fuelWindow && !fuelWindow.isDestroyed())
        store.set({ fuelPosition: fuelWindow.getBounds() }); };
    fuelWindow.on("moved", saveFuelBounds);
    fuelWindow.on("resized", saveFuelBounds);
    if (!store.data.fuelEnabled)
        fuelWindow.hide();
}
function createPitOverlay() {
    // Pit Helper remains created while hidden so it can appear immediately near the pits.
    const b = safeBounds(store.data.pitPosition);
    pitWindow = new BrowserWindow({ ...b, frame: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true, resizable: true, movable: true, hasShadow: false, focusable: store.data.pitEditMode, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    pitWindow.setAlwaysOnTop(true, "screen-saver");
    pitWindow.setOpacity(store.data.pit.opacity / 100);
    pitWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.pitEditMode, { forward: true });
    pitWindow.loadFile(path.join(__dirname, "ui", "pit.html"));
    const save = () => { if (pitWindow && !pitWindow.isDestroyed())
        store.set({ pitPosition: pitWindow.getBounds() }); };
    pitWindow.on("moved", save);
    pitWindow.on("resized", save);
    if (!store.data.pitEnabled)
        pitWindow.hide();
}
function createMguOverlay() { const b = safeBounds(store.data.mguPosition); mguWindow = new BrowserWindow({ ...b, frame: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true, resizable: true, movable: true, hasShadow: false, focusable: store.data.mguEditMode, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); mguWindow.setAlwaysOnTop(true, "screen-saver"); mguWindow.setOpacity(store.data.mgu.opacity / 100); mguWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.mguEditMode, { forward: true }); mguWindow.loadFile(path.join(__dirname, "ui", "mgu.html")); const save = () => { if (mguWindow && !mguWindow.isDestroyed())
    store.set({ mguPosition: mguWindow.getBounds() }); }; mguWindow.on("moved", save); mguWindow.on("resized", save); if (!store.data.mguEnabled)
    mguWindow.hide(); }
function createP2pOverlay() { const b = safeBounds(store.data.p2pPosition); p2pWindow = new BrowserWindow({ ...b, frame: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true, resizable: true, movable: true, hasShadow: false, focusable: store.data.p2pEditMode, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); p2pWindow.setAlwaysOnTop(true, "screen-saver"); p2pWindow.setOpacity(store.data.p2p.opacity / 100); p2pWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.p2pEditMode, { forward: true }); p2pWindow.loadFile(path.join(__dirname, "ui", "p2p.html")); const save = () => { if (p2pWindow && !p2pWindow.isDestroyed())
    store.set({ p2pPosition: p2pWindow.getBounds() }); }; p2pWindow.on("moved", save); p2pWindow.on("resized", save); if (!store.data.p2pEnabled)
    p2pWindow.hide(); }
function createRadarOverlay() { const b = safeBounds(store.data.radarPosition); radarWindow = new BrowserWindow({ ...b, frame: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true, resizable: true, movable: true, hasShadow: false, focusable: store.data.radarEditMode, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); radarWindow.setAlwaysOnTop(true, "screen-saver"); radarWindow.setOpacity(store.data.radar.opacity / 100); radarWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.radarEditMode, { forward: true }); radarWindow.loadFile(path.join(__dirname, "ui", "radar.html")); const save = () => { if (radarWindow && !radarWindow.isDestroyed())
    store.set({ radarPosition: radarWindow.getBounds() }); }; radarWindow.on("moved", save); radarWindow.on("resized", save); if (!store.data.radarEnabled)
    radarWindow.hide(); }
function createStandingsOverlay() { const b = safeBounds(store.data.standingsPosition); standingsWindow = new BrowserWindow({ ...b, frame: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true, resizable: true, movable: true, hasShadow: false, focusable: store.data.standingsEditMode, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); standingsWindow.setAlwaysOnTop(true, "screen-saver"); standingsWindow.setOpacity(store.data.standings.opacity / 100); standingsWindow.setIgnoreMouseEvents(store.data.clickThrough && !store.data.standingsEditMode, { forward: true }); standingsWindow.loadFile(path.join(__dirname, "ui", "standings.html")); const save = () => { if (standingsWindow && !standingsWindow.isDestroyed())
    store.set({ standingsPosition: standingsWindow.getBounds() }); }; standingsWindow.on("moved", save); standingsWindow.on("resized", save); if (!store.data.standingsEnabled)
    standingsWindow.hide(); }
function saveBounds() {
    // Electron fires this callback after both movement and resizing of Inputs.
    if (!overlayWindow || overlayWindow.isDestroyed())
        return;
    store.set({ position: overlayWindow.getBounds() });
}

// -----------------------------------------------------------------------------
// Shared settings and custom CSS distribution
// -----------------------------------------------------------------------------

function publishSettings() {
    // One canonical settings object is broadcast to all pages after any mutation.
    for (const win of [controlWindow, overlayWindow, relativeWindow, fuelWindow, pitWindow, mguWindow, p2pWindow, radarWindow, standingsWindow])
        if (win && !win.isDestroyed())
            win.webContents.send("settings", store.data);
}
function customCssPath() { return path.join(app.getPath("userData"), "custom.css"); }
// Create the editable stylesheet only once; updates must preserve user changes.
function ensureCustomCss() { const file = customCssPath(); if (!fs.existsSync(file))
    fs.writeFileSync(file, DEFAULT_CUSTOM_CSS, "utf8"); return file; }
function normalizeCustomCss(css) {
    // Older examples placed their label inside the opening comment marker.
    // Users following the old instructions could leave that label as bare,
    // invalid CSS. Convert only known example headings into safe comments.
    return String(css).replace(/^(APP|INPUTS|RELATIVE|FUEL|PIT HELPER|MGU|PUSH TO PASS|RADAR|STANDINGS|ALL OVERLAYS) - ([^\r\n{}/*]+)$/gm, "/* $1 - $2 */");
}
function readCustomCss() { try {
    const file = ensureCustomCss();
    const original = fs.readFileSync(file, "utf8");
    const normalized = normalizeCustomCss(original);
    if (normalized !== original)
        fs.writeFileSync(file, normalized, "utf8");
    return normalized;
}
catch {
    return DEFAULT_CUSTOM_CSS;
} }
async function applyCustomCssToContents(contents, css = readCustomCss()) {
    if (!contents || contents.isDestroyed())
        return false;
    // Run in the renderer's main world after the document is ready. This avoids
    // context-isolation differences in preload scripts and makes the result
    // immediately visible without reloading the window.
    // Execute a small self-contained function in the page. A data attribute identifies
    // the current overlay, allowing selectors such as html[data-apex-page="radar"].
    const source = `(${function injectCustomCss(value) {
        document.documentElement.dataset.apexPage = location.pathname.split("/").pop().replace(".html", "");
        let style = document.getElementById("apex-custom-css");
        if (!style) {
            style = document.createElement("style");
            style.id = "apex-custom-css";
            document.head.appendChild(style);
        }
        style.textContent = value;
        // User rules receive !important in memory so bundled overlay rules do not
        // unexpectedly override customisation. The source custom.css stays readable.
        const promoteRules = rules => {
            for (const rule of Array.from(rules || [])) {
                if (rule.cssRules)
                    promoteRules(rule.cssRules);
                if (!rule.style)
                    continue;
                for (let index = 0; index < rule.style.length; index += 1) {
                    const property = rule.style[index];
                    if (rule.style.getPropertyPriority(property) !== "important")
                        rule.style.setProperty(property, rule.style.getPropertyValue(property), "important");
                }
            }
        };
        try {
            promoteRules(style.sheet?.cssRules);
        }
        catch { }
        return { page: document.documentElement.dataset.apexPage, rules: style.sheet?.cssRules.length || 0 };
    }.toString()})(${JSON.stringify(String(css))})`;
    try {
        const result = await contents.executeJavaScript(source, true);
        telemetry.log("custom-css-applied", {
            page: result?.page || contents.getURL(),
            rules: result?.rules || 0,
            length: String(css).length
        });
        return result;
    }
    catch (error) {
        telemetry.log("custom-css-apply-error", { detail: error?.message || String(error) });
        return null;
    }
}
async function publishCustomCss(css = readCustomCss()) {
    const windows = [controlWindow, overlayWindow, relativeWindow, fuelWindow, pitWindow, mguWindow, p2pWindow, radarWindow, standingsWindow]
        .filter(win => win && !win.isDestroyed());
    const results = await Promise.all(windows.map(win => applyCustomCssToContents(win.webContents, css)));
    const validResults = results.filter(Boolean);
    return {
        ok: validResults.length === windows.length,
        activeRules: Math.max(0, ...validResults.map(result => Number(result.rules) || 0)),
        pages: validResults.map(result => result.page)
    };
}
const overlayGeometry = {
    // `base` is the design size at 100%. Width changes are converted back to a
    // scale percentage, keeping the settings slider and native resize in sync.
    inputs: { base: [760, 230], settings: "scale", edit: "editMode", range: [70, 140] },
    relative: { base: [520, 278], settings: "relative", edit: "relativeEditMode", range: [70, 140] },
    fuel: { base: [430, 210], settings: "fuel", edit: "fuelEditMode", range: [70, 140] },
    pit: { base: [280, 430], settings: "pit", edit: "pitEditMode", range: [70, 140] },
    mgu: { base: [310, 85], settings: "mgu", edit: "mguEditMode", range: [70, 140] },
    p2p: { base: [330, 92], settings: "p2p", edit: "p2pEditMode", range: [70, 140] },
    radar: { base: [360, 300], settings: "radar", edit: "radarEditMode", range: [60, 160] },
    standings: { base: [760, 650], settings: "standings", edit: "standingsEditMode", range: [60, 150] }
};
const programmaticResize = new WeakSet();
// Weak collections mark movements initiated by code. Those operations must not be
// mistaken for a user gesture or added as another undo snapshot.
const programmaticMove = new WeakSet(), activeLayoutGesture = new WeakSet(), gestureEndTimers = new WeakMap();
const layoutUndoStack = [];
const overlayTargets = ["inputs", "relative", "fuel", "pit", "mgu", "p2p", "radar", "standings"];

// -----------------------------------------------------------------------------
// Visual layout editor and profile management
// -----------------------------------------------------------------------------

function geometryWindow(target) { return target === "inputs" ? overlayWindow : target === "relative" ? relativeWindow : target === "fuel" ? fuelWindow : target === "pit" ? pitWindow : target === "mgu" ? mguWindow : target === "p2p" ? p2pWindow : target === "radar" ? radarWindow : standingsWindow; }
function positionKey(target) { return target === "inputs" ? "position" : `${target}Position`; }
function layoutSnapshot() { return Object.fromEntries(overlayTargets.map(target => [target, geometryWindow(target).getBounds()])); }
// Undo stores complete layouts rather than individual coordinates, which guarantees
// that snapping and proportional resizing can be reversed as one coherent action.
function rememberLayout() { layoutUndoStack.push(layoutSnapshot()); if (layoutUndoStack.length > 40)
    layoutUndoStack.shift(); }
function beginLayoutGesture(win) { if (!store.data.layoutEditMode || programmaticMove.has(win) || programmaticResize.has(win) || activeLayoutGesture.has(win))
    return; rememberLayout(); activeLayoutGesture.add(win); }
function finishLayoutGesture(win) { clearTimeout(gestureEndTimers.get(win)); gestureEndTimers.set(win, setTimeout(() => { activeLayoutGesture.delete(win); gestureEndTimers.delete(win); }, 220)); }
function applyLayout(snapshot) { for (const target of overlayTargets) {
    const win = geometryWindow(target);
    if (!snapshot[target] || !win || win.isDestroyed())
        continue;
    programmaticMove.add(win);
    programmaticResize.add(win);
    win.setBounds(snapshot[target]);
    store.set({ [positionKey(target)]: snapshot[target] });
    const geometry = overlayGeometry[target], raw = Math.round(snapshot[target].width / geometryBase(target)[0] * 100);
    setScaleValue(target, Math.max(geometry.range[0], Math.min(geometry.range[1], raw)));
    setTimeout(() => { programmaticMove.delete(win); programmaticResize.delete(win); }, 80);
} publishSettings(); }
function snappedBounds(target, bounds) { const tolerance = 12, area = screen.getDisplayMatching(bounds).workArea, result = { ...bounds }, xs = [area.x, area.x + area.width - bounds.width, area.x + (area.width - bounds.width) / 2], ys = [area.y, area.y + area.height - bounds.height, area.y + (area.height - bounds.height) / 2]; for (const other of overlayTargets) {
    if (other === target)
        continue;
    const win = geometryWindow(other);
    if (!win?.isVisible())
        continue;
    const b = win.getBounds();
    xs.push(b.x, b.x + b.width, b.x - bounds.width, b.x + b.width - bounds.width);
    ys.push(b.y, b.y + b.height, b.y - bounds.height, b.y + b.height - bounds.height);
} for (const x of xs)
    if (Math.abs(result.x - x) <= tolerance) {
        result.x = Math.round(x);
        break;
    } for (const y of ys)
    if (Math.abs(result.y - y) <= tolerance) {
        result.y = Math.round(y);
        break;
    } return result; }
function geometryBase(target) { return target === "relative" ? [520, 82 + Math.max(3, store.data.relative.rows) * 28] : overlayGeometry[target].base; }
function scaleValue(target, data = store.data) { const key = overlayGeometry[target].settings; return key === "scale" ? data.scale : data[key].scale; }
function setScaleValue(target, value) { const key = overlayGeometry[target].settings; store.set(key === "scale" ? { scale: value } : { [key]: { scale: value } }); }
function resizeForScale(target, value) { const win = geometryWindow(target); if (!win || win.isDestroyed())
    return; const [width, height] = geometryBase(target); programmaticResize.add(win); win.setSize(Math.round(width * value / 100), Math.round(height * value / 100), false); setTimeout(() => programmaticResize.delete(win), 80); }
function currentProfile(name) {
    // A profile captures geometry and visibility, not live telemetry or temporary edit state.
    return { name, createdAt: new Date().toISOString(), layout: layoutSnapshot(), enabled: Object.fromEntries(overlayTargets.map(target => [target, Boolean(store.data[enabledKeys[target]])])) };
}
function starterProfile() {
    // Calculate positions from the active monitor instead of assuming a fixed resolution.
    const area = screen.getDisplayMatching(controlWindow.getBounds()).workArea, margin = 24, size = Object.fromEntries(overlayTargets.map(target => [target, geometryBase(target)]));
    const groupHeight = size.radar[1] + 12 + size.mgu[1] + 12 + size.inputs[1], groupTop = area.y + Math.max(margin, Math.round((area.height - groupHeight) / 2)), centerX = width => area.x + Math.round((area.width - width) / 2);
    return { name: "Centered race layout", builtin: true, layout: {
            standings: { x: area.x + margin, y: area.y + margin, width: size.standings[0], height: size.standings[1] },
            fuel: { x: area.x + margin, y: area.y + area.height - size.fuel[1] - margin, width: size.fuel[0], height: size.fuel[1] },
            relative: { x: area.x + area.width - size.relative[0] - margin, y: area.y + area.height - size.relative[1] - margin, width: size.relative[0], height: size.relative[1] },
            radar: { x: centerX(size.radar[0]), y: groupTop, width: size.radar[0], height: size.radar[1] },
            mgu: { x: centerX(size.mgu[0]), y: groupTop + size.radar[1] + 12, width: size.mgu[0], height: size.mgu[1] },
            p2p: { ...defaults.p2pPosition },
            inputs: { x: centerX(size.inputs[0]), y: groupTop + size.radar[1] + 12 + size.mgu[1] + 12, width: size.inputs[0], height: size.inputs[1] },
            pit: { ...defaults.pitPosition }
        }, enabled: { inputs: true, relative: true, fuel: true, pit: false, mgu: true, p2p: false, radar: true, standings: true } };
}
function applyProfile(id, profile) {
    // Preserve the previous arrangement for Undo before changing every window.
    rememberLayout();
    const layout = Object.fromEntries(overlayTargets.map(target => [target, safeBounds(profile.layout[target] || store.data[positionKey(target)])]));
    applyLayout(layout);
    const patch = { activeProfile: id };
    for (const target of overlayTargets)
        patch[enabledKeys[target]] = Boolean(profile.enabled[target]);
    store.set(patch);
    for (const target of overlayTargets) {
        const win = geometryWindow(target);
        (profile.enabled[target] || store.data.layoutEditMode) ? win.showInactive() : win.hide();
    }
    publishSettings();
    return store.data;
}
function attachScaleSync(target) {
    // Native edge dragging changes the corresponding scale setting. Slider changes
    // call resizeForScale(), providing two-way synchronisation.
    const win = geometryWindow(target), geometry = overlayGeometry[target];
    let lastPublished = 0;
    const syncBounds = bounds => {
        if (programmaticResize.has(win) || !store.data[geometry.edit])
            return;
        const [baseWidth] = geometryBase(target), scale = Math.max(geometry.range[0], Math.min(geometry.range[1], Math.round(bounds.width / baseWidth * 100)));
        if (scale === scaleValue(target))
            return;
        setScaleValue(target, scale);
        const now = Date.now();
        if (now - lastPublished >= 16) {
            lastPublished = now;
            publishSettings();
        }
    };
    win.on("will-resize", (_, bounds) => syncBounds(bounds));
    win.on("will-resize", () => beginLayoutGesture(win));
    win.on("will-move", () => beginLayoutGesture(win));
    win.on("resized", () => { syncBounds(win.getBounds()); finishLayoutGesture(win); publishSettings(); });
    win.on("moved", () => { if (store.data.layoutEditMode && !programmaticMove.has(win)) {
        const snapped = snappedBounds(target, win.getBounds());
        if (JSON.stringify(snapped) !== JSON.stringify(win.getBounds())) {
            programmaticMove.add(win);
            win.setBounds(snapped);
            setTimeout(() => programmaticMove.delete(win), 60);
        }
        store.set({ [positionKey(target)]: snapped });
    } finishLayoutGesture(win); });
}
// -----------------------------------------------------------------------------
// Application startup and telemetry event routing
// -----------------------------------------------------------------------------

app.whenReady().then(() => {
    // Electron APIs such as screen and BrowserWindow are valid only after readiness.
    store = new Store(app.getPath("userData"));
    store.set({ layoutEditMode: false, editMode: false, relativeEditMode: false, fuelEditMode: false, pitEditMode: false, mguEditMode: false, p2pEditMode: false, radarEditMode: false, standingsEditMode: false });
    ensureCustomCss();
    telemetry.setLogFile(path.join(app.getPath("userData"), "telemetry-diagnostic.log"));
    createControl();
    createOverlay();
    createRelativeOverlay();
    createFuelOverlay();
    createPitOverlay();
    createMguOverlay();
    createP2pOverlay();
    createRadarOverlay();
    createStandingsOverlay();
    for (const target of Object.keys(overlayGeometry))
        attachScaleSync(target);
    resizeForScale("relative", scaleValue("relative"));
    // High-frequency vehicle data is routed only to overlays that consume it.
    telemetry.on("data", data => {
        if (overlayWindow && !overlayWindow.isDestroyed())
            overlayWindow.webContents.send("telemetry", data);
        if (controlWindow && !controlWindow.isDestroyed())
            controlWindow.webContents.send("telemetry", data);
        if (fuelWindow && !fuelWindow.isDestroyed())
            fuelWindow.webContents.send("telemetry", data);
        if (pitWindow && !pitWindow.isDestroyed())
            pitWindow.webContents.send("telemetry", data);
        if (mguWindow && !mguWindow.isDestroyed())
            mguWindow.webContents.send("telemetry", data);
        if (p2pWindow && !p2pWindow.isDestroyed())
            p2pWindow.webContents.send("telemetry", data);
        if (radarWindow && !radarWindow.isDestroyed())
            radarWindow.webContents.send("telemetry", data);
    });
    // Participant frames are shared by Relative and Standings.
    telemetry.on("relative", data => {
        if (relativeWindow && !relativeWindow.isDestroyed())
            relativeWindow.webContents.send("relative", data);
        if (standingsWindow && !standingsWindow.isDestroyed())
            standingsWindow.webContents.send("relative", data);
    });
    telemetry.on("status", status => {
        for (const win of [controlWindow, overlayWindow])
            if (win && !win.isDestroyed())
                win.webContents.send("telemetry:status", status);
    });
    telemetry.start(store.data.demoMode);
});
// -----------------------------------------------------------------------------
// IPC commands exposed to renderer windows through preload.js
// -----------------------------------------------------------------------------

ipcMain.handle("settings:get", () => store.data);
ipcMain.handle("custom-css:get", () => readCustomCss());
ipcMain.handle("custom-css:save", async (_, css) => {
    const normalized = normalizeCustomCss(css);
    fs.writeFileSync(ensureCustomCss(), normalized, "utf8");
    return publishCustomCss(normalized);
});
ipcMain.handle("custom-css:open", async () => { const file = ensureCustomCss(); const error = await shell.openPath(file); return { file, error }; });
ipcMain.handle("custom-css:reload", async () => { const css = readCustomCss(); await publishCustomCss(css); return css; });
ipcMain.handle("custom-css:reset", async () => { fs.writeFileSync(ensureCustomCss(), DEFAULT_CUSTOM_CSS, "utf8"); await publishCustomCss(DEFAULT_CUSTOM_CSS); return DEFAULT_CUSTOM_CSS; });
ipcMain.handle("settings:update", (_, patch) => {
    // Compare scale values before and after merging so only changed windows resize.
    const oldDemo = store.data.demoMode;
    const oldRelativeRows = store.data.relative.rows;
    const oldScales = Object.fromEntries(Object.keys(overlayGeometry).map(target => [target, scaleValue(target)]));
    store.set(patch);
    for (const target of Object.keys(overlayGeometry)) {
        const next = scaleValue(target);
        if (next !== oldScales[target])
            resizeForScale(target, next);
    }
    if (store.data.relative.rows !== oldRelativeRows)
        resizeForScale("relative", store.data.relative.scale);
    overlayWindow?.setOpacity(store.data.opacity / 100);
    relativeWindow?.setOpacity(store.data.relative.opacity / 100);
    fuelWindow?.setOpacity(store.data.fuel.opacity / 100);
    pitWindow?.setOpacity(store.data.pit.opacity / 100);
    mguWindow?.setOpacity(store.data.mgu.opacity / 100);
    p2pWindow?.setOpacity(store.data.p2p.opacity / 100);
    radarWindow?.setOpacity(store.data.radar.opacity / 100);
    standingsWindow?.setOpacity(store.data.standings.opacity / 100);
    overlayWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.editMode, { forward: true });
    relativeWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.relativeEditMode, { forward: true });
    fuelWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.fuelEditMode, { forward: true });
    pitWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.pitEditMode, { forward: true });
    mguWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.mguEditMode, { forward: true });
    p2pWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.p2pEditMode, { forward: true });
    radarWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.radarEditMode, { forward: true });
    standingsWindow?.setIgnoreMouseEvents(store.data.clickThrough && !store.data.standingsEditMode, { forward: true });
    if (oldDemo !== store.data.demoMode)
        telemetry.start(store.data.demoMode);
    publishSettings();
    return store.data;
});
ipcMain.handle("overlay:toggle", (_, value) => {
    store.set({ overlayEnabled: value });
    (value || store.data.layoutEditMode) ? overlayWindow.showInactive() : overlayWindow.hide();
    publishSettings();
    return store.data;
});
ipcMain.handle("relative:toggle", (_, value) => {
    store.set({ relativeEnabled: value });
    (value || store.data.layoutEditMode) ? relativeWindow.showInactive() : relativeWindow.hide();
    publishSettings();
    return store.data;
});
ipcMain.handle("fuel:toggle", (_, value) => {
    store.set({ fuelEnabled: value });
    (value || store.data.layoutEditMode) ? fuelWindow.showInactive() : fuelWindow.hide();
    publishSettings();
    return store.data;
});
ipcMain.handle("pit:toggle", (_, value) => { store.set({ pitEnabled: value }); (value || store.data.layoutEditMode) ? pitWindow.showInactive() : pitWindow.hide(); publishSettings(); return store.data; });
ipcMain.handle("mgu:toggle", (_, value) => { store.set({ mguEnabled: value }); (value || store.data.layoutEditMode) ? mguWindow.showInactive() : mguWindow.hide(); publishSettings(); return store.data; });
ipcMain.handle("p2p:toggle", (_, value) => { store.set({ p2pEnabled: value }); (value || store.data.layoutEditMode) ? p2pWindow.showInactive() : p2pWindow.hide(); publishSettings(); return store.data; });
ipcMain.handle("radar:toggle", (_, value) => { store.set({ radarEnabled: value }); (value || store.data.layoutEditMode) ? radarWindow.showInactive() : radarWindow.hide(); publishSettings(); return store.data; });
ipcMain.handle("standings:toggle", (_, value) => { store.set({ standingsEnabled: value }); (value || store.data.layoutEditMode) ? standingsWindow.showInactive() : standingsWindow.hide(); publishSettings(); return store.data; });
const editKeys = { inputs: "editMode", relative: "relativeEditMode", fuel: "fuelEditMode", pit: "pitEditMode", mgu: "mguEditMode", p2p: "p2pEditMode", radar: "radarEditMode", standings: "standingsEditMode" };
const enabledKeys = { inputs: "overlayEnabled", relative: "relativeEnabled", fuel: "fuelEnabled", pit: "pitEnabled", mgu: "mguEnabled", p2p: "p2pEnabled", radar: "radarEnabled", standings: "standingsEnabled" };
ipcMain.handle("layout:edit", (_, value) => {
    // Global layout mode exposes every overlay, including normally disabled ones.
    value = Boolean(value);
    const patch = { layoutEditMode: value };
    for (const target of overlayTargets)
        patch[editKeys[target]] = value;
    store.set(patch);
    for (const target of overlayTargets) {
        const win = geometryWindow(target);
        if (!win || win.isDestroyed())
            continue;
        const locked = Boolean(store.data.lockedOverlays[target]);
        win.setFocusable(value && !locked);
        win.setMovable(!locked);
        win.setResizable(value && !locked);
        if (value) {
            const base = geometryBase(target);
            win.setAspectRatio(base[0] / base[1]);
            win.setIgnoreMouseEvents(locked, { forward: true });
            win.setAlwaysOnTop(true, "floating");
            win.showInactive();
        }
        else {
            win.setAspectRatio(0);
            win.setMovable(true);
            win.setResizable(true);
            win.setIgnoreMouseEvents(store.data.clickThrough, { forward: true });
            win.setAlwaysOnTop(true, "screen-saver");
            if (!store.data[enabledKeys[target]])
                win.hide();
        }
    }
    controlWindow.setAlwaysOnTop(value, value ? "screen-saver" : "normal");
    controlWindow.show();
    controlWindow.focus();
    publishSettings();
    return store.data;
});
ipcMain.handle("layout:lock", (_, target, value) => {
    // Validate target names before selecting a BrowserWindow from internal maps.
    if (!overlayTargets.includes(target))
        return store.data;
    store.set({ lockedOverlays: { [target]: Boolean(value) } });
    const win = geometryWindow(target), locked = Boolean(value);
    if (win && !win.isDestroyed()) {
        win.setMovable(!locked);
        win.setResizable(store.data.layoutEditMode && !locked);
        win.setFocusable(store.data.layoutEditMode && !locked);
        win.setIgnoreMouseEvents(locked || (!store.data.layoutEditMode && store.data.clickThrough), { forward: true });
    }
    publishSettings();
    return store.data;
});
ipcMain.handle("layout:undo", () => { const current = layoutSnapshot(); while (layoutUndoStack.length) {
    const previous = layoutUndoStack.pop();
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
        applyLayout(previous);
        break;
    }
} return store.data; });
ipcMain.handle("layout:reset", (_, target) => {
    // Reset means the shipped position and 100% scale for the selected overlay only.
    if (!overlayTargets.includes(target))
        return store.data;
    rememberLayout();
    const win = geometryWindow(target), initial = defaults[positionKey(target)], [width, height] = geometryBase(target), bounds = safeBounds({ ...initial, width, height });
    programmaticMove.add(win);
    programmaticResize.add(win);
    win.setBounds(bounds);
    setScaleValue(target, 100);
    store.set({ [positionKey(target)]: bounds });
    setTimeout(() => { programmaticMove.delete(win); programmaticResize.delete(win); }, 80);
    publishSettings();
    return store.data;
});
ipcMain.handle("profiles:list", () => ({ activeProfile: store.data.activeProfile, profiles: [{ id: "starter", ...starterProfile() }, ...Object.entries(store.data.profiles).map(([id, profile]) => ({ id, ...profile, builtin: false }))] }));
ipcMain.handle("profiles:save", (_, rawName) => {
    // Limit profile names before writing them into the local settings file.
    const name = String(rawName || "").trim().slice(0, 48);
    if (!name)
        return { error: "Enter a profile name." };
    const id = `profile-${Date.now().toString(36)}`, profiles = { ...store.data.profiles, [id]: currentProfile(name) };
    store.set({ profiles, activeProfile: id });
    publishSettings();
    return { id, profile: profiles[id] };
});
ipcMain.handle("profiles:apply", (_, id) => { const profile = id === "starter" ? starterProfile() : store.data.profiles[id]; if (!profile)
    return { error: "Profile not found." }; applyProfile(id, profile); return { id }; });
ipcMain.handle("profiles:delete", (_, id) => { if (id === "starter")
    return { error: "The included profile cannot be deleted." }; const profiles = { ...store.data.profiles }; delete profiles[id]; store.set({ profiles, activeProfile: store.data.activeProfile === id ? null : store.data.activeProfile }); publishSettings(); return true; });
ipcMain.handle("overlay:edit", (_, value, target) => {
    // Individual edit mode focuses one overlay while keeping the control panel available.
    const win = geometryWindow(target || "inputs");
    const key = editKeys[target || "inputs"];
    store.set({ [key]: value });
    win.setFocusable(value);
    win.setMovable(true);
    win.setResizable(true);
    if (value) {
        const normalizedTarget = target || "inputs", base = geometryBase(normalizedTarget);
        win.setAspectRatio(base[0] / base[1]);
        resizeForScale(normalizedTarget, scaleValue(normalizedTarget));
    }
    else
        win.setAspectRatio(0);
    win.setAlwaysOnTop(true, value ? "floating" : "screen-saver");
    win.setIgnoreMouseEvents(!value && store.data.clickThrough, { forward: true });
    controlWindow.setAlwaysOnTop(value, value ? "screen-saver" : "normal");
    if (value) {
        win.show();
        win.focus();
        controlWindow.show();
        controlWindow.focus();
    }
    publishSettings();
    return store.data;
});

// Window controls are custom because the control panel uses a frameless window.
ipcMain.on("window:close", () => controlWindow.close());
ipcMain.on("window:minimize", () => controlWindow.minimize());
ipcMain.on("window:maximize", () => controlWindow.isMaximized() ? controlWindow.unmaximize() : controlWindow.maximize());
app.on("window-all-closed", () => app.quit());

// Stop telemetry first so the utility process cannot publish events while the
// overlay windows are being destroyed.
app.on("before-quit", () => {
    // Stop telemetry before destroying renderers so no late frame targets a dead page.
    isQuitting = true;
    telemetry.stop();
    if (overlayWindow && !overlayWindow.isDestroyed())
        overlayWindow.destroy();
    if (relativeWindow && !relativeWindow.isDestroyed())
        relativeWindow.destroy();
    if (fuelWindow && !fuelWindow.isDestroyed())
        fuelWindow.destroy();
    if (pitWindow && !pitWindow.isDestroyed())
        pitWindow.destroy();
    if (mguWindow && !mguWindow.isDestroyed())
        mguWindow.destroy();
    if (p2pWindow && !p2pWindow.isDestroyed())
        p2pWindow.destroy();
    if (radarWindow && !radarWindow.isDestroyed())
        radarWindow.destroy();
    if (standingsWindow && !standingsWindow.isDestroyed())
        standingsWindow.destroy();
});
