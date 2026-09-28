# Apex Inputs

Apex Inputs is a configurable Electron overlay suite for iRacing. It reads live
telemetry from iRacing shared memory and displays independent transparent
windows over the simulator.

## Included overlays

- **Inputs** — throttle, brake, clutch, gear, speed, steering and input history.
- **Relative** — nearby drivers, gaps, classes, ratings and session information.
- **Fuel Calculator** — usage, remaining laps, refuelling and finish projection.
- **Pit Helper** — pit distance, speed limit, limiter and race-start controls.
- **MGU** — battery charge, deployment and charging/draining indication.
- **Radar** — contextual side-by-side warnings for one or two cars per side.
- **Standings** — overall or multiclass positions, intervals, pit state and history.

The application also includes demonstration data, a central layout editor,
responsive starter profiles, per-overlay appearance settings and update-safe
custom CSS.

## Requirements

- Windows x64 for live iRacing telemetry.
- Node.js 22 or later for source development.
- npm, which is included with Node.js.
- iRacing in windowed or borderless mode when overlays must appear above it.

The interface can be developed without iRacing by enabling **Demo mode**.

## Install and run from source

```powershell
npm install
npm start
```

Alternatively, double-click `iniciar-apex-inputs.cmd` on Windows. The launcher
checks for Node.js, installs missing dependencies automatically on the first
run, and then starts Apex Inputs. It does not require Codex or pnpm.

Run the syntax verification before committing changes:

```powershell
npm run check
```

## Architecture

```text
iRacing shared memory
        |
        v
telemetry-worker.js  ->  telemetry.js
        |
        v
telemetry-bridge.js  ->  main.js
                              |
                  preload.js / IPC API
                              |
                control panel and overlays
```

The native SDK runs in an isolated Node child process. If the native component
stops unexpectedly, the control panel remains open and telemetry is restarted.
Renderer pages use `contextIsolation` and never receive direct Node.js access.

## Source structure

```text
src/
  main.js                 Electron lifecycle, windows, IPC, layouts and profiles
  telemetry.js            iRacing decoding, calculations and demo data
  telemetry-bridge.js     Telemetry-process supervision and restart handling
  telemetry-worker.js     Isolated telemetry process entry point
  preload.js              Safe renderer API
  store.js                Persistent settings and compatibility merging
  defaults.js             Default application and overlay settings
  ui/
    control.*              Configuration interface
    overlay.*              Inputs overlay
    relative.*             Relative overlay
    fuel.*                 Fuel Calculator
    pit.*                  Pit Helper
    mgu.*                  MGU overlay
    radar.*                Radar overlay
    standings.*            Standings overlay
```

## Local application data

The portable build stores settings, custom CSS and diagnostic output in the
`data` folder beside the executable. Source development uses Electron's normal
user-data directory.

`telemetry-diagnostic.log` records SDK connection and recovery events. Review
the log before sharing it publicly and remove any session information you do not
want to disclose.

## Contributing

1. Create a branch for the change.
2. Keep comments and identifiers in English.
3. Preserve the separation between telemetry, Electron main process and renderers.
4. Verify every JavaScript file and test Demo mode.
5. Test telemetry-dependent changes with iRacing when possible.

## License

Copyright (c) 2026 Vitor Silva. This project is distributed under the
[MIT License](LICENSE). You may use, modify and redistribute the software as
long as the copyright notice and license text are preserved.
