# System Architecture

## High-Level Architecture Overview

Joone is no longer just a CLI-first REPL. The current architecture is now **multi-client**:

- the existing **CLI/TUI client** (`joone start`) remains supported
- the new **desktop client path** is being built on top of the same Node runtime
- both clients share the same **agent core**, session model, and config store

The key architectural shift in Milestone 20 is the introduction of a **shared runtime service** that sits between UI clients and the Deep Agents execution engine.

## Current Runtime Model

At a high level:

1. A client starts or resumes a session
2. The client talks to the shared runtime service
3. The runtime prepares config, session state, and `ExecutionHarness`
4. The harness runs the Deep Agent loop and emits stream/tool/status events
5. The client renders those events as chat, metrics, activity, and live workstream UI (tool cards, todo/progress blocks, HITL prompts)

For the desktop path, there are currently three frontend/runtime modes:

- **Tauri bridge**: the production packaged path, where the desktop UI talks to native Tauri commands/events and the shell owns a bundled runtime sidecar
- **HTTP bridge**: a local development path where the desktop UI talks to a Node dev server over HTTP + SSE
- **Browser fallback**: a mock bridge used only when neither Tauri nor the local runtime server is present

The **browser fallback** means the desktop UI can still render and behave like an app shell during frontend work, even if no backend runtime is attached yet. It does **not** run the real agent. It returns mock config/session data so UI work can proceed independently.

## Multi-Client Diagram

```mermaid
graph TD
    User["User"] --> CLI["CLI Client (Ink)"]
    User --> Desktop["Desktop Client (React/Tauri)"]

    subgraph Client Layer
        CLI
        Desktop
        Desktop --> Bridge{"Desktop Bridge"}
        Bridge -->|prod| TauriBridge["Tauri Commands / Events"]
        Bridge -->|local dev| HttpBridge["HTTP + SSE Bridge"]
        Bridge -->|no backend| BrowserFallback["Browser Fallback Mock"]
    end

    CLI --> Runtime["JooneRuntimeService"]
    TauriBridge --> ManagedRuntime["Bundled Node Runtime Sidecar"]
    ManagedRuntime --> Runtime
    HttpBridge --> DevServer["Desktop Runtime Server"]
    DevServer --> Runtime

    subgraph Shared Runtime Layer
        Runtime --> Config["Config Manager (~/.joone/config.json)"]
        Runtime --> Sessions["SessionStore / SessionResumer"]
        Runtime --> HarnessFactory["Harness Factory"]
    end

    HarnessFactory --> Harness["ExecutionHarness / Deep Agent"]

    subgraph Agent Core
        Harness --> Prompt["Prompt / Context State"]
        Harness --> Tools["Structured Tools"]
        Harness --> Tracer["SessionTracer / AutoSave"]
        Harness --> LLM["LLM Provider"]
    end

    subgraph Execution Backends
        Tools --> Host["Host-First Tools / Local FS"]
        Tools --> Sandbox["Sandbox Path (E2B / OpenSandbox)"]
        Host --> Workspace["Workspace Files"]
        Sandbox --> Workspace
    end

    Harness --> Events["Runtime Events"]
    Events --> CLI
    Events --> TauriBridge
    Events --> HttpBridge
```

## Desktop Development Modes

### 1. Browser fallback

- Implemented in `desktop/src/bridge/browserBridge.ts`
- Used when the desktop shell is opened without Tauri and without `VITE_JOONE_DESKTOP_API_URL`
- Purpose: unblock desktop UI development
- Limitation: does not run the real runtime or agent loop

### 2. Runtime-backed HTTP dev mode

- Implemented by `src/desktop/server.ts` and `src/desktop/devServer.ts`
- The desktop shell points at the runtime server via `VITE_JOONE_DESKTOP_API_URL`
- Purpose: enable local desktop frontend work against the real Node runtime before full Tauri command wiring is finished
- Transport:
  - HTTP for config/session/message actions
  - Server-Sent Events for streamed runtime events

### 3. Tauri mode

- Intended production architecture
- The desktop shell uses `@tauri-apps/api` to call native commands and subscribe to emitted events
- Packaged builds now launch a bundled Node sidecar that runs `dist/desktop/runtimeEntry.js`, wait for `/health` to go green, and then proxy native commands/events to that owned runtime
- Current native coverage:
  - startup status/config
  - workspace metadata
  - provider connection tests
  - update checks
  - config save
  - saved session listing
  - session start/resume
  - message submission
  - live session event subscription via native Tauri events relayed from the runtime SSE stream
  - session close
- The Tauri frontend no longer uses the HTTP bridge; the remaining M20 work is installed-app smoke validation and post-smoke cleanup decisions around developer-only fallback layers
- This will replace the browser fallback as the primary desktop runtime path once Milestone 20 is complete

## Desktop Shell Model

The current desktop UI is organized as a native app shell rather than a page-with-panels:

- **Toggleable Sidebar**: compact session list, active-session state, per-session attention markers, settings launcher
- **Conversation Workspace**: thread header, scrollable timeline, workstream cards, tool-call cards, HITL cards
- **Composer Shell**: persistent message input plus footer metadata pills for model, permission mode, git branch, and runtime health
- **Settings Modal**:
  - `General`: appearance, notifications, update checks, permission mode, streaming
  - `Providers`: connected/disconnected provider cards, model selection, connect/edit/test/disconnect actions

This UI is driven by the shared config/runtime contract rather than a desktop-only state model, which keeps the dev HTTP path and the packaged Tauri path aligned.

## Hybrid Sandbox Model

Joone still favors a **Host-First Architecture** combined with Deep Agents orchestration:

- **File operations** (`write_file`, `read_file`) and whitelisted shell execution default to the **host machine**
- **Sandbox execution** remains available through `executionMode: "sandbox"`
- A **File Sync** layer mirrors changed files from host to sandbox only when sandbox mode is active

```text
HOST MACHINE  --sync when needed-->  SANDBOX (/workspace mirror)

Host:
- read_file
- write_file
- host-first shell/backend work

Sandbox:
- isolated command execution
- tests / installs / dangerous workloads
```

## Component Breakdown

1. **Client Layer**
   - `src/cli/index.ts`: CLI entrypoint and Ink app launcher
   - `desktop/src/App.tsx`: desktop shell UI
   - `desktop/src/bridge/*`: desktop runtime selection and adapters

2. **Shared Runtime Layer**
   - `src/runtime/service.ts`: reusable session/config/runtime orchestration for all clients
   - `src/runtime/types.ts`: normalized runtime event and session contracts
   - `src/desktop/ipc.ts`: desktop-facing runtime bridge contract for the Tauri path
   - `src/desktop/server.ts`: HTTP/SSE server for local desktop development
   - `src/desktop/runtimeEntry.ts`: packaged runtime sidecar entrypoint used by installed Tauri builds

3. **Execution Engine**
   - `src/core/agentLoop.ts`: `ExecutionHarness` backed by Deep Agents and LangGraph primitives
   - `src/core/promptBuilder.ts`: state/prompt composition
   - `src/core/contextGuard.ts`: context safety and token boundaries

4. **Persistence and Recovery**
   - `src/core/sessionStore.ts`: saved sessions
   - `src/core/sessionResumer.ts`: resume wakeup + drift detection
   - `src/core/autoSave.ts`: periodic persistence

5. **Observability**
   - `src/tracing/sessionTracer.ts`: token/tool/cost tracing
   - runtime events normalized into session, token, tool, HITL, and completion events

6. **Execution Backends**
   - Host-first file and shell paths
   - sandbox path through E2B/OpenSandbox abstractions

## Event Flow

The normalized runtime event surface now targets both CLI and desktop consumers:

- `session:started`
- `session:state`
- `session:status`
- `agent:token`
- `tool:start`
- `tool:end`
- `hitl:question`
- `hitl:permission`
- `session:error`
- `session:completed`

This event model is the architectural seam that allows the same runtime to power multiple clients.
It now also drives the richer "workstream" presentation used by both the desktop shell and the Ink/TUI client, so tool execution and request progress can be rendered consistently across clients instead of being flattened into plain log strings.

## Current State vs End State

### Current

- CLI is fully functional
- shared runtime service exists
- desktop shell exists
- HTTP runtime-backed dev mode exists
- browser fallback exists for UI-only work
- Tauri production command/event wiring now covers startup, workspace metadata, provider tests, update checks, session lifecycle, message submission, live runtime event subscription, and session close
- packaged desktop builds now own a bundled local runtime instead of assuming an external `127.0.0.1:3011` server already exists
- both desktop and CLI now share a similar workstream UI model for live tool calls and request progress, built on the normalized runtime event surface

### End state for Milestone 20

- desktop shell talks to the real runtime through Tauri-owned packaged runtime, not mock fallback
- desktop packaging works for `.msi`, `.dmg`, and `.AppImage`
- CLI and desktop remain two supported clients over the same runtime core
