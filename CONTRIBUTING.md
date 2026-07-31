# Contributing to Apex Inputs

Thank you for improving Apex Inputs. Keep changes focused and explain why they
are required, especially when they affect telemetry interpretation.

## Development rules

- Use English for identifiers, comments, documentation and commit messages.
- Use two spaces for indentation and UTF-8 files with LF line endings.
- Keep native telemetry access inside the utility process.
- Do not expose `ipcRenderer`, Node.js or unrestricted file-system access to a renderer.
- Keep renderer payloads serializable: numbers, booleans, strings, arrays and plain objects.
- Document whether a value comes directly from iRacing or is calculated locally.
- Preserve Demo mode for states that are difficult to reproduce with a real car.

## Before opening a pull request

1. Run `npm run check`.
2. Start the application and verify Demo mode.
3. Test affected overlays at more than one scale.
4. Test live iRacing telemetry when the change reads or transforms SDK data.
5. Confirm that no `data`, logs, caches, builds or personal settings are committed.

Describe the test environment and any iRacing car/session dependency in the pull
request. Include screenshots for visual changes.
