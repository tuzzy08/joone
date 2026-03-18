# Joone Agent: Handover & Architecture Document

This document serves as a comprehensive handover note for future agents or engineering sessions. It captures the core architectural decisions, the current state of the project, and the rationale behind the implementation of the `joone` AI coding assistant.

## 1. Project Overview & Tech Stack

**Goal:** Build a secure, terminal-based AI coding assistant that executes code in an isolated sandbox while manipulating local project files, providing a premium developer experience.

- **Runtime:** Node.js (v20+)
- **Module System:** ESM (`"type": "module"`)
- **Language:** TypeScript (`NodeNext` resolution)
- **Terminal UI (TUI):** Ink v6 (React for CLI) + Clack (prompts/onboarding)
- **Primary Sandbox:** E2B
- **Fallback Sandbox:** OpenSandbox (Local Docker)
- **AI SDKs:** `@langchain/anthropic`, `@langchain/openai`, `@google/genai` (planned/flexible via factory)
- **Testing:** Vitest (TDD methodology strictly enforced)
- **Testing:** Vitest (TDD methodology strictly enforced)

---

## 2. Key Architectural Decisions

### 2.1 The "Hybrid" Execution Model

- **Decision:** Split tool execution between the **Host** machine and the **Sandbox**.
- **Rationale:** We want the user to see file changes happen live in their IDE (Host), but we strictly do not want to run untrusted shell commands or install random dependencies on the user's machine (Sandbox).
- **Implementation (`src/tools/router.ts` & `src/sandbox/manager.ts`):**
  - **Host Routing (`HOST_TOOLS`):** `read_file`, `write_file`, `search_tools`.
  - **Sandbox Routing (`SANDBOX_TOOLS`):** `bash`, `run_tests`, `install_deps`, `security_scan`, `dep_scan`.
  - **Wrapper Architecture:** The `SandboxManager` uses an `ISandboxWrapper`. It attempts to connect to a primary **E2B** cloud sandbox. If initialization fails (e.g., API key error, network timeout), it gracefully defaults to a robust local **OpenSandbox** deployment (`localhost:8080`).
  - _Safe-by-default logic:_ Any unknown tool request is routed to the sandbox.

### 2.2 ESM Migration for the TUI

- **Decision:** Migrated the entire codebase from CommonJS to ESM.
- **Rationale:** The chosen TUI framework (Ink v6) and modern utility libraries (like Clack) are ESM-only. A premium UI requires modern tooling.
- **Implementation:** Updated `package.json` (`type: module`), modified TSConfig (`module: NodeNext`), and enforced `.js` extensions on all relative local imports.

### 2.3 Upload-on-Execute File Synchronization

- **Decision:** Sync files from host to sandbox _just-in-time_ before command execution.
- **Rationale:** Constant bidirectional syncing is slow and error-prone. Instead, when the agent uses `write_file` (on the host), the file is marked as "dirty".
- **Implementation (`src/sandbox/sync.ts`):** Before `SandboxManager.exec()` runs a bash command, the `FileSync` layer checks the dirty queue and uploads only the modified files to the E2B sandbox.

### 2.4 File Size & Context Guardrails

- **Decision:** Prevent the LLM from reading massive files that would blow up the context window.
- **Rationale:** Reading generic log files or compiled assets breaks token limits, leading to expensive failures.
- **Implementation (`src/tools/index.ts` -> `ReadFileTool`):**
  - Strict 512 KB file size hard-limit.
  - Soft 2,000-line truncation limit.
  - Added `startLine`/`endLine` arguments for specific chunk reading.
  - Suggests `grep` or `head` via `bash` when limits are hit.

### 2.5 Config-Driven Sandbox Strategy (Security Scanning)

- **Decision:** Support both a zero-startup-cost Production environment and a flexible Development environment.
- **Rationale:** Installing the Gemini CLI and OSV-Scanner inside the sandbox takes ~15 seconds, which ruins the UX if done on every session start.
- **Implementation (`src/sandbox/bootstrap.ts`):**
  - **Dev Mode (Default):** `LazyInstaller` installs tools on-demand _only_ when the user actually invokes `security_scan` or `dep_scan`. Install state is cached per session.
  - **Prod Mode (`sandboxTemplate: "joone-base"`):** Uses a pre-baked E2B template defined in `e2b/Dockerfile`. The installer detects this and skips the install phase entirely (0s startup).

### 2.6 Skills System (Multi-Directory Discovery)

- **Decision:** Skills are discovered from multiple directories with project-level overriding user-level.
- **Rationale:** Users may have personal skills (e.g., `~/.agents/skills/`) and project-specific skills. Project skills should take priority to allow per-project customization.
- **Implementation (`src/skills/loader.ts`):**
  - Discovery paths: `./skills/`, `./.agents/skills/`, `./.agent/skills/` (project), `~/.joone/skills/`, `~/.agents/skills/` (user)
  - YAML frontmatter parsing for `name` and `description` fields
  - Deduplication by name; project-level wins on conflict

---

## 3. Current Project State

All development follows strict TDD. Currently, **126 tests are GREEN**, including CLI import/lazy-loading coverage, startup benchmark utility tests, App lifecycle startup/shutdown coverage, the shared runtime service tests, desktop scaffold tests, desktop bridge status coverage, npm CLI launcher coverage, desktop runtime CORS coverage, the new desktop UI shell tests, and the first-turn Deep Agents regression covering the M19 harness migration. TypeScript compiles cleanly.

### Completed Milestones

- ✅ **M1: Core Setup:** CLI scaffolding, config manager, dynamic Model Factory.
- ✅ **M2: TUI & Core Loop:** Clack onboarding, Ink REPL interface, tool buffering.
- ✅ **M3: Hybrid Sandbox:** E2B `SandboxManager`, `FileSync`, `ToolRouter`, core tools.
- ✅ **M3.5: Security Tools:** `LazyInstaller`, `SecurityScanTool`, `DepScanTool`, E2B Dockerfile.
- ✅ **M4: Harness Engineering:** `MiddlewarePipeline`, `LoopDetectionMiddleware`, `CommandSanitizerMiddleware`, `PreCompletionMiddleware`.
- ✅ **M5: Advanced Optimizations:** Enhanced registry (fuzzy search + `activateTool`), `TokenCounter`, improved `compactHistory`, `ReasoningRouter`.
- ✅ **M5.5: Browser, Search & Skills:** `BrowserTool` (agent-browser), `WebSearchTool` (@valyu/ai-sdk), `SkillLoader` + `search_skills`/`load_skill` tools.
- ✅ **M6: Tracing & Refinement:** `SessionTracer` (metrics routing), `TraceAnalyzer` (offline insights), LangSmith env integration, `joone analyze` CLI command.
- ✅ **M8: OpenSandbox Fallback:** `ISandboxWrapper`, local docker degradation at `localhost:8080`, and documented NFRs (Rate Limits & Budgets).
- ✅ **M9: Persistent Sessions:** `SessionStore` (JSONL), `SessionResumer` (host drift detection), `joone sessions` dashboard, `joone start --resume <id>`.
- ✅ **M10: Retry, HITL, Skills Sync:** `JooneError` hierarchy + `retryWithBackoff`, `HITLBridge` + `AskUserQuestionTool` + `PermissionMiddleware`, user-level skills sandbox sync.
- ✅ **M11: Slash Command System:** `CommandRegistry` + 10 built-in `/commands` (`/help`, `/model`, `/clear`, `/compact`, `/tokens`, `/status`, `/exit`, `/history`, `/undo`) intercepted in TUI before agent loop (zero LLM cost).

- ✅ **M12: LLM-Powered Compaction:** LLM-driven `ConversationCompactor`, fast model mapping (`FAST_MODEL_DEFAULTS`), and seamless handoff prompts post-compaction.
- ✅ **M13: Sub-Agent Orchestration:** `AgentRegistry`, isolated sync/async `SubAgentManager`, and safe `spawn_agent` + `check_agent` tools (Depth-1 limits).
- ✅ **M14: Stability & Reliability:** `ContextGuard` (80% auto-compact, 95% emergency truncation), `AutoSave` (debounced JSONL persistence), and atomic TUI `SIGINT/SIGTERM` handling.
- ✅ **M15: Telemetry & Engine Bug Bash:** Bound tools natively to models preventing XML truncation, extracted precise `cache_creation_input_tokens`, and decoupled UI components from `maxTokens` generation limits.
- ✅ **M16: TUI v2, Event Tracking & Host Dependency Mgmt:** Built `AgentEventEmitter`, a 2-Column IDE layout (`App.tsx`), `FileBrowser`, `ActionLog`, and a strictly whitelisted `install_host_dependencies` capability bypassing E2B.
- ✅ **M18: TUI Stability & UX Polish:** Ink Scrollable `<Static>`, dynamic aesthetic `MessageBubble`, unified `Static` streaming of embedded Action Logs, and robust infinite `HITLBridge` interrupts.
- ✅ **M19: Core Engine Alignment:** Migrated `ExecutionHarness` to natively use `createDeepAgent`, implemented `WhitelistedLocalShellBackend` for host-first architecture, injected dynamic contexts via middleware, and pruned legacy custom subagent/skill/routing logic.

### Post-M19 Hotfix

- Fixed a production crash on the first user message caused by misusing the Deep Agents `beforeAgent` hook signature in `ExecutionHarness`.
- Dynamic system context injection now happens in `wrapModelCall`, which correctly receives `request.state` and appends a `SystemMessage` without dereferencing an undefined `state`.
- Added a regression test in `tests/core/agentLoop.test.ts` to ensure the first turn no longer crashes when session context is injected.

### CLI Startup Notes

- `src/cli/index.ts` now lazily imports both `modelFactory` and `providers` helpers instead of pulling them into the entry module at process startup.
- `joone start` no longer blocks initial Ink render on model creation, tool loading, or sandbox wiring. The UI receives a `createHarness` callback and initializes the runtime on demand, making startup visibly faster even when LangChain/provider imports are expensive.
- The CLI import contract is protected by `tests/cli/indexImports.test.ts` so future refactors do not accidentally reintroduce eager heavyweight imports.
- `joone start --benchmark-startup` is now available for repeatable startup profiling. It records milestone timings (CLI entry, config load, UI interactive, model ready, harness ready), prints a report, and exits automatically.
- The CLI now defaults `NODE_ENV` to `production` before importing Ink/React so packaged runs do not fall back to React's development reconciler, which was inflating startup latency and generating `MaxPerformanceEntryBufferExceededWarning` warnings during long-lived sessions.
- `src/ui/App.tsx` no longer statically imports heavyweight LangChain runtime modules at startup. `ExecutionHarness` is type-only in the UI module, while `HumanMessage` and `Command` are loaded lazily on the interaction paths that actually need them.
- `src/ui/App.tsx` also no longer calls `process.exit(0)` directly on Ctrl+C or `/exit`; the TUI now requests a soft exit and lets the CLI regain control so post-exit cleanup and benchmark reporting can complete.
- A benchmark sample before the latest UI import cleanup showed roughly **18.8s to UI mount**; after the fix the same benchmark dropped to roughly **1.9s to interactive UI** and **3.5s to harness ready**, with runtime initialization remaining the dominant post-render cost.

### Milestone 20 Desktop Foundation

- Milestone 20 is now explicitly the roadmap's **Tauri Cross-Platform Desktop Client**. The earlier "Cloud Agent Swarm Integration" note was stale and should not be used as a planning reference.
- A new shared runtime service lives in `src/runtime/service.ts`. It owns config access, session prep/start/resume, event subscription, prompt submission, session persistence, and cleanup behind a Node-safe API that can be reused by both CLI and desktop clients.
- A desktop IPC bridge lives in `src/desktop/ipc.ts`, defining the serializable event surface for Tauri-facing commands and subscriptions.
- The first desktop scaffold now exists under `desktop/` (React shell) and `src-tauri/` (Rust/Tauri shell). This is an MVP scaffold only; the desktop runtime is not yet fully wired into a runnable packaged app because the frontend/Tauri dependencies and end-to-end command binding still need to be completed.
- `src/ui/App.tsx` now accepts an optional `onStateChange` callback so the shared runtime extraction can observe session state without re-implementing the current TUI loop all at once.
- The second M20 slice makes the desktop web shell actually runnable: `desktop/src/bridge/` now contains a browser fallback bridge plus a Tauri adapter, the React shell in `desktop/src/App.tsx` uses that bridge rather than hardcoded sample content, and `npm run desktop:web:build` now completes successfully after adding the required frontend dependencies.
- The third M20 slice adds a runtime-backed local desktop development path: `src/desktop/server.ts` exposes config/session/message/event routes over HTTP + SSE, `src/desktop/devServer.ts` boots that service against `JooneRuntimeService`, and `desktop/src/bridge/index.ts` now prefers `VITE_JOONE_DESKTOP_API_URL` via `httpBridge.ts` before falling back to the browser mock.
- `docs/07_system_architecture.md` has been refreshed to reflect the new desktop-aware architecture. It now documents the shared runtime layer, browser fallback, HTTP dev server mode, and the intended Tauri end-state.
- The fourth M20 slice adds `src/desktop/webDev.ts`, which means `npm run desktop:web:dev` now boots both the runtime server and the Vite frontend together. Local desktop development should now hit the real Node runtime by default rather than the browser fallback, unless the runtime launcher is intentionally bypassed.
- The fifth M20 slice makes the Tauri bridge less synthetic: `desktop/src/bridge/tauriBridge.ts` now asks Tauri for a runtime base URL and then reuses the HTTP bridge against that backend, while `src-tauri/src/main.rs` now exposes a real `runtime_base_url` command instead of pretending the full runtime command surface already exists in Rust.
- The sixth M20 slice adds explicit bridge/runtime visibility to the desktop shell. `desktop/src/bridge/types.ts` now includes a `DesktopBridgeStatus` contract, every bridge implements `getStatus()`, and `desktop/src/App.tsx` now shows whether the app is currently running on the browser fallback, HTTP dev runtime, or Tauri-backed runtime path. This makes the temporary fallback visible instead of implicit while we continue replacing it.
- The seventh M20 slice fixes the local desktop dev launcher on Windows/NVM setups. `src/desktop/webDev.ts` no longer depends on `require.resolve("npm/bin/npm-cli.js")`, which fails under modern npm exports; it now uses `src/desktop/npmCli.ts` to prefer `npm_execpath`, then the npm bundle beside the active `node.exe`, and only then package-based npm resolution.
- The eighth M20 slice fixes browser CORS failures in the local desktop dev path. `src/desktop/server.ts` now sets CORS headers for the Vite dev origins (`http://localhost:1420` and `http://127.0.0.1:1420`) and responds to `OPTIONS` preflight requests, which unblocks `fetch` and `POST /sessions` from the desktop web shell.
- The ninth M20 slice fixes a desktop crash in the saved sessions sidebar. `JooneRuntimeService.listSessions()` had been returning raw `SessionHeader` data even though the desktop client expected full snapshots with `messages` and `metrics`. The runtime now expands persisted sessions into `RuntimeSessionSnapshot` objects, the desktop shell normalizes incoming sessions defensively, and the CLI `sessions` command now tolerates in-memory sessions that do not yet have persistence metadata.
- The tenth M20 slice adds desktop error containment. `desktop/src/main.tsx` now wraps the app in `DesktopErrorBoundary`, while `desktop/src/App.tsx` catches startup/session/message bridge failures and surfaces them as `Last error:` plus activity log entries instead of leaving uncaught promise rejections in the browser console.
- The eleventh M20 slice moves Tauri startup status/config off the frontend HTTP bridge. `desktop/src/bridge/tauriBridge.ts` now calls native `runtime_status` and `runtime_load_config` commands for startup, while `src-tauri/src/main.rs` implements those commands directly in Rust. Session/message flows still use the HTTP bridge in Tauri mode for now.

### Tool Routing Summary

| HOST (safe, runs on user machine) | SANDBOX (isolated, runs in E2B)     |
| --------------------------------- | ----------------------------------- |
| `read_file`, `write_file`         | `bash`, `run_tests`, `install_deps` |
| `search_tools`, `activate_tool`   | `security_scan`, `dep_scan`         |
| `web_search` (API call)           | `browser` (agent-browser CLI)       |
| `search_skills`, `load_skill`     | Unknown tools (safe-by-default)     |
| `ask_user_question`               |                                     |
| `/commands` (TUI-only, no LLM)    |                                     |
| `spawn_agent`, `check_agent`      |                                     |
| `install_host_dependencies`       |                                     |

### Pending Next Steps (Where to resume)

**Continue with Milestone 20:**

1.  **M20: Tauri Cross-Platform Desktop Client** — wire the real Tauri command/event layer to `JooneRuntimeService` so the desktop shell stops using the browser fallback bridge and starts talking to the actual runtime end-to-end.

_Reference `docs/08_roadmap.md` and the implementation plan artifact for the full checklist._
