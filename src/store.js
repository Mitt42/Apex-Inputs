/**
 * Readable JSON-backed settings store.
 *
 * A database would add unnecessary complexity for a single-user desktop app.
 * JSON is sufficient, easy to back up and useful when diagnosing configuration.
 */
const fs = require("node:fs");
const path = require("node:path");
const { defaults } = require("./defaults");
class Store {
    /** Resolve the settings file and load a complete migration-safe object. */
    constructor(userData) {
        this.file = path.join(userData, "settings.json");
        this.data = this.read();
    }
    read() {
        try {
            // Merge every nested group separately. This preserves an existing
            // user's choices while adding keys introduced by newer releases.
            const saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
            // Nested groups are merged independently. This keeps existing user
            // choices while adding new keys introduced by later releases.
            return { ...defaults, ...saved, modules: { ...defaults.modules, ...saved.modules }, pedalColors: { ...defaults.pedalColors, ...saved.pedalColors }, pedalValueVisibility: { ...defaults.pedalValueVisibility, ...saved.pedalValueVisibility }, relative: { ...defaults.relative, ...saved.relative }, fuel: { ...defaults.fuel, ...saved.fuel }, pit: { ...defaults.pit, ...saved.pit }, mgu: { ...defaults.mgu, ...saved.mgu }, p2p: { ...defaults.p2p, ...saved.p2p }, radar: { ...defaults.radar, ...saved.radar }, standings: { ...defaults.standings, ...saved.standings }, appTheme: { ...defaults.appTheme, ...saved.appTheme }, lockedOverlays: { ...defaults.lockedOverlays, ...saved.lockedOverlays }, profiles: { ...defaults.profiles, ...saved.profiles }, position: { ...defaults.position, ...saved.position }, relativePosition: { ...defaults.relativePosition, ...saved.relativePosition }, fuelPosition: { ...defaults.fuelPosition, ...saved.fuelPosition }, pitPosition: { ...defaults.pitPosition, ...saved.pitPosition }, mguPosition: { ...defaults.mguPosition, ...saved.mguPosition }, p2pPosition: { ...defaults.p2pPosition, ...saved.p2pPosition }, radarPosition: { ...defaults.radarPosition, ...saved.radarPosition }, standingsPosition: { ...defaults.standingsPosition, ...saved.standingsPosition } };
        }
        catch {
            // Missing or malformed data behaves like a first launch. Clone the
            // defaults so runtime changes can never mutate the imported object.
            return structuredClone(defaults);
        }
    }
    set(patch) {
        // Partial merging allows `{ pit: { opacity: 80 } }` without requiring
        // the renderer to resend all other Pit Helper values.
        this.data = { ...this.data, ...patch, modules: { ...this.data.modules, ...(patch.modules || {}) }, pedalColors: { ...this.data.pedalColors, ...(patch.pedalColors || {}) }, pedalValueVisibility: { ...this.data.pedalValueVisibility, ...(patch.pedalValueVisibility || {}) }, relative: { ...this.data.relative, ...(patch.relative || {}) }, fuel: { ...this.data.fuel, ...(patch.fuel || {}) }, pit: { ...this.data.pit, ...(patch.pit || {}) }, mgu: { ...this.data.mgu, ...(patch.mgu || {}) }, p2p: { ...this.data.p2p, ...(patch.p2p || {}) }, radar: { ...this.data.radar, ...(patch.radar || {}) }, standings: { ...this.data.standings, ...(patch.standings || {}) }, appTheme: { ...this.data.appTheme, ...(patch.appTheme || {}) }, lockedOverlays: { ...this.data.lockedOverlays, ...(patch.lockedOverlays || {}) }, profiles: patch.profiles === undefined ? this.data.profiles : { ...(patch.profiles || {}) } };
        // Indented JSON remains human-readable for backups and support reports.
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
        return this.data;
    }
}
module.exports = { Store };
