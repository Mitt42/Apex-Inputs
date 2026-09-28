/**
 * iRacing data acquisition and normalisation service.
 *
 * iRacing publishes live values through local Windows shared memory. No Internet
 * connection or external server is involved in this pipeline. `irsdk-node` reads
 * the shared-memory pages, after which this class converts native typed buffers
 * into plain JavaScript numbers and arrays suitable for process IPC.
 *
 * Two event streams are produced:
 * - `data`: vehicle inputs and overlay calculations, normally read at 60 Hz.
 * - `relative`: the participant model used by Relative and Standings.
 *
 * Demonstration mode follows the same output schema as live mode. Renderer pages
 * therefore do not need separate code paths for simulated and real telemetry.
 */
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const EMPTY_FRAME = Object.freeze({ connected: false, demo: false, throttle: 0, brake: 0, clutch: 0, steering: 0, gear: 0, abs: false, tcActive: false, tcAvailable: false, p2pAvailable: false, fuelLevel: 0, fuelPerLap: 0, lapsRemaining: 0 });
const EMPTY_RELATIVE_FRAME = Object.freeze({ demo: false, cars: [] });
class Telemetry extends EventEmitter {
    /** Initialise timers, SDK references, diagnostic state and derived-value memory. */
    constructor() {
        super();
        this.dataTimer = null;
        this.retryTimer = null;
        this.demoTimer = null;
        this.sdk = null;
        this.native = null;
        this.demo = true;
        this.phase = 0;
        this.demoTick = 0;
        this.lastDataAt = 0;
        this.connecting = false;
        this.status = { state: "waiting", label: "A iniciar telemetria", detail: "" };
        this.logFile = null;
        this.lastDiagnosticAt = 0;
        this.sessionVersion = -1;
        this.session = null;
        this.frameErrorCount = 0;
        this.firstFramePending = false;
        this.p2pStartedAt = 0;
        this.p2pLastEndedAt = 0;
        this.p2pWasActive = false;
        this.p2pCapabilityCarKey = null;
        this.p2pCapabilityConfirmed = false;
    }
    setLogFile(file) {
        // The worker supplies a local path; logs contain diagnostics, not telemetry uploads.
        this.logFile = file;
        this.log("startup", { platform: process.platform, arch: process.arch, versions: process.versions });
    }
    log(event, data = {}) {
        // Newline-delimited JSON makes each event independently readable and searchable.
        if (!this.logFile)
            return;
        try {
            fs.appendFileSync(this.logFile, `${JSON.stringify({ time: new Date().toISOString(), event, ...data })}\n`);
        }
        catch { }
    }
    async start(demo = true) {
        // Always release the previous mode before starting another set of timers.
        this.stop();
        this.demo = demo;
        if (demo) {
            // Demo frames run at 30 Hz, which is visually smooth without unnecessary work.
            this.setStatus("demo", "Modo demonstra\u00E7\u00E3o");
            this.demoTimer = setInterval(() => {
                this.emit("data", this.demoFrame());
                if (this.demoTick++ % 3 === 0)
                    this.emit("relative", this.demoRelativeFrame());
            }, 1000 / 30);
            return;
        }
        this.setStatus("waiting", "\u00C0 espera do iRacing");
        this.emit("data", EMPTY_FRAME);
        // Clear demonstration participants immediately. Real drivers are only
        // displayed after iRacing supplies a valid participant frame.
        this.emit("relative", EMPTY_RELATIVE_FRAME);
        await this.tryConnect();
        // iRacing may start after Apex Inputs, so retry without requiring an app restart.
        this.retryTimer = setInterval(() => {
            if (!this.sdk && !this.connecting)
                void this.tryConnect();
        }, 2000);
    }
    loadSdkLibrary() {
        // Lazy loading lets demo mode operate on computers where the optional native
        // dependency is unavailable or the user is not running Windows.
        if (this.native)
            return this.native;
        // Use the library's supported wrapper instead of invoking the native
        // binding directly. It initializes the SDK state and safely copies
        // shared-memory values before application code reads them.
        this.native = require("irsdk-node");
        return this.native;
    }

    // Convert the SDK's typed buffers into plain arrays before sending data to
    // Electron renderers. Partial trailing values are ignored safely.
    decodeVariable(variable) {
        // varType values come from the iRacing SDK. Correct typed-array selection is
        // essential: interpreting four-byte floats as bytes would corrupt every value.
        if (!variable || variable.value == null)
            return null;
        const raw = variable.value;
        if (!(raw instanceof ArrayBuffer))
            return Array.isArray(raw) || ArrayBuffer.isView(raw) ? Array.from(raw) : [raw];
        if (variable.varType === 0 || variable.varType === 1)
            return Array.from(new Int8Array(raw));
        if (variable.varType === 2 || variable.varType === 3)
            return Array.from(new Int32Array(raw, 0, Math.floor(raw.byteLength / 4)));
        if (variable.varType === 4)
            return Array.from(new Float32Array(raw, 0, Math.floor(raw.byteLength / 4)));
        if (variable.varType === 5)
            return Array.from(new Float64Array(raw, 0, Math.floor(raw.byteLength / 8)));
        return null;
    }

    // Session YAML changes less frequently than live telemetry. The version
    // check avoids parsing the same document sixty times per second.
    updateSessionData() {
        try {
            const version = this.sdk.getSessionVersionNum?.() ?? -1;
            if (version === this.sessionVersion && this.session)
                return;
            let yaml;
            try {
                yaml = require("js-yaml");
            }
            catch {
                const { createRequire } = require("node:module");
                yaml = createRequire(require.resolve("irsdk-node"))("js-yaml");
            }
            // Session data is YAML containing track, driver, car and session metadata.
            const sessionData = this.sdk.getSessionData() || {};
            this.session = typeof sessionData === "string" ? yaml.load(sessionData) || {} : sessionData;
            this.sessionVersion = version;
        }
        catch (error) {
            this.log("session-parse-error", { detail: error.message });
        }
    }

    // Build the shared driver model consumed by Relative and Standings.
    emitRelative(telemetry) {
        this.updateSessionData();
        // The complete telemetry snapshot already contains every variable made
        // available by the current car. Do not query missing optional variables
        // individually: some native SDK builds crash when resolving a name that
        // is absent for the active car.
        const array = name => this.decodeVariable(telemetry[name]) || [];
        const scalar = name => array(name)[0] ?? 0;
        const player = scalar("PlayerCarIdx");
        const positions = array("CarIdxPosition");
        const classPositions = array("CarIdxClassPosition");
        const distances = array("CarIdxLapDistPct");
        const estTimes = array("CarIdxEstTime");
        const pit = array("CarIdxOnPitRoad");
        const lastLaps = array("CarIdxLastLapTime");
        const bestLaps = array("CarIdxBestLapTime");
        const lapsCompleted = array("CarIdxLapCompleted");
        const drivers = this.session?.DriverInfo?.Drivers || [];
        const byIdx = new Map(drivers.map(driver => [driver.CarIdx, driver]));
        const playerEst = estTimes[player] || 0;
        const playerBest = bestLaps[player] > 0 ? bestLaps[player] : 90;
        // Build one renderer-safe record for each active participant index.
        const cars = positions.map((position, carIdx) => {
            if (!position || distances[carIdx] == null || distances[carIdx] < 0)
                return null;
            const driver = byIdx.get(carIdx) || {};
            // Estimated lap times wrap at start/finish. Correcting half-lap jumps keeps
            // nearby cars ordered around the player instead of the timing line.
            let gap = (estTimes[carIdx] || 0) - playerEst;
            if (gap > playerBest / 2)
                gap -= playerBest;
            if (gap < -playerBest / 2)
                gap += playerBest;
            return {
                carIdx,
                position,
                classPosition: classPositions[carIdx] || 0,
                gap,
                isPlayer: carIdx === player,
                name: driver.UserName || `Car ${carIdx}`,
                number: driver.CarNumber || String(carIdx),
                classColor: driver.CarClassColor || 0,
                classId: driver.CarClassID || 0,
                irating: driver.IRating || 0,
                license: driver.LicString || "",
                car: driver.CarScreenNameShort || "",
                onPitRoad: Boolean(pit[carIdx]),
                lastLap: lastLaps[carIdx] || 0,
                bestLap: bestLaps[carIdx] || 0,
                iratingGain: 0,
                lapsCompleted: lapsCompleted[carIdx] || 0,
                positionGain: 0,
                pitTime: 0
            };
        }).filter(Boolean).sort((a, b) => a.gap - b.gap);
        // iRating gain is an estimate for presentation, not an official result value.
        const ratedCars = cars.filter(car => car.irating > 0);
        for (const car of ratedCars) {
            const expected = ratedCars.length > 1 ? ratedCars.filter(other => other !== car).reduce((sum, other) => sum + 1 / (1 + Math.pow(10, (other.irating - car.irating) / 1600)), 0) / (ratedCars.length - 1) : 0.5;
            const result = ratedCars.length > 1 ? (ratedCars.length - car.position) / (ratedCars.length - 1) : 0.5;
            car.iratingGain = Math.round(160 * (result - expected));
        }
        this.emit("relative", {
            demo: false,
            cars,
            playerCarIdx: player,
            sessionType: this.session?.SessionInfo?.Sessions?.[scalar("SessionNum")]?.SessionType || "",
            airTemp: scalar("AirTemp"),
            trackTemp: scalar("TrackTempCrew"),
            humidity: scalar("RelativeHumidity"),
            oilTemp: scalar("OilTemp"),
            waterTemp: scalar("WaterTemp"),
            brakeBias: scalar("dcBrakeBias"),
            sessionTime: scalar("SessionTimeOfDay"),
            sessionTimeRemaining: scalar("SessionTimeRemain"),
            lap: scalar("Lap"),
            sessionLapsRemaining: scalar("SessionLapsRemain"),
            incidents: scalar("PlayerCarMyIncidentCount")
        });
    }

    // Connect when iRacing becomes available. A failed attempt is harmless;
    // start() schedules another attempt every two seconds.
    async tryConnect() {
        if (this.demo || this.sdk || this.connecting)
            return false;
        this.connecting = true;
        try {
            const { IRacingSDK } = this.loadSdkLibrary();
            // Disabling the variable cache avoids stale optional-variable definitions
            // when the user changes car or session without restarting Apex Inputs.
            const sdk = new IRacingSDK({
                autoEnableTelemetry: true,
                useTelemVariableCache: false
            });
            if (!sdk.startSDK()) {
                sdk.stopSDK?.();
                this.setStatus("waiting", "\u00C0 espera do iRacing");
                this.log("sdk-start-failed");
                return false;
            }
            this.sdk = sdk;
            this.lastDataAt = Date.now();
            this.frameErrorCount = 0;
            this.firstFramePending = true;
            this.setStatus("connecting", "A sincronizar telemetria");
            this.log("sdk-started");
            this.dataTimer = setInterval(() => this.readFrame(), 1000 / 60);
            return true;
        }
        catch (error) {
            this.setStatus("error", "Erro no SDK", error.message);
            return false;
        }
        finally {
            this.connecting = false;
        }
    }

    // Read and normalize one live frame. All renderer-facing values are plain
    // numbers, booleans, strings, and arrays that can be cloned safely by IPC.
    readFrame() {
        // This method is intentionally synchronous and short because it runs up to
        // sixty times per second while iRacing is producing new shared-memory pages.
        if (!this.sdk)
            return;
        try {
            if (this.firstFramePending === true) {
                this.log("first-frame-wait-started");
                this.firstFramePending = "waiting";
            }
            // Wait briefly for a fresh SDK page. A timeout is normal between updates;
            // thirty seconds without data is treated as a disconnected simulator.
            if (!this.sdk.waitForData(8)) {
                if (Date.now() - this.lastDataAt > 30000)
                    this.disconnect();
                return;
            }
            if (this.firstFramePending)
                this.log("first-frame-wait-complete");
            this.lastDataAt = Date.now();
            const telemetry = this.sdk.getTelemetry() || {};
            if (this.firstFramePending) {
                this.log("first-frame-telemetry-complete", { telemetryKeys: Object.keys(telemetry).length });
                this.firstFramePending = false;
            }
            // Scalars still arrive in SDK arrays. The newest/last element is selected
            // and rejected when it cannot be represented as a finite JavaScript number.
            const readVariable = name => {
                const decoded = this.decodeVariable(telemetry[name]);
                const item = decoded?.[decoded.length - 1];
                const number = Number(item);
                return Number.isFinite(number) ? number : null;
            };
            const readArray = name => this.decodeVariable(telemetry[name]) || [];
            // Inputs needed by the primary overlay. Missing optional channels stay null
            // until the final renderer-facing frame applies a safe default.
            const values = {
                throttle: readVariable("Throttle"),
                throttleRaw: readVariable("ThrottleRaw"),
                brake: readVariable("Brake"),
                clutch: readVariable("Clutch"),
                steering: readVariable("SteeringWheelAngle"),
                gear: readVariable("Gear"),
                abs: readVariable("BrakeABSactive")
            };
            const fuelLevel = readVariable("FuelLevel") ?? 0;
            const fuelUsePerHour = readVariable("FuelUsePerHour") ?? 0;
            const lastLapTime = readVariable("LapLastLapTime") ?? 0;
            const lapsRemaining = readVariable("SessionLapsRemain") ?? 0;
            const sessionTimeRemaining = readVariable("SessionTimeRemain") ?? 0;
            const lap = readVariable("Lap") ?? 0;
            const onPitRoad = (readVariable("OnPitRoad") ?? 0) > 0;
            const batteryRaw = readVariable("EnergyERSBatteryPct");
            const deployRaw = readVariable("EnergyMGU_KLapDeployPct");
            this.updateSessionData();
            const sessionType = this.session?.SessionInfo?.Sessions?.[readVariable("SessionNum") ?? 0]?.SessionType || "";
            // Strength of Field uses the harmonic mean, matching the usual treatment
            // of driver ratings where a single low value should influence the result.
            const ratings = (this.session?.DriverInfo?.Drivers || []).map(driver => Number(driver.IRating)).filter(value => value > 0);
            const sof = ratings.length ? Math.round(ratings.length / ratings.reduce((sum, value) => sum + 1 / value, 0)) : 0;
            const sessionDrivers = this.session?.DriverInfo?.Drivers || [];
            const telemetryPlayerIdx = readVariable("PlayerCarIdx");
            const sessionPlayerIdx = Number(this.session?.DriverInfo?.DriverCarIdx);
            const playerIdx = telemetryPlayerIdx ?? (Number.isFinite(sessionPlayerIdx) ? sessionPlayerIdx : 0);
            const playerDriver = sessionDrivers.find(driver => Number(driver.CarIdx) === Number(playerIdx)) || {};
            const playerSpeed = Number(playerDriver.CarClassRelSpeed || 0);
            const fastestSpeed = Math.max(0, ...sessionDrivers.map(driver => Number(driver.CarClassRelSpeed || 0)));
            const trackLengthKm = parseFloat(this.session?.WeekendInfo?.TrackLength) || 0;
            const lapDistances = readArray("CarIdxLapDistPct");
            const telemetryLapPct = readVariable("LapDistPct");
            const playerLapPct = Number(lapDistances[playerIdx]);
            const lapPct = Number.isFinite(playerLapPct) && playerLapPct >= 0
                ? playerLapPct
                : telemetryLapPct;
            // DriverPitTrkPct normally lives directly under DriverInfo, not in
            // the player's Drivers[] entry. Accept both layouts for older SDK
            // session parsers and normalize values written as "12.3 %".
            // Session YAML may express percentages as 0.25, 25 or "25 %" depending
            // on field and parser. Convert every supported representation to 0..1.
            const percentage = value => {
                if (value == null || value === "")
                    return NaN;
                const text = String(value).trim();
                const number = Number.parseFloat(text);
                if (!Number.isFinite(number))
                    return NaN;
                return text.includes("%") || number > 1 ? number / 100 : number;
            };
            const pitBoxPct = percentage(
                this.session?.DriverInfo?.DriverPitTrkPct
                ?? playerDriver.DriverPitTrkPct
                ?? this.session?.DriverInfo?.Drivers?.[playerIdx]?.DriverPitTrkPct
            );
            let pitDistance = null;
            if (trackLengthKm > 0
                && Number.isFinite(lapPct)
                && Number.isFinite(pitBoxPct)
                && pitBoxPct >= 0
                && pitBoxPct <= 1) {
                // Convert track percentage to forward distance along the lap.
                let distancePct = pitBoxPct - lapPct;
                // A negative value in the pit lane normally means the box has
                // just been passed. Elsewhere it means the next box is on the
                // following lap and must wrap across the start/finish line.
                if (distancePct < 0)
                    distancePct = onPitRoad && distancePct > -0.5 ? 0 : distancePct + 1;
                pitDistance = Math.max(0, distancePct * trackLengthKm * 1000);
            }
            if (Date.now() - this.lastDiagnosticAt > 5000 && !Number.isFinite(pitDistance)) {
                this.log("pit-box-distance-unavailable", {
                    playerIdx,
                    lapPct,
                    pitBoxPct,
                    driverInfoPitPct: this.session?.DriverInfo?.DriverPitTrkPct ?? null,
                    driverPitPct: playerDriver.DriverPitTrkPct ?? null,
                    trackLengthKm
                });
            }
            // Session-wide P2P arrays are zero-filled even for some unsupported cars,
            // so later logic requires positive car-specific evidence.
            const p2pCounts = readArray("CarIdxP2P_Count");
            const p2pStatuses = readArray("CarIdxP2P_Status");
            const playerP2pCount = readVariable("P2P_Count");
            const playerP2pStatus = readVariable("P2P_Status");
            // CarIdxP2P_* is a session-wide 64-car array and can be present
            // even when the player's car has no Push-to-Pass system. The
            // player-specific P2P_* variables are car capabilities, so only
            // those (or a car-specific control) make the overlay available.
            const p2pCount = Number.isFinite(Number(playerP2pCount))
                ? Number(playerP2pCount)
                : Number.isFinite(Number(p2pCounts[playerIdx])) ? Number(p2pCounts[playerIdx]) : 0;
            const p2pStatus = Boolean(playerP2pStatus ?? p2pStatuses[playerIdx] ?? readVariable("PushToPass") ?? 0);
            const p2pControlAvailable = Object.hasOwn(telemetry, "dcPushToPass");
            const carKey = `${playerDriver.CarID ?? ""}:${playerDriver.CarPath ?? playerDriver.CarScreenName ?? playerIdx}`;
            if (this.p2pCapabilityCarKey !== carKey) {
                this.p2pCapabilityCarKey = carKey;
                this.p2pCapabilityConfirmed = false;
                this.p2pStartedAt = 0;
                this.p2pLastEndedAt = 0;
                this.p2pWasActive = false;
            }
            // Zero-filled P2P variables are published for some cars without
            // the feature. Require positive evidence and latch it for the
            // current car, so the overlay remains available after the final use.
            if (p2pControlAvailable || p2pCount > 0 || p2pStatus)
                this.p2pCapabilityConfirmed = true;
            const p2pAvailable = this.p2pCapabilityConfirmed;
            const p2pActive = p2pAvailable && p2pStatus;
            const now = Date.now();
            // Edge detection converts the boolean P2P state into use and cooldown timers.
            if (p2pActive && !this.p2pWasActive)
                this.p2pStartedAt = now;
            if (!p2pActive && this.p2pWasActive)
                this.p2pLastEndedAt = now;
            this.p2pWasActive = p2pActive;
            const p2pUsageTime = p2pActive && this.p2pStartedAt ? (now - this.p2pStartedAt) / 1000 : 0;
            const p2pCooldownElapsed = !p2pActive && this.p2pLastEndedAt ? (now - this.p2pLastEndedAt) / 1000 : 0;
            // TC intervention is not consistently exposed by iRacing. Prefer any known
            // direct signal, then fall back to comparing raw and delivered throttle.
            const telemetryKeys = Object.keys(telemetry);
            const directTcKey = ["TractionControlActive", "TCActive", "TCSActive", "TractionControlCutPct", "TCCutPct"]
                .find(key => Object.hasOwn(telemetry, key));
            const directTcValue = directTcKey ? readVariable(directTcKey) : null;
            const tcAvailable = Object.hasOwn(telemetry, "dcTractionControl")
                || Object.hasOwn(telemetry, "dcTractionControl2")
                || Object.hasOwn(telemetry, "dcTractionControlToggle")
                || Boolean(directTcKey);
            // Prefer a dedicated intervention signal if iRacing exposes one.
            // Otherwise use the only live approximation available: a cut
            // between raw pedal demand and delivered throttle.
            const tcEnabled = (readVariable("dcTractionControlToggle") ?? 1) > 0;
            const inferredTcCut = tcEnabled && values.throttleRaw !== null && values.throttle !== null
                && values.throttleRaw > 0.08 && values.throttleRaw - values.throttle > 0.01;
            const tcActive = tcAvailable && (directTcValue !== null ? directTcValue > 0.001 : inferredTcCut);
            if (Date.now() - this.lastDiagnosticAt > 5000 && tcAvailable) {
                this.log("tc-detection", {
                    directTcKey: directTcKey || null,
                    directTcValue,
                    throttle: values.throttle,
                    throttleRaw: values.throttleRaw,
                    tcToggle: readVariable("dcTractionControlToggle"),
                    tcVariables: telemetryKeys.filter(key => /traction|(^|_)tc/i.test(key))
                });
            }
            const pitSpeedLimit = parseFloat(this.session?.WeekendInfo?.TrackPitSpeedLimit) || 0;
            const playerLapDistance = lapDistances[playerIdx] ?? lapPct;
            // Radar uses signed metres relative to the player. Lap wrap is corrected
            // before filtering to cars close enough to be relevant.
            const radarOffsets = lapDistances.map((value, index) => { if (index === playerIdx || value == null || value < 0)
                return null; let delta = value - playerLapDistance; if (delta > 0.5)
                delta -= 1; if (delta < -0.5)
                delta += 1; return delta * trackLengthKm * 1000; }).filter(value => value !== null && Math.abs(value) < 20).sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 2);
            // A connected SDK without the five core channels is not yet a usable frame.
            const available = ["throttle", "brake", "clutch", "steering", "gear"].filter(key => values[key] !== null).length;
            if (available === 0) {
                let typeCount = 0;
                let sessionLength = 0;
                let connectionId = -1;
                try {
                    typeCount = Object.keys(this.sdk.__getTelemetryTypes?.() || {}).length;
                }
                catch { }
                try {
                    sessionLength = String(this.sdk.getSessionData?.() || "").length;
                }
                catch { }
                try {
                    connectionId = this.sdk.getSessionConnectionID?.() ?? -1;
                }
                catch { }
                this.setStatus("connecting", `SDK aberto · ${typeCount} variáveis`);
                if (Date.now() - this.lastDiagnosticAt > 5000) {
                    this.lastDiagnosticAt = Date.now();
                    this.log("no-required-variables", {
                        typeCount,
                        sessionLength,
                        connectionId,
                        telemetryKeys: Object.keys(telemetry).slice(0, 30)
                    });
                }
                this.frameErrorCount = 0;
                return;
            }
            // From this point onward the object contains cloneable primitives only.
            this.emit("data", {
                connected: true,
                demo: false,
                throttle: values.throttle ?? 0,
                brake: values.brake ?? 0,
                clutch: values.clutch == null ? 0 : 1 - Math.max(0, Math.min(1, values.clutch)),
                steering: values.steering ?? 0,
                gear: values.gear ?? 0,
                abs: (values.abs ?? 0) > 0,
                tcAvailable,
                tcActive,
                fuelLevel,
                fuelPerLap: fuelUsePerHour > 0 && lastLapTime > 0 ? fuelUsePerHour * lastLapTime / 3600 : 0,
                lastFuelPerLap: fuelUsePerHour > 0 && lastLapTime > 0 ? fuelUsePerHour * lastLapTime / 3600 : 0,
                qualifyingFuelPerLap: 0,
                lapsRemaining,
                sessionTimeRemaining,
                lap,
                lastLapTime,
                onPitRoad,
                sessionType,
                oilTemp: readVariable("OilTemp") ?? 0,
                waterTemp: readVariable("WaterTemp") ?? 0,
                brakeBias: readVariable("dcBrakeBias") ?? 0,
                airTemp: readVariable("AirTemp") ?? 0,
                trackTemp: readVariable("TrackTempCrew") ?? 0,
                humidity: readVariable("RelativeHumidity") ?? 0,
                incidents: readVariable("PlayerCarMyIncidentCount") ?? 0,
                sof,
                isReplay: (readVariable("IsReplayPlaying") ?? 0) > 0,
                inGarage: (readVariable("SessionState") ?? 0) < 3,
                isSlowerClass: fastestSpeed > playerSpeed,
                leaderLap: lap + Math.max(0, Math.round(lapsRemaining > 0 ? 0.5 : 0)),
                speedKph: (readVariable("Speed") ?? 0) * 3.6,
                pitSpeedLimit,
                pitDistance,
                pitLimiterOn: (readVariable("dcPitSpeedLimiterToggle") ?? readVariable("PitSpeedLimiter") ?? 0) > 0,
                pitWarning: ((readVariable("EngineWarnings") ?? 0) & 16) !== 0,
                p2pAvailable,
                p2pActive,
                p2pRemaining: Math.max(0, p2pCount),
                p2pUsageTime,
                p2pCooldownElapsed,
                mguAvailable: batteryRaw !== null || deployRaw !== null,
                mguBattery: batteryRaw ?? 0,
                mguDeploy: deployRaw ?? 0,
                carLeftRight: readVariable("CarLeftRight") ?? 0,
                radarOffsets
            });
            this.emitRelative(telemetry);
            if (this.status.state !== "connected")
                this.setStatus("connected", `iRacing ligado · ${available}/5 canais`);
            if (this.status.state === "connected" && Date.now() - this.lastDiagnosticAt > 5000) {
                this.lastDiagnosticAt = Date.now();
                this.log("telemetry-connected", { available, values });
            }
            this.frameErrorCount = 0;
        }
        catch (error) {
            this.frameErrorCount += 1;
            this.log("frame-read-error", {
                count: this.frameErrorCount,
                detail: error?.stack || error?.message || String(error)
            });
            if (this.frameErrorCount >= 3 || Date.now() - this.lastDataAt > 30000) {
                this.disconnect(error?.message || String(error));
            }
        }
    }
    disconnect(detail) {
        clearInterval(this.dataTimer);
        this.dataTimer = null;
        try {
            this.sdk?.stopSDK();
        }
        catch { }
        this.sdk = null;
        this.frameErrorCount = 0;
        this.emit("data", EMPTY_FRAME);
        this.setStatus("waiting", "\u00C0 espera do iRacing", detail);
        this.log("disconnected", { detail });
    }
    setStatus(state, label, detail = "") {
        this.status = { state, label, detail };
        this.emit("status", this.status);
    }
    demoFrame() {
        // Trigonometric curves create smooth, repeatable motion for UI development.
        this.phase += 0.035;
        return {
            connected: false,
            demo: true,
            throttle: Math.max(0, Math.sin(this.phase) * 0.88),
            brake: Math.max(0, Math.sin(this.phase + 2.35) * 0.82),
            clutch: Math.max(0, Math.sin(this.phase * 0.62 + 4.2) * 0.48),
            steering: Math.sin(this.phase * 0.73) * 1.25,
            gear: Math.max(0, Math.min(6, Math.floor((Math.sin(this.phase * 0.24) + 1) * 3.5))),
            abs: Math.max(0, Math.sin(this.phase + 2.35) * 0.82) > 0.7,
            tcAvailable: true,
            tcActive: Math.max(0, Math.sin(this.phase + 1.1)) > 0.88,
            fuelLevel: 48.56 - (this.phase % 5) * 0.08,
            fuelPerLap: 4.75,
            lastFuelPerLap: 4.78,
            qualifyingFuelPerLap: 4.81,
            lapsRemaining: 10.23,
            sessionTimeRemaining: 16 * 60 + 48,
            lap: 21,
            lastLapTime: 91.4,
            onPitRoad: Math.sin(this.phase * 0.12) > 0.88,
            sessionType: "Race",
            oilTemp: 141.7,
            waterTemp: 82.5,
            brakeBias: 55.4,
            airTemp: 25.4,
            trackTemp: 38.9,
            humidity: 0.5625,
            incidents: 11,
            sof: 2357,
            isReplay: false,
            inGarage: false,
            isSlowerClass: true,
            leaderLap: 25,
            speedKph: 60.5,
            pitSpeedLimit: 60,
            pitDistance: 25,
            p2pAvailable: true,
            p2pActive: this.demoTick % 300 > 80 && this.demoTick % 300 < 200,
            p2pRemaining: 7,
            p2pUsageTime: ((this.demoTick % 300) / 30),
            p2pCooldownElapsed: ((this.demoTick % 180) / 30),
            pitLimiterOn: Math.sin(this.phase * 0.18) > -0.25,
            pitWarning: true,
            mguAvailable: true,
            mguBattery: 0.78 + Math.sin(this.phase * 0.25) * 0.18,
            mguDeploy: 0.62 + Math.sin(this.phase * 0.17 + 1) * 0.25,
            carLeftRight: [2, 3, 4, 5, 6, 4][Math.floor(this.phase / 2) % 6],
            radarOffsets: [Math.sin(this.phase * 0.45) * 3.8, Math.sin(this.phase * 0.45 + 2) * 3.6]
        };
    }

    // Produce stable but animated participant data so every race overlay can
    // be developed and demonstrated on a computer without iRacing installed.
    demoRelativeFrame() {
        const drivers = [
            ["Lena Hart", "07", 5420, "A 3.72", "Porsche 911 GT3 R"],
            ["Marco Silva", "21", 3180, "B 2.91", "BMW M4 GT3"],
            ["Alex Morgan", "91", 4760, "A 2.44", "Ferrari 296 GT3"],
            ["Noah Jensen", "14", 2650, "B 3.18", "Mercedes-AMG GT3"],
            ["YOU", "27", 3890, "A 3.11", "Porsche 911 GT3 R"],
            ["Mia Laurent", "44", 6210, "A 4.26", "Ferrari 296 GT3"],
            ["Sam Wilson", "8", 1940, "C 3.85", "BMW M4 GT3"],
            ["Daniel Costa", "62", 4370, "A 2.76", "Mercedes-AMG GT3"],
            ["Eva Novak", "16", 2840, "B 4.10", "Porsche 911 GT3 R"]
        ];
        const colors = [15324236, 5220607, 16738142];
        const baseGaps = [-8.4, -5.1, -2.7, -1.2, 0, 1.6, 3.8, 6.4, 9.7];
        const cars = drivers.map((driver, index) => ({
            carIdx: index,
            position: index + 1,
            classPosition: Math.floor(index / 3) + 1,
            gap: baseGaps[index] + (index === 4 ? 0 : Math.sin(this.phase * 0.75 + index) * 0.28),
            isPlayer: index === 4,
            name: driver[0],
            number: driver[1],
            classColor: colors[index % colors.length],
            irating: driver[2],
            license: driver[3],
            car: driver[4],
            onPitRoad: index === 1 && Math.sin(this.phase * 0.18) > 0.15,
            lastLap: 88.2 + index * 0.17,
            bestLap: 87.8 + index * 0.13,
            iratingGain: index === 4 ? 23 : Math.round(Math.sin(this.phase * 0.2 + index) * 18),
            lapsCompleted: 184 - index,
            positionGain: [15, 1, -17, 11, 10, -18, 8, -2, 13][index],
            pitTime: index === 1 ? 12.4 : 0,
            classId: index % 3
        }));
        return {
            demo: true,
            cars,
            playerCarIdx: 4,
            sessionType: "Race",
            airTemp: 23.4 + Math.sin(this.phase * 0.08) * 0.2,
            trackTemp: 31.8 + Math.sin(this.phase * 0.06) * 0.3,
            humidity: 0.56,
            oilTemp: 104.2,
            waterTemp: 91.6,
            brakeBias: 53.4,
            sessionTime: 14 * 3600 + 32 * 60,
            sessionTimeRemaining: 16 * 60 + 48,
            lap: 14,
            sessionLapsRemaining: 11,
            incidents: 1
        };
    }
    stop() {
        clearInterval(this.dataTimer);
        clearInterval(this.retryTimer);
        clearInterval(this.demoTimer);
        this.dataTimer = this.retryTimer = this.demoTimer = null;
        try {
            this.sdk?.stopSDK();
        }
        catch { }
        this.sdk = null;
    }
}
module.exports = { Telemetry };
