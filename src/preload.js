/**
 * Security boundary between Electron's privileged main process and the HTML pages.
 *
 * Renderer pages handle presentation but never receive direct Node.js, file-system
 * or unrestricted IPC access. Each method below maps one explicit operation to a
 * named handler in main.js. This produces an auditable flow:
 * renderer -> window.apex -> IPC channel -> Electron main process.
 */
const { contextBridge, ipcRenderer } = require("electron");

// Promise-returning commands use `invoke`; one-way window commands use `send`.
contextBridge.exposeInMainWorld("apex", {
    // Persistent settings and overlay visibility.
    getSettings: () => ipcRenderer.invoke("settings:get"),
    updateSettings: patch => ipcRenderer.invoke("settings:update", patch),
    toggleOverlay: value => ipcRenderer.invoke("overlay:toggle", value),
    toggleRelative: value => ipcRenderer.invoke("relative:toggle", value),
    toggleFuel: value => ipcRenderer.invoke("fuel:toggle", value),
    togglePit: value => ipcRenderer.invoke("pit:toggle", value),
    toggleMgu: value => ipcRenderer.invoke("mgu:toggle", value),
    toggleP2p: value => ipcRenderer.invoke("p2p:toggle", value),
    toggleRadar: value => ipcRenderer.invoke("radar:toggle", value),
    toggleStandings: value => ipcRenderer.invoke("standings:toggle", value),
    setEditMode: (value, target = "inputs") => ipcRenderer.invoke("overlay:edit", value, target),
    setLayoutEditMode: value => ipcRenderer.invoke("layout:edit", value),
    setOverlayLocked: (target, value) => ipcRenderer.invoke("layout:lock", target, value),
    layoutUndo: () => ipcRenderer.invoke("layout:undo"),
    resetOverlayLayout: target => ipcRenderer.invoke("layout:reset", target),
    // Complete layout profile management.
    getProfiles: () => ipcRenderer.invoke("profiles:list"),
    saveProfile: name => ipcRenderer.invoke("profiles:save", name),
    applyProfile: id => ipcRenderer.invoke("profiles:apply", id),
    deleteProfile: id => ipcRenderer.invoke("profiles:delete", id),
    close: () => ipcRenderer.send("window:close"),
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    // Update-safe advanced CSS stored beside user settings.
    getCustomCss: () => ipcRenderer.invoke("custom-css:get"),
    saveCustomCss: css => ipcRenderer.invoke("custom-css:save", css),
    openCustomCss: () => ipcRenderer.invoke("custom-css:open"),
    reloadCustomCss: () => ipcRenderer.invoke("custom-css:reload"),
    resetCustomCss: () => ipcRenderer.invoke("custom-css:reset"),
    // Subscriptions receive serializable state pushed by the main process.
    onSettings: callback => ipcRenderer.on("settings", (_, data) => callback(data)),
    onTelemetry: callback => ipcRenderer.on("telemetry", (_, data) => callback(data)),
    onRelative: callback => ipcRenderer.on("relative", (_, data) => callback(data)),
    onTelemetryStatus: callback => ipcRenderer.on("telemetry:status", (_, data) => callback(data))
});
