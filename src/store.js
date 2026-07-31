/**
 * Loads, merges, and persists user settings while preserving defaults introduced by newer versions.
 */
const fs = require("node:fs");
const path = require("node:path");
const { defaults } = require("./defaults");
class Store {
    constructor(userData) {
        this.file = path.join(userData, "settings.json");
        this.data = this.read();
    }
    read() {
        try {
            const saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
            // Nested groups are merged independently. This keeps existing user
            // choices while adding new keys introduced by later releases.
            return { ...defaults, ...saved, modules: { ...defaults.modules, ...saved.modules }, pedalColors: { ...defaults.pedalColors, ...saved.pedalColors }, pedalValueVisibility: { ...defaults.pedalValueVisibility, ...saved.pedalValueVisibility }, relative: { ...defaults.relative, ...saved.relative }, fuel: { ...defaults.fuel, ...saved.fuel }, pit: { ...defaults.pit, ...saved.pit }, mgu: { ...defaults.mgu, ...saved.mgu }, radar: { ...defaults.radar, ...saved.radar }, standings: { ...defaults.standings, ...saved.standings }, appTheme: { ...defaults.appTheme, ...saved.appTheme }, lockedOverlays: { ...defaults.lockedOverlays, ...saved.lockedOverlays }, profiles: { ...defaults.profiles, ...saved.profiles }, position: { ...defaults.position, ...saved.position }, relativePosition: { ...defaults.relativePosition, ...saved.relativePosition }, fuelPosition: { ...defaults.fuelPosition, ...saved.fuelPosition }, pitPosition: { ...defaults.pitPosition, ...saved.pitPosition }, mguPosition: { ...defaults.mguPosition, ...saved.mguPosition }, radarPosition: { ...defaults.radarPosition, ...saved.radarPosition }, standingsPosition: { ...defaults.standingsPosition, ...saved.standingsPosition } };
        }
        catch {
            return structuredClone(defaults);
        }
    }
    set(patch) {
        // Apply partial updates without replacing unrelated nested settings.
        this.data = { ...this.data, ...patch, modules: { ...this.data.modules, ...(patch.modules || {}) }, pedalColors: { ...this.data.pedalColors, ...(patch.pedalColors || {}) }, pedalValueVisibility: { ...this.data.pedalValueVisibility, ...(patch.pedalValueVisibility || {}) }, relative: { ...this.data.relative, ...(patch.relative || {}) }, fuel: { ...this.data.fuel, ...(patch.fuel || {}) }, pit: { ...this.data.pit, ...(patch.pit || {}) }, mgu: { ...this.data.mgu, ...(patch.mgu || {}) }, radar: { ...this.data.radar, ...(patch.radar || {}) }, standings: { ...this.data.standings, ...(patch.standings || {}) }, appTheme: { ...this.data.appTheme, ...(patch.appTheme || {}) }, lockedOverlays: { ...this.data.lockedOverlays, ...(patch.lockedOverlays || {}) }, profiles: patch.profiles === undefined ? this.data.profiles : { ...(patch.profiles || {}) } };
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
        return this.data;
    }
}
module.exports = { Store };
