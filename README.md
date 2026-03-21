<div align="center">

# Joone

**An autonomous coding agent powered by prompt caching, harness engineering, and secure sandboxing.**

[![npm version](https://img.shields.io/npm/v/joone.svg)](https://npmjs.org/package/joone)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

</div>

---

Joone is an autonomous AI coding assistant with two client surfaces:

- a stable CLI for day-to-day use
- a Tauri desktop client with packaged installers and an active Milestone 20 polish track

The agent edits your local project files directly, while command execution, testing, and dependency installation stay isolated behind the project's hybrid sandbox/runtime architecture.

## Features

- Pluggable model/provider support across Anthropic, OpenAI, Google, Ollama, and more
- User-local provider plugins so the base install stays lean
- Hybrid host + sandbox execution for safer automation
- Rich Ink TUI for the CLI and a Tauri + React desktop client
- Persistent sessions, HITL prompts, slash commands, tracing, and desktop packaging CI

## Install Options

### 1. Run The CLI With `npx`

This is the fastest way to try Joone without a global install:

```bash
npx joone@latest start
```

### 2. Install The CLI Globally

If you want `joone` available everywhere:

```bash
npm install -g joone
```

Then start the app in any project directory:

```bash
joone start
```

If you need to change provider/model/API key settings later:

```bash
joone config
```

### 3. Install The Desktop App From GitHub Releases

Packaged desktop builds are published on the project's GitHub Releases page:

- Windows: `.msi`
- macOS: `.dmg`
- Linux: `.AppImage`

Release page:

- [https://github.com/tuzzy08/joone/releases](https://github.com/tuzzy08/joone/releases)

Current desktop release assets follow canonical names like:

- `joone-desktop_0.1.0_windows_x64.msi`
- `joone-desktop_0.1.0_darwin_aarch64.dmg`
- `joone-desktop_0.1.0_linux_amd64.AppImage`

Desktop packaging CI is green and producing all three bundle types, but final manual packaged-app smoke testing is still the next milestone slice. The CLI remains the most battle-tested interface today.

### 4. Run From Source

If you are developing on Joone itself:

```bash
git clone https://github.com/tuzzy08/joone.git
cd joone
npm install
```

Recommended toolchain:

- Node.js 24
- npm 11+
- Rust stable for Tauri/desktop builds

## Desktop Run Modes

### Packaged Desktop App

Download the installer for your platform from GitHub Releases and install it normally:

- Windows: run the `.msi`
- macOS: open the `.dmg` and drag the app into `Applications`
- Linux: make the `.AppImage` executable, then run it

Example for Linux:

```bash
chmod +x joone-desktop_0.1.0_linux_amd64.AppImage
./joone-desktop_0.1.0_linux_amd64.AppImage
```

The packaged desktop app now launches and owns its bundled local runtime automatically. You do not need to start a separate `127.0.0.1:3011` runtime server for installed desktop builds.

### Desktop Web Shell + Runtime (Local Development)

This runs the desktop React shell against the local Node runtime over HTTP/SSE:

```bash
npm run desktop:web:dev
```

That boots:

- the desktop runtime server
- the Vite frontend shell

### Real Tauri Desktop Dev

This runs the actual Tauri desktop app from source:

```bash
npm run desktop:dev
```

### Build Desktop Bundles From Source

```bash
npm run desktop:build
```

On Linux, you may need the same native packages used in CI:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## CLI Quickstart

Start a new session:

```bash
joone start
```

Resume a saved session:

```bash
joone start --resume <session-id>
```

List saved sessions:

```bash
joone sessions
```

## Commands

| Command | Description |
| --- | --- |
| `joone start` | Start a new Joone agent session in the current directory. |
| `joone start --resume <id>` | Resume a previously saved persistent session. |
| `joone config` | Run the configuration wizard. |
| `joone sessions` | List persistent sessions. |
| `joone provider add <name>` | Install a provider package locally. |
| `joone provider remove <name>` | Remove a locally installed provider package. |
| `joone analyze [sessionId]` | Analyze a session trace. |
| `joone eval` | Run offline evaluation. |
| `joone cleanup` | Wipe Joone configs, traces, plugins, and local state. |
| `npm run desktop:web:dev` | Run the desktop web shell against the local runtime. |
| `npm run desktop:dev` | Run the real Tauri desktop app from source. |
| `npm run desktop:build` | Build desktop bundles from source. |

## Architecture

Joone is built around the Execution Harness pattern, with a shared runtime layer that both clients can reuse.

1. Prompt Builder: constructs cache-friendly prompts and layered system context.
2. Middleware Pipeline: applies loop detection, permissioning, command safeguards, and other runtime controls.
3. Shared Runtime Service: exposes config, session, provider-testing, update-check, workspace metadata, and streaming event APIs to the CLI and desktop surfaces.
4. Desktop Runtime Ownership: packaged Tauri builds boot a bundled local Node runtime sidecar and proxy native commands/events to it.
5. Hybrid Execution Layer: keeps local file edits on the host while routing risky execution to isolated environments.

The desktop shell now uses:

- a toggleable operator sidebar
- a viewport-locked conversation workspace
- a composer footer with model, permission mode, branch, and runtime status pills
- a modal settings center with `General` and `Providers` sections, appearance controls, notifications, update checks, and provider connection management

For deeper architecture notes, see:

- [`docs/07_system_architecture.md`](docs/07_system_architecture.md)
- [`Handover.md`](Handover.md)

## Uninstall

For the CLI:

1. Remove Joone's stored config/plugins/session data:

```bash
joone cleanup
```

2. Remove the global package:

```bash
npm uninstall -g joone
```

For the desktop app:

- Windows: uninstall from Apps & Features or the installed MSI entry
- macOS: remove the app from `Applications`
- Linux: delete the downloaded `.AppImage` and any desktop shortcut you created

## Contributing

```bash
git clone https://github.com/tuzzy08/joone.git
cd joone
npm install
npm run build
npm test
```

For architecture and process expectations, read:

- [`AGENTS.md`](AGENTS.md)
- [`Handover.md`](Handover.md)
- [`docs/01_insights_and_patterns.md`](docs/01_insights_and_patterns.md)
- [`docs/07_system_architecture.md`](docs/07_system_architecture.md)

## License

ISC. See [`LICENSE`](LICENSE).
