/**
 * Exposes a deliberately small and safe renderer API through Electron contextBridge.
 */
const { contextBridge, ipcRenderer } = require("electron");

// Reuse one style element so saving custom CSS updates the page immediately
// without accumulating duplicate style blocks.
function applyCustomCss(css) {
    let style = document.getElementById("apex-custom-css");
    if (!style) {
        style = document.createElement("style");
        style.id = "apex-custom-css";
        document.head.appendChild(style);
    }
    style.textContent = css;
}

window.addEventListener("DOMContentLoaded", () => {
    // The page name lets custom.css target one overlay without affecting the
    // remaining renderer windows.
    document.documentElement.dataset.apexPage = location.pathname.split("/").pop().replace(".html", "");
    ipcRenderer.invoke("custom-css:get").then(applyCustomCss);
});
ipcRenderer.on("custom-css", (_, css) => applyCustomCss(css));

// Only explicit application operations are exposed. Renderer pages never
// receive direct access to Node.js, ipcRenderer, or the local file system.
contextBridge.exposeInMainWorld("apex", {
    getSettings: () => ipcRenderer.invoke("settings:get"),
    updateSettings: patch => ipcRenderer.invoke("settings:update", patch),
    toggleOverlay: value => ipcRenderer.invoke("overlay:toggle", value),
    toggleRelative: value => ipcRenderer.invoke("relative:toggle", value),
    toggleFuel: value => ipcRenderer.invoke("fuel:toggle", value),
    togglePit: value => ipcRenderer.invoke("pit:toggle", value),
    toggleMgu: value => ipcRenderer.invoke("mgu:toggle", value),
    toggleRadar: value => ipcRenderer.invoke("radar:toggle", value),
    toggleStandings: value => ipcRenderer.invoke("standings:toggle", value),
    setEditMode: (value, target = "inputs") => ipcRenderer.invoke("overlay:edit", value, target),
    setLayoutEditMode: value => ipcRenderer.invoke("layout:edit", value),
    setOverlayLocked: (target, value) => ipcRenderer.invoke("layout:lock", target, value),
    layoutUndo: () => ipcRenderer.invoke("layout:undo"),
    resetOverlayLayout: target => ipcRenderer.invoke("layout:reset", target),
    getProfiles: () => ipcRenderer.invoke("profiles:list"),
    saveProfile: name => ipcRenderer.invoke("profiles:save", name),
    applyProfile: id => ipcRenderer.invoke("profiles:apply", id),
    deleteProfile: id => ipcRenderer.invoke("profiles:delete", id),
    close: () => ipcRenderer.send("window:close"),
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    getCustomCss: () => ipcRenderer.invoke("custom-css:get"),
    saveCustomCss: css => ipcRenderer.invoke("custom-css:save", css),
    openCustomCss: () => ipcRenderer.invoke("custom-css:open"),
    reloadCustomCss: () => ipcRenderer.invoke("custom-css:reload"),
    resetCustomCss: () => ipcRenderer.invoke("custom-css:reset"),
    onSettings: callback => ipcRenderer.on("settings", (_, data) => callback(data)),
    onTelemetry: callback => ipcRenderer.on("telemetry", (_, data) => callback(data)),
    onRelative: callback => ipcRenderer.on("relative", (_, data) => callback(data)),
    onTelemetryStatus: callback => ipcRenderer.on("telemetry:status", (_, data) => callback(data))
});
