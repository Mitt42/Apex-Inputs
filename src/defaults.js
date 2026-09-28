/**
 * Central catalogue of every user-configurable value in Apex Inputs.
 *
 * This object supplies settings on first launch, documents the settings schema
 * for developers, and provides fallbacks when an update introduces an option
 * that does not exist in an older settings.json file.
 *
 * Overlay settings are grouped by overlay name so a small partial update can be
 * merged without replacing unrelated choices. Window positions are separate
 * because Electron needs them before the corresponding HTML page has loaded.
 */
const defaults = {
    // Master visibility switches decide which independent overlay windows are shown.
    overlayEnabled: true,
    relativeEnabled: false,
    fuelEnabled: false,
    pitEnabled: false,
    mguEnabled: false,
    p2pEnabled: false,
    radarEnabled: false,
    standingsEnabled: false,
    // Edit flags make individual windows focusable, movable and resizable.
    editMode: false,
    relativeEditMode: false,
    fuelEditMode: false,
    pitEditMode: false,
    mguEditMode: false,
    p2pEditMode: false,
    radarEditMode: false,
    standingsEditMode: false,
    layoutEditMode: false,
    // Locked overlays stay visible in the layout editor but cannot move accidentally.
    lockedOverlays: { inputs: false, relative: false, fuel: false, pit: false, mgu: false, p2p: false, radar: false, standings: false },
    profiles: {},
    activeProfile: null,
    // Global behaviour shared by the application and the Inputs overlay.
    demoMode: true,
    clickThrough: true,
    opacity: 92,
    scale: 100,
    accent: "#f3ff4b",
    panel: "#11151b",
    text: "#f6f7f8",
    pedalWidth: 61,
    pedalHeight: 155,
    graphEnabled: false,
    graphHeight: 82,
    inputsFontSize: 100,
    showPedalValues: true,
    pedalValuePosition: "bottom",
    pedalValueVisibility: { throttle: true, brake: true, clutch: true },
    // Relative overlay information, formatting and appearance.
    relative: {
        rows: 7,
        rowStyle: "stripe-player",
        multiclassColor: "car-number",
        showInfoTop: true,
        oilTemp: false,
        waterTemp: false,
        brakeBias: true,
        airTemp: true,
        trackTemp: true,
        humidity: false,
        preciseTemps: true,
        tempUnits: "c",
        showSof: true,
        preciseSof: true,
        incidentsPractice: true,
        incidentsQualifying: true,
        incidentsRace: true,
        localTime: false,
        showCarNumbers: true,
        driverNameStyle: "initial-last",
        nameCase: "normal",
        pitBadge: true,
        ratingBadges: true,
        iratingGain: true,
        manufacturerLogo: "multiclass",
        sessionTimeOfDay: true,
        scale: 100,
        fontSize: 100,
        opacity: 94,
        accent: "#f3ff4b",
        background: "#11151b"
    },
    appTheme: { accent: "#f3ff4b", background: "#0a0c0f", panel: "#11151a", text: "#f3f5f6", fontScale: 100 },
    // Each object below contains behaviour and appearance for one overlay.
    fuel: { showInfoTop: true, oilTemp: true, waterTemp: true, brakeBias: true, airTemp: true, trackTemp: true, humidity: true, preciseTemps: true, tempUnits: "c", showSof: true, preciseSof: true, incidentsPractice: false, incidentsQualifying: false, incidentsRace: true, localTime: true, clockFormat: "24h", multiclassClock: true, qualifying: true, lastLap: true, custom: true, customUsage: 4.8, hideReplay: true, hideGarage: true, reserveLaps: 1, scale: 100, fontSize: 100, opacity: 94, accent: "#83a8ff", pitColor: "#dfff00", background: "#171816" },
    pit: { pitLaneHelper: true, pitLimiter: true, raceStartHelper: true, activationDistance: 350, scale: 100, fontSize: 100, opacity: 94, safeColor: "#62df50", warningColor: "#ff4d5d", clutchColor: "#4b70cf", background: "#17191c" },
    mgu: { precision: true, batteryBorder: true, showDeployBar: true, scale: 100, fontSize: 100, opacity: 96, batteryColor: "#61e77b", deployColor: "#ebef59", chargeColor: "#55c8ff", drainColor: "#ff9f43", background: "#4b4d50" },
    p2p: { showRemaining: true, showUsageTime: true, showCooldown: true, usageLimit: 10, cooldownDuration: 10, scale: 100, fontSize: 100, opacity: 96, readyColor: "#61e77b", activeColor: "#f3ff4b", cooldownColor: "#ff9f43", background: "#15191d" },
    radar: { backgroundWidth: 20, lineWidth: 10, lineColor: "#ffad22", lineOpacity: 100, curvature: 0, capStyle: "square", transition: true, distanceAhead: 4, distanceBehind: 4, scale: 100, opacity: 100, background: "#4b4b4b" },
    standings: { showCarNumbers: true, multiclass: true, rows: 12, classesLimit: 3, multiclassColor: "car-number", driverNameStyle: "initial-last", nameCase: "normal", driverNameWidth: 100, manufacturerLogo: "multiclass", ratingBadges: true, iratingGain: true, ratingStyle: "combined", showGap: true, showInterval: true, precisePracticeQualifying: true, preciseRace: false, showPit: true, showPitTime: false, showLastLap: true, lastLapSeconds: 10, gainHistory: 3, scale: 100, fontSize: 100, opacity: 96, accent: "#f3ff4b", background: "#1a1b19" },
    pedalColors: { throttle: "#f3ff4b", brake: "#ff4d5d", clutch: "#55c8ff" },
    modules: { throttle: true, brake: true, clutch: true, gear: true, steering: true },
    // Electron window bounds are physical desktop pixels persisted after move/resize.
    position: { x: 80, y: 720, width: 760, height: 230 },
    relativePosition: { x: 1360, y: 260, width: 520, height: 278 },
    fuelPosition: { x: 80, y: 450, width: 430, height: 210 },
    pitPosition: { x: 520, y: 420, width: 280, height: 430 },
    mguPosition: { x: 810, y: 720, width: 310, height: 85 },
    p2pPosition: { x: 1140, y: 720, width: 330, height: 92 },
    radarPosition: { x: 760, y: 280, width: 360, height: 300 },
    standingsPosition: { x: 25, y: 80, width: 760, height: 650 }
};
module.exports = { defaults };
