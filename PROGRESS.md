# Project Progress & Status

_This document serves as a living changelog and status board. Any human or agent picking up this directory should read this first to understand the current state of the implementation._

---

## Current Status

- [x] Milestone 6: Tracing & Refinement
- [x] Milestone 7: Testing & Evaluations (TDD - Ongoing)
- [x] Milestone 8: OpenSandbox Fallback & NFRs
- [x] Milestone 9: Persistent Sessions

## Next Steps

1.  **Milestone 20**: Continue the phased Tauri desktop MVP on top of the new shared runtime layer.
2.  **Desktop IPC Wiring**: Connect the Tauri shell commands/events to the Node runtime service end-to-end.
3.  **Desktop Packaging**: Add the remaining frontend/tooling dependencies and CI packaging once the local MVP loop is interactive.

---

## Changelog

### 2026-03-13: Post-M19 Bugfix - First-Turn Deep Agent Crash (COMPLETE)

- **Regression Fix**: Fixed a production crash on the first user message where `ExecutionHarness` incorrectly treated Deep Agents `beforeAgent` input as a `{ state, handler }` request object, causing `state.globalSystemInstructions` to throw when `state` was undefined.
- **Middleware Alignment**: Replaced the invalid `beforeAgent` system-prompt injection with a `wrapModelCall` middleware that reads `request.state` using the Deep Agents/LangChain hook contract and appends the dynamic `SystemMessage` safely.
- **Guarding**: Added null-safe system prompt composition so missing state fields degrade to empty sections instead of crashing the session.
- **Tests**: Added `tests/core/agentLoop.test.ts` to reproduce the first-turn failure and confirm the harness no longer crashes when the first prompt is submitted.

### 2026-03-13: CLI Startup Cleanup and Deferred Runtime Initialization (COMPLETE)

- **Import Cleanup**: Removed stale type-only imports from `src/cli/index.ts` that were left behind by the earlier lazy-loading refactor.
- **True Lazy Loading**: Moved `modelFactory` and `providers` access behind dynamic import helpers so heavyweight LangChain/provider code is no longer loaded at CLI module startup.
- **Interactive Startup Improvement**: Refactored `joone start` to render the Ink app before constructing the model, tools, and harness. Runtime initialization now happens on demand from the UI via `createHarness`, which makes the CLI appear sooner and shifts model/sandbox setup off the critical render path.
- **Benchmark Mode**: Added `src/cli/startupBenchmark.ts` plus a new `joone start --benchmark-startup` mode that prints startup milestones and exits automatically for repeatable performance checks.
- **Verification**: Added `tests/cli/indexImports.test.ts` and `tests/cli/startupBenchmark.test.ts`, kept the first-turn harness regression green, verified the project still compiles with `npm run build`, and captured one local sample showing ~1.3s to UI interactivity and ~2.7s to full harness readiness.

### 2026-03-16: Startup Stall and Ctrl+C Perf Warning Fix (COMPLETE)

- **React Runtime Fix**: Defaulted the CLI runtime to `NODE_ENV=production` in `src/cli/index.ts` before Ink/React imports so packaged sessions stop using React's development reconciler, which was contributing to slow startup and `MaxPerformanceEntryBufferExceededWarning` noise on shutdown.
- **UI Import Diet**: Trimmed `src/ui/App.tsx` so heavyweight LangChain runtime modules are no longer pulled in at initial UI module load. `ExecutionHarness` is now type-only in the App module, while `HumanMessage` and LangGraph `Command` are imported lazily on first-use paths.
- **Clean Shutdown Path**: Removed direct `process.exit(0)` calls from the TUI soft-exit paths so Ctrl+C and `/exit` return control to the CLI, allowing post-exit cleanup and benchmark reporting to finish naturally.
- **Regression Coverage**: Added `tests/ui/appLifecycle.test.ts` and extended `tests/cli/indexImports.test.ts` to lock in the production runtime default and lazy UI import contract.
- **Measured Result**: `joone start --benchmark-startup --no-stream` improved from roughly **18.8s to UI mount** before the App import cleanup to roughly **1.9s to interactive UI** and **3.5s to harness ready** after the fix.

### 2026-03-17: Milestone 20 Reconciliation and Desktop Scaffold (IN PROGRESS)

- **Docs Reconciled**: Standardized Milestone 20 around the roadmap's **Tauri Cross-Platform Desktop Client** and dropped the conflicting handover reference to "Cloud Agent Swarm Integration".
- **Shared Runtime Layer**: Added `src/runtime/service.ts` and `src/runtime/types.ts` to expose a reusable Node-side runtime service for config I/O, session prep/start/resume, event subscription, prompt submission, cancellation, and cleanup.
- **Desktop IPC Contract**: Added `src/desktop/ipc.ts` as the serializable bridge surface for desktop commands/events (`session:started`, `session:state`, `agent:token`, `tool:start`, `tool:end`, `hitl:*`, `session:error`, `session:completed`).
- **Desktop Scaffold**: Added a first-pass Tauri shell (`src-tauri/`) plus a React desktop shell (`desktop/`) with a two-pane layout that mirrors the current TUI concepts without porting Ink directly.
- **CLI Preservation**: Kept the CLI supported, started routing `joone sessions` through the shared runtime service, and added App state-sync plumbing (`onStateChange`) so the runtime extraction can continue without replacing the TUI in one jump.
- **Verification**: Added `tests/runtime/runtimeService.test.ts` and `tests/desktop/desktopScaffold.test.ts`, then verified with targeted Vitest runs and `npm run build`.

### 2026-03-18: Milestone 20 Slice 2 - Runnable Desktop Web Shell (COMPLETE)

- **Desktop Bridge Layer**: Added `desktop/src/bridge/` with a typed bridge contract, a browser fallback bridge for local web development, and a Tauri adapter that targets invoke/listen-based runtime commands.
- **Live Desktop Shell**: Replaced the static placeholder desktop page with a bridge-driven React shell that loads config, lists sessions, starts/resumes sessions, submits prompts, renders conversation state, and records runtime activity.
- **Tooling**: Added the missing frontend packages (`vite`, `@vitejs/plugin-react`, `react-dom`, `@tauri-apps/api`) so the desktop web build is no longer just a placeholder script.
- **Verification**: Added `tests/desktop/desktopUiShell.test.ts`, ran the focused desktop/runtime Vitest suite, `npm run build`, and confirmed `npm run desktop:web:build` succeeds.

### 2026-03-18: Milestone 20 Slice 3 - Runtime-Backed Desktop Dev Server (COMPLETE)

- **Desktop Runtime Server**: Added `src/desktop/server.ts`, an Express-backed HTTP/SSE server that exposes shared-runtime routes for config, sessions, message submission, and streamed desktop events.
- **Local Dev Entry**: Added `src/desktop/devServer.ts` plus `npm run desktop:runtime:dev` so the desktop shell can be pointed at a real Node runtime during local development.
- **HTTP Bridge**: Added `desktop/src/bridge/httpBridge.ts` and updated bridge selection to prefer `VITE_JOONE_DESKTOP_API_URL` before falling back to the browser mock bridge.
- **Verification**: Added `tests/desktop/desktopRuntimeServer.test.ts` and `tests/desktop/desktopHttpBridge.test.ts`, then verified with focused Vitest runs, `npm run build`, and `npm run desktop:web:build`.

### 2026-03-18: Architecture Doc Refresh (COMPLETE)

- **System Architecture Updated**: Rewrote `docs/07_system_architecture.md` to reflect the new multi-client architecture: CLI, desktop shell, shared runtime service, HTTP dev server, Tauri bridge, and browser fallback.
- **New Diagram**: Added a new Mermaid system diagram showing how the desktop UI now reaches the same shared runtime through either Tauri commands/events or HTTP/SSE during local development.
- **Clarified Browser Fallback**: Documented that the browser fallback is a frontend-only mock bridge used when no real runtime transport is attached, not a production execution path.

### 2026-03-18: Milestone 20 Slice 4 - Unified Desktop Dev Launcher (COMPLETE)

- **Single Dev Entry**: Added `src/desktop/webDev.ts` so `npm run desktop:web:dev` now launches the local runtime server and Vite together instead of requiring a manual two-process setup.
- **Backend-First Dev Mode**: The launcher injects `VITE_JOONE_DESKTOP_API_URL=http://127.0.0.1:3011`, so local desktop frontend work now prefers the real runtime-backed HTTP bridge over the browser mock by default.
- **Verification**: Added `tests/desktop/desktopDevWorkflow.test.ts`, then verified with focused desktop Vitest runs, `npm run build`, and `npm run desktop:web:build`.

### 2026-03-18: Milestone 20 Slice 5 - Tauri Runtime Bootstrap (COMPLETE)

- **Tauri Bridge Correction**: Replaced the placeholder Tauri bridge calls to non-existent `runtime_*` commands with a real bootstrap flow that resolves a runtime base URL via `invoke("runtime_base_url")` and then delegates to the HTTP bridge.
- **Rust Command Hook**: Added `runtime_base_url` in `src-tauri/src/main.rs` and registered it with `tauri::generate_handler!`, defaulting to `http://127.0.0.1:3011` unless `JOONE_DESKTOP_RUNTIME_URL` is set.
- **Verification**: Added `tests/desktop/tauriRuntimeBridge.test.ts`, then verified with focused desktop Vitest runs, `npm run build`, and `npm run desktop:web:build`.

### 2026-03-12: Milestone 19 — Core Engine Alignment & Host-First Execution (COMPLETE)

- **Deep Agents Integration**: Fully replaced the bespoke custom loop with native LangChain/Deep Agents `createDeepAgent` implementation in `ExecutionHarness`.
- **Host-First Architecture**: Introduced `executionMode` to the configuration (`JooneConfig`), defaulting to `"host"`. For host execution, integrated `WhitelistedLocalShellBackend` to safely restrict shell execution to safe binaries, bypassing explicit sandbox virtualization dynamically.
- **Context Injection**: Implemented `injectSystemMessage` as a native middleware, seamlessly weaving `process.cwd()` and project context into the static prompt during `agentLoop.ts`, mitigating the need for appended `<system-reminder>` blocks.
- **Deprecated Framework Pruning**: Aggressively pruned hundreds of lines of obsolete bespoke classes including `SubAgentManager`, `SkillLoader`, `PermissionMiddleware`, `ToolRouter` logic, `DynamicToolInterface` definitions, and corresponding bespoke suites, substituting natively with Deep Agent architectures and LangChain `StructuredTool` primitives.
- **Eval Loop Upgrade**: Refactored `joone eval` CLI evaluations to stream events organically through `harness.run(state)` rather than statically looping legacy `.step()` directives.
- **Tests**: All 103 tests strictly GREEN ensuring TypeScript integrity.

### 2026-02-22: Project Initialization & Context Engine

- **Docs Setup**: Extracted key insights from Harness Engineering and Prompt Caching research into the `docs/` folder (`01_insights...` through `08_roadmap...`).
- **Tech Stack**: Finalized TypeScript + Node + LangChain + Zod + LangSmith architecture.
- **Project Scaffold**: Initialized `package.json`, installed dependencies, configured strict `tsconfig.json`.
- **Phase 1 Complete**: Implemented `CacheOptimizedPromptBuilder` (`src/core/promptBuilder.ts`) to strictly enforce the static-to-dynamic prefix caching rules via LangChain message formatting.
- **Phase 1 Complete**: Implemented the base `ExecutionHarness` (`src/core/agentLoop.ts`) combining the LLM query and naive tool execution block.
- **Phase 2 Started**: Created the `DeferredToolsDB` and mock `SearchToolsTool` (`src/tools/registry.ts`) to support lazy loading of tools for cache preservation.
- **Testing & Sandbox Strategy**: Created `src/test_cache.ts` to empirically test Anthropic prompt caching locally. Outlined the architecture to use **E2B (e2b.dev)** or Docker for secure sandboxed code execution, isolating the agent's OS interactions from the host environment.
- **Governance**: Created `AGENTS.md` and this `PROGRESS.md` file.

### 2026-02-25: Architecture Refinements & Doc Overhaul

- **Provider Abstraction**: Refactored `ExecutionHarness` to accept any LangChain `BaseChatModel | Runnable` instead of hardcoding `ChatAnthropic`. Model selection now happens at the call site (`src/index.ts`).
- **AGENTS.md**: Added mandatory Red-Green-Refactor TDD workflow instructions; added reminder to use `tdd` skill if available.
- **PRD**: Added CLI packaging (`npx joone`), provider/model selection feature, and E2B sandbox execution as core features.
- **User Stories**: Added new Epics for CLI/Config (Epic 1) and E2B Sandbox Execution (Epic 3).
- **System Architecture**: Updated mermaid diagram to show CLI config layer routing to provider selection and E2B sandbox replacing local OS execution.
- **Roadmap**: Restructured milestones to include CLI Packaging (M2), E2B Sandbox Integration (M3), and made Testing & Evaluations an ongoing parallel milestone (M7) driven by TDD.

### 2026-02-25: Milestone 7 — TDD Setup & First GREEN

- **TDD Skills**: Located and verified both `tdd` and `test-driven-development` skills at `C:\Users\Lenovo\.agents\skills\`. Updated `AGENTS.md` with exact paths and instructions.
- **Vitest Installed**: Added `vitest` as a dev dependency.
- **PromptBuilder Tests (5/5 GREEN)**: Wrote 5 behavior-driven tests covering: strict prefix ordering, history appending after prefix, prefix stability across calls, `<system-reminder>` injection, and compaction. All passing.

### 2026-02-26: Milestone 2 — Detailed Planning Complete

- **PRD Updated**: Added streaming, expanded provider list (9+), tiered API key security (plain → keychain → encrypted), and dynamic provider loading.
- **User Stories Updated**: Added Epic 2 (Streaming), expanded Epic 1 with masked input and planned keychain onboarding (US 1.6).
- **System Architecture Updated**: Added Stream Handler component, Model Factory component, full provider table, and security tier roadmap.
- **Roadmap Updated**: Detailed Milestone 2 into 5 sub-sections (2a–2e) with a 9-step TDD vertical slice test plan.
- **Pending tracked items**: OS Keychain (Security Tier 2) and AES-256 encrypted config (Security Tier 3) tracked as planned items for future onboarding enhancement.

### 2026-02-27: Milestone 2 — CLI Packaging & Provider Selection (COMPLETE)

- **Config Manager** (`src/cli/config.ts`): `JooneConfig` interface, `loadConfig` (with env var fallback for 8 providers), `saveConfig` (with `chmod 600`), `DEFAULT_CONFIG`, `getProviderEnvVar`.
- **Model Factory** (`src/cli/modelFactory.ts`): Dynamic `import()` for Anthropic and OpenAI. API key validation, missing package detection with install instructions. Support for 9+ providers planned.
- **CLI Entry Point** (`src/cli/index.ts`): Commander.js with `joone` (default start) and `joone config` (interactive setup). Masked API key input via `@inquirer/prompts`. 9 provider choices + model lists.
- **Streaming Support** (`src/core/agentLoop.ts`): `streamStep()` method on `ExecutionHarness` — text tokens emitted via `onToken` callback, tool call JSON chunks buffered until complete.
- **Security Tier 1**: `saveConfig` writes with `mode: 0o600`, directory with `mode: 0o700`. Masked input in CLI. Env var fallback for API keys.
- **Package.json**: Updated with `"bin"`, `"build"`, `"test"`, `"test:watch"` scripts. Version bumped to `0.1.0`.
- **vitest.config.ts**: Created with test env vars to prevent Anthropic API key errors during testing.
- **Bug fix**: Deleted stale compiled `.js`/`.d.ts` files that were shadowing `.ts` sources, causing `streamStep` not to be found at runtime.
- **Tests**: 14/14 GREEN across 4 suites (config: 3, modelFactory: 4, promptBuilder: 5, streaming: 2).

### 2026-02-28: Milestone 2.5 — Terminal UI (Ink + Clack) (COMPLETE)

- **ESM Migration**: `package.json` → `"type": "module"`, `tsconfig.json` → `"module": "NodeNext"`, `"jsx": "react-jsx"`. All 17 relative imports updated with `.js` extensions. 14/14 tests GREEN after migration.
- **Dependencies**: Added `ink`, `react`, `@types/react`, `@clack/prompts`, `chalk`, `ink-spinner`. Removed `@inquirer/prompts`.
- **Clack Onboarding** (`src/cli/index.ts`): `joone config` rewritten with `intro()`, `outro()`, `spinner()`, `select()`, `password()`, `confirm()`, `cancel()`. Full cancellation handling with `isCancel()`. Chalk-styled terminal output for `joone start`.
- **Ink Components** (`src/ui/`):
  - `App.tsx`: Main REPL layout with header, message history, streaming text, tool call panel, status bar, keyboard input (Ctrl+C to exit), elapsed time timer.
  - `Header.tsx`: Bordered box showing provider, model, streaming status with cyan accent.
  - `MessageBubble.tsx`: Role-based styling (user=cyan, agent=green, system=yellow).
  - `StreamingText.tsx`: Token-by-token rendering with blinking cursor during streaming.
  - `ToolCallPanel.tsx`: Status-colored bordered box (yellow=running, green=success, red=error) with spinner, args display, truncated result.
  - `StatusBar.tsx`: Persistent footer with token count, cache hit rate, tool calls, elapsed time.

### 2026-02-28: Milestone 3 — Hybrid Sandbox Integration (COMPLETE)

- **SandboxManager** (`src/sandbox/manager.ts`): E2B SDK wrapper with `create()`, `destroy()`, `exec(cmd)`, `uploadFile(path, content)`, and `isActive()` lifecycle management.
- **FileSync** (`src/sandbox/sync.ts`): Host → sandbox file sync with `markDirty()`, `syncToSandbox()`, and `initialSync()`. Excludes `node_modules`, `.git`, `dist` on initial sync.
- **ToolRouter** (`src/tools/router.ts`): Routes tools to HOST (`write_file`, `read_file`, `search_tools`) or SANDBOX (`bash`, `run_tests`, `install_deps`). Unknown tools default to sandbox for safety.
- **Tests**: 26/26 GREEN across 6 suites (sandbox: 5, toolRouter: 7, plus existing 14).

### 2026-02-28: Milestone 3.5 — Security Scanning Tool (COMPLETE)

- **Config**: Added `sandboxTemplate?: string` to `JooneConfig` — config-driven switching between dev (lazy install) and prod (pre-baked template).
- **LazyInstaller** (`src/sandbox/bootstrap.ts`): Handles on-demand tool installation inside the sandbox. Caches install state per session. Skips entirely when using a custom E2B template.
- **SecurityScanTool** (`src/tools/security.ts`): Runs `gemini -x security:analyze` in sandbox. Supports targets: `"changes"`, `"file"`, `"deps"`. Handles CLI unavailability gracefully.
- **DepScanTool** (`src/tools/security.ts`): Runs OSV-Scanner with `npm audit` fallback. Supports JSON and summary output.
- **ToolRouter**: Added `security_scan` and `dep_scan` to `SANDBOX_TOOLS`.
- **E2B Dockerfile** (`e2b/Dockerfile`): Pre-baked production template with Gemini CLI + security extension + OSV-Scanner.
- **Tests**: 43/43 GREEN across 9 suites (bootstrap: 5, security: 5, plus existing 33).

### 2026-02-28: Milestone 4 — Harness Engineering & Middlewares (COMPLETE)

- **Middleware Types** (`src/middleware/types.ts`): `ToolCallContext` and `ToolMiddleware` interface with before/after hooks.
- **MiddlewarePipeline** (`src/middleware/pipeline.ts`): Chains before-hooks in order, executes tool, chains after-hooks in reverse. Short-circuits on rejection.
- **LoopDetectionMiddleware** (`src/middleware/loopDetection.ts`): Blocks after N identical consecutive tool calls (default: 3). Anti-doom-loop.
- **CommandSanitizerMiddleware** (`src/middleware/commandSanitizer.ts`): Blocks destructive (`rm -rf /`, fork bombs), interactive (`vim`, `top`), and pipe-to-shell commands.
- **PreCompletionMiddleware** (`src/middleware/preCompletion.ts`): Tracks test execution and blocks task completion until tests have been run.
- **Integration**: `ExecutionHarness.executeToolCalls()` now routes through `MiddlewarePipeline`.
- **Tests**: 55/55 GREEN across 10 suites (middleware: 12, plus existing 43).

### 2026-02-28: Milestone 5 — Advanced Optimizations (COMPLETE)

- **Enhanced Registry** (`src/tools/registry.ts`): Fuzzy search by name/description, `activateTool()` for dynamic mid-session tool loading, `ActivateToolTool`. Expanded stubs: git_diff, git_log, grep_search, list_dir.
- **Token Counter** (`src/core/tokenCounter.ts`): Character-based heuristic (~4 chars/token). `estimateTokens()`, `countMessageTokens()`, `isNearCapacity()`.
- **Context Compaction**: Enhanced `compactHistory()` with `keepLastN` parameter (preserves recent messages). Added `shouldCompact()` to `CacheOptimizedPromptBuilder`.
- **Reasoning Router** (`src/core/reasoningRouter.ts`): HIGH/MEDIUM reasoning levels. HIGH for planning + error recovery, MEDIUM for tool-heavy turns. Temperature-only adjustment (preserves cache prefix).
- **Tests**: 69/69 GREEN across 11 suites.

### 2026-02-28: Milestone 5.5 — Browser, Web Search & Skills (COMPLETE)

- **Browser Tool** (`src/tools/browser.ts`): Wraps `agent-browser` CLI. Actions: navigate, snapshot, click, type, screenshot, scroll. Runs in sandbox.
- **Web Search Tool** (`src/tools/webSearch.ts`): Wraps `@valyu/ai-sdk`. Sources: web, papers, finance, patents, SEC, companies. Dynamic import, type stub in `src/types/valyu.d.ts`.
- **Skills System**: `SkillLoader` (`src/skills/loader.ts`) discovers skills from project root (`./skills/`, `./.agents/skills/`) and user home (`~/.joone/skills/`, `~/.agents/skills/`). YAML frontmatter parsing, project-overrides-user deduplication.
- **Skills Tools** (`src/skills/tools.ts`): `search_skills` + `load_skill` tools for agent runtime use.
- **Config**: Added `valyuApiKey` to `JooneConfig`. Updated `ToolRouter` with browser/web_search/skills routing.

### 2026-02-28: Milestone 6 — Tracing & Refinement (COMPLETE)

- **SessionTracer** (`src/tracing/sessionTracer.ts`): Records LLM events (prompt/completion tokens), tool runs (name/args/duration/success), and errors. Saves traces to `~/.joone/traces/{id}.json`.
- **Harness Integration** (`src/core/agentLoop.ts`): Wired `ExecutionHarness` to automatically emit tracing events natively through `SessionTracer` during `step()`, `streamStep()`, and `executeToolCalls()`.
- **Trace Analyzer** (`src/tracing/analyzer.ts`): Analyzes a saved `SessionTrace` to detect doom-loops, cost hotspots (>20% total tokens), low cache efficiency (<70%), and error clusters. Generates actionable recommendations.
- **LangSmith Integration** (`src/tracing/langsmith.ts`): Injects configured `LANGCHAIN_TRACING_V2` environment variables from `JooneConfig` natively on CLI startup.
- **CLI Command** (`src/cli/index.ts`): Added `joone analyze [sessionId]` to read trace files and print the offline analysis report beautifully.
- **Tests**: 91/91 GREEN across 13 suites.

### 2026-03-01: Milestone 8 & Milestone 9 Completed!

The agent now supports robust **Persistent Sessions** allowing users to pause/resume tasks. It uses highly optimized JSONL appending and automatically detects Host File System Drift when waking up. Furthermore, it supports automatic fallbacks to OpenSandbox when the primary cloud sandbox (E2B) is unavailable!

- **SandboxManager (`ISandboxWrapper`)**: Refactored the core sandbox execution system to support multiple backends securely. Created `E2BSandboxWrapper` and `OpenSandboxWrapper`.
- **Graceful Degradation**: If E2B fails to initialize (e.g. from a network error or bad API key), the agent automatically catches the error and degrades instantly to a local Docker `OpenSandbox` container on `localhost:8080`.
- **SessionStore & SessionResumer**: Implemented a highly optimized JSONL-based `SessionStore` (`src/core/sessionStore.ts`) for persistent session logging and `SessionResumer` (`src/core/sessionResumer.ts`) for rehydrating agent state.
- **Host File System Drift Detection**: `SessionResumer` now automatically detects changes in the host file system since the last session save and prompts the user for reconciliation.
- **Config & CLI**: Updated `JooneConfig`, `loadConfig`/`saveConfig`, and the `joone config` Clack onboarding wizard to optionally prompt for `OpenSandbox API key` and `Domain`.
- **NFRs Documented**: Formally established architectural standards in `docs/05_prd.md` for Error Handling (Fallback), Rate Limiting (Budgets & Loop Breakers), Authentication (CLI keys), and Telemetry Data Retention (Local JSONs rotated at 30 days — 100% private).
- **Tests**: 95/95 GREEN tests ensuring the sandbox layer abstraction natively handles API mappings without breaking `BashTool`.

### 2026-03-04: Milestone 10 — Retry, HITL, and Skills Sync (COMPLETE)

- **Error Hierarchy** (`src/core/errors.ts`): `JooneError` base class with `LLMApiError`, `SandboxError`, `ToolExecutionError` subclasses. Each carries `category`, `retryable` flag, structured `context`, and `toRecoveryHint()` for self-healing. `wrapLLMError()` auto-classifies raw provider errors.
- **Retry** (`src/core/retry.ts`): `retryWithBackoff<T>()` generic utility with exponential backoff (1s→2s→4s + jitter). Respects `JooneError.retryable` flag. Non-retryable errors (401/403) fail immediately.
- **Self-Recovery** (`src/core/agentLoop.ts`): On exhausted retries, `ExecutionHarness` injects the error's `toRecoveryHint()` as a `SystemMessage` into conversation history instead of crashing. Tool errors now wrapped in `ToolExecutionError`.
- **HITLBridge** (`src/hitl/bridge.ts`): EventEmitter-based singleton with `askUser()` and `requestPermission()`. Configurable timeout (default 5 min) with auto-deny/auto-no-response.
- **AskUserQuestionTool** (`src/tools/askUser.ts`): Agent-callable tool for mid-turn clarification, preference gathering, and plan approval.
- **PermissionMiddleware** (`src/middleware/permission.ts`): `ToolMiddleware` implementation with 3 modes (`auto`, `ask_dangerous`, `ask_all`). Hardcoded `SAFE_TOOLS` whitelist. Uses `HITLBridge.requestPermission()` for dangerous tools.
- **HITLPrompt** (`src/ui/components/HITLPrompt.tsx`): Ink TUI component rendering question/permission prompts with `TextInput` capture.
- **Skills Sync** (`src/sandbox/sync.ts`): `syncSkillsToSandbox()` uploads user-level skill directories into `/workspace/.joone/skills/` in the sandbox.
- **System Prompt**: Updated `globalSystemInstructions` with `ask_user_question` awareness, permission system notice, and skills discovery instructions.
- **Config**: Added `permissionMode` to `JooneConfig` (default: `"auto"`).
- **Edge Cases**: Added 8 new scenarios covering retry/self-recovery, HITL timeouts, permission misconfiguration, and skills sync.
- **Tests**: 24 new tests (14 retry/errors + 10 HITL/permission) all GREEN. TypeScript build clean.

### 2026-03-18: Milestone 20 Slice 6 - Desktop Bridge Status Visibility

- Added a serializable `DesktopBridgeStatus` contract in `desktop/src/bridge/types.ts` so every desktop bridge can report its active mode (`browser`, `http`, or `tauri`), backend type, health, and optional base URL.
- Implemented `getStatus()` across the browser, HTTP, and Tauri bridges:
  - `browserBridge` now explicitly reports a healthy mock backend.
  - `httpBridge` now probes `/health` and marks the runtime ready/unavailable without blocking the rest of the shell.
  - `tauriBridge` now preserves the Tauri transport identity while reusing the HTTP-backed runtime health check.
- Updated `desktop/src/App.tsx` so the desktop shell shows `Bridge:` and `Runtime:` in the workspace panel, making it obvious whether the app is running on the mock fallback or a real runtime-backed path.
- Added `tests/desktop/desktopBridgeStatus.test.ts` first, then implemented the minimum code to make it pass per the TDD workflow.
- Verification completed:
  - `npm test -- tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopHttpBridge.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 7 - Desktop Dev Launcher Fix

- Fixed the `npm run desktop:web:dev` startup regression where `src/desktop/webDev.ts` crashed immediately with `Cannot find module 'npm/bin/npm-cli.js'`.
- Added `src/desktop/npmCli.ts` with `resolveNpmCliPath()`, which now:
  - prefers `process.env.npm_execpath` when the launcher is already running under npm
  - falls back to the npm bundle shipped beside the active Node install (important for the Windows NVM setup used in this project)
  - only then attempts package-based npm resolution
- Updated `src/desktop/webDev.ts` to use the shared resolver instead of the broken hardcoded `require.resolve("npm/bin/npm-cli.js")` path.
- Added `tests/desktop/npmCliPath.test.ts` first, then implemented the resolver to satisfy the new red-green coverage.
- Verification completed:
  - `npm test -- tests/desktop/npmCliPath.test.ts tests/desktop/desktopDevWorkflow.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 8 - Desktop Runtime CORS Support

- Fixed the browser-facing desktop dev path so the Vite frontend at `http://localhost:1420` can call the local runtime server without failing CORS checks.
- Added CORS handling to `src/desktop/server.ts`:
  - allows `http://localhost:1420` and `http://127.0.0.1:1420`
  - returns the correct `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers`
  - handles `OPTIONS` preflight requests with `204 No Content`
- Extended `tests/desktop/desktopRuntimeServer.test.ts` first to cover both simple-origin requests and browser preflight behavior, then implemented the middleware to satisfy the new failing test.
- Verification completed:
  - `npm test -- tests/desktop/desktopRuntimeServer.test.ts tests/desktop/desktopDevWorkflow.test.ts tests/desktop/desktopHttpBridge.test.ts tests/desktop/desktopBridgeStatus.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 9 - Desktop Session Snapshot Hardening

- Fixed a desktop UI crash where the session sidebar assumed every runtime session had a `messages` array and called `.at(0)` on `undefined`.
- Corrected the shared runtime contract in `src/runtime/service.ts` so `listSessions()` now returns full `RuntimeSessionSnapshot[]` built from persisted session payloads instead of raw `SessionHeader[]`.
- Preserved CLI compatibility by carrying saved-session metadata (`lastSavedAt`, `description`) alongside the richer runtime snapshot type in `src/runtime/types.ts`.
- Hardened `desktop/src/App.tsx` so incoming sessions are normalized before rendering, which prevents older or partial payloads from crashing the shell even if they are incomplete.
- Updated `src/cli/index.ts` so `joone sessions` gracefully handles unsaved in-memory sessions with fallback display text instead of assuming persistence metadata always exists.
- Added the failing coverage first in `tests/runtime/runtimeService.test.ts`, then implemented the runtime mapping fix and UI hardening.
- Verification completed:
  - `npm test -- tests/runtime/runtimeService.test.ts tests/desktop/desktopRuntimeServer.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 10 - Desktop Error Containment

- Added `desktop/src/DesktopErrorBoundary.tsx` and wrapped the desktop entrypoint in `desktop/src/main.tsx` so render-time crashes now fall back to a clear desktop recovery screen instead of taking down the whole window.
- Hardened `desktop/src/App.tsx` so bridge/runtime failures are caught and surfaced inside the shell:
  - `hydrateShell()` failures are caught during startup
  - `startSession`, `resumeSession`, and `submit` now report failures instead of leaking uncaught promise rejections
  - runtime `session:error` events now update the shell's visible error state
- Added a `Last error:` field to the workspace panel and pushed failures into the activity log so the user can see what went wrong without relying on the browser console alone.
- Added `tests/desktop/desktopErrorHandling.test.ts` first, then implemented the minimum error boundary and reporting flow to satisfy the new red-green coverage.
- Verification completed:
  - `npm test -- tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopUiShell.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/runtime/runtimeService.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 11 - Tauri Startup Commands

- Moved the desktop startup-critical Tauri path off the frontend HTTP bridge for status and config loading.
- Updated `desktop/src/bridge/tauriBridge.ts` so:
  - `getStatus()` now calls `invoke<DesktopBridgeStatus>("runtime_status")`
  - `loadConfig()` now calls `invoke<DesktopConfig>("runtime_load_config")`
  - the remaining session/message flows still delegate to the HTTP bridge for now
- Expanded `src-tauri/src/main.rs` with real startup commands:
  - `runtime_status`
  - `runtime_load_config`
  - existing `runtime_base_url`
- `runtime_status` now reports Tauri-mode runtime health against the local runtime URL, while `runtime_load_config` reads the existing `~/.joone/config.json` shape with sensible defaults for desktop startup.
- Added a `reqwest` dependency in `src-tauri/Cargo.toml` for native runtime health checks in the Tauri shell.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 12 - Desktop Error Toasts and Retry Actions

- Added toast-style desktop recovery UI for failed startup/session/message actions in `desktop/src/App.tsx`.
- Introduced a `retryActionRef`-backed retry path so the shell can replay the last failed action directly from the UI instead of forcing a browser refresh.
- Added `Retry last action` and `Dismiss` controls, and styled them via `desktop/src/styles.css` as a floating toast stack so failures are visible without hiding the rest of the desktop shell.
- This recovery layer now complements the earlier `DesktopErrorBoundary`: render-time crashes still fall back to the boundary, while async bridge/runtime failures stay inside the normal app shell with a retry affordance.
- Added `tests/desktop/desktopErrorRecovery.test.ts` first, then implemented the minimal toast/retry flow to satisfy the red-green cycle.
- Verification completed:
  - `npm test -- tests/desktop/desktopErrorRecovery.test.ts`
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 13 - Tauri Native Session Listing

- Moved `listSessions()` off the Tauri HTTP bridge path and onto a real native command.
- Updated `desktop/src/bridge/tauriBridge.ts` so `listSessions()` now calls `invoke<DesktopSessionSnapshot[]>("runtime_list_sessions")`.
- Added a native session reader in `src-tauri/src/main.rs` that:
  - scans `~/.joone/sessions/*.jsonl`
  - reads the saved session header and message lines directly
  - maps saved LangChain message types into desktop roles (`user`, `agent`, `system`)
  - returns desktop snapshots sorted by `lastSavedAt`
- This keeps Tauri startup and saved-session browsing off the HTTP bridge while session start/resume/message execution still migrate in later slices.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 14 - Tauri Native Session Start and Resume

- Moved `startSession()` and `resumeSession()` off the Tauri frontend HTTP bridge path.
- Updated `desktop/src/bridge/tauriBridge.ts` so:
  - `startSession()` now calls `invoke<DesktopSessionSnapshot>("runtime_start_session")`
  - `resumeSession(sessionId)` now calls `invoke<DesktopSessionSnapshot>("runtime_resume_session", { sessionId })`
- Added native Rust commands in `src-tauri/src/main.rs` that proxy those lifecycle actions through the runtime URL and deserialize the returned desktop session snapshot payloads.
- Added the minimum Rust-side deserialization needed for `DesktopMessage`, `DesktopMetrics`, and `DesktopSessionSnapshot` so Tauri can round-trip session lifecycle payloads cleanly.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-18: Milestone 20 Slice 15 - Tauri Native Message Submission

- Moved `submitMessage()` off the Tauri frontend HTTP bridge path.
- Updated `desktop/src/bridge/tauriBridge.ts` so `submitMessage(sessionId, text)` now calls `invoke<DesktopSessionSnapshot>("runtime_submit_message", { sessionId, text })`.
- Added `runtime_submit_message` in `src-tauri/src/main.rs`, plus the minimum typed Rust payload needed to proxy `{ sessionId, text }` to the runtime URL and deserialize the updated desktop session snapshot response.
- Refactored the Rust-side runtime proxy helper to support both empty-body and JSON-body POST requests so the same path can be reused for later native Tauri commands.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
- Native verification note:
  - `cargo check --manifest-path src-tauri/Cargo.toml` was attempted multiple times, including `-j 1`, but currently fails with Windows file-lock errors inside `src-tauri/target/debug/deps` while removing intermediate `.rcgu.o` files. The failure appears environmental/toolchain-related rather than a surfaced Rust source error.

### 2026-03-18: Milestone 20 Slice 16 - Tauri Native Event Streaming and Build Scaffold Repair

- Moved the active conversation subscription path off the Tauri frontend HTTP bridge.
- Updated `desktop/src/bridge/tauriBridge.ts` so `subscribe(sessionId, listener)` now:
  - registers a native Tauri event listener on `runtime-event:{sessionId}`
  - invokes `runtime_subscribe_session`
  - invokes `runtime_unsubscribe_session` during cleanup
- Expanded `src-tauri/src/main.rs` with:
  - `RuntimeSubscriptionState` to track active session subscriptions
  - `runtime_subscribe_session` and `runtime_unsubscribe_session` commands
  - a Rust-side SSE relay that reads `/sessions/{sessionId}/events` from the runtime URL and re-emits each payload into Tauri via `app.emit(...)`
  - a native `session:error` emission path when the runtime event stream fails
- Repaired the Tauri crate scaffold so native verification works reliably:
  - added `src-tauri/build.rs`
  - wired `build = "build.rs"` in `src-tauri/Cargo.toml`
  - added a minimal valid Windows icon at `src-tauri/icons/icon.ico`
- Extended `tests/desktop/tauriRuntimeBridge.test.ts` to lock in the native event subscription path and updated `tests/desktop/desktopScaffold.test.ts` to require the Tauri build script and icon scaffold.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/desktopScaffold.test.ts`
  - `npm test -- tests/desktop/desktopScaffold.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts`
  - `npm test`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-18: Milestone 20 Slice 17 - Tauri Native Session Close

- Moved `closeSession()` off the Tauri frontend HTTP bridge path.
- Updated `desktop/src/bridge/tauriBridge.ts` so `closeSession(sessionId)` now calls `invoke("runtime_close_session", { sessionId })` directly instead of delegating to the HTTP bridge.
- Expanded `src-tauri/src/main.rs` with:
  - `runtime_close_session`, which tears down any active native subscription for that session before forwarding the close request
  - `runtime_delete`, a small native helper for runtime lifecycle routes that return `204 No Content`
- This means the active Tauri conversation lifecycle is now natively handled for:
  - start/resume
  - submit message
  - subscribe/unsubscribe to runtime events
  - close session
- Extended `tests/desktop/tauriRuntimeBridge.test.ts` first to require the native close-session command and remove the remaining HTTP fallback assertion.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/desktopScaffold.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts tests/desktop/desktopRuntimeServer.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-18: Milestone 20 Slice 18 - Tauri Native Config Save

- Moved `saveConfig()` off the Tauri frontend HTTP bridge path.
- Updated `desktop/src/bridge/tauriBridge.ts` so `saveConfig(config)` now calls `invoke("runtime_save_config", { config })` directly, and removed the now-unused HTTP bridge fallback from the Tauri frontend adapter.
- Expanded `src-tauri/src/main.rs` with `runtime_save_config`, which:
  - loads the existing `~/.joone/config.json` when present
  - preserves unrelated config fields
  - updates the desktop-owned `provider`, `model`, and `streaming` keys
  - creates the config directory/file when it does not exist yet
- This means the Tauri desktop frontend no longer depends on the HTTP bridge at all; the runtime URL is now fully hidden behind native Rust commands/events in Tauri mode.
- Extended `tests/desktop/tauriRuntimeBridge.test.ts` first to require the native config-save command and to assert that the old HTTP fallback path is gone.
- Verification completed:
  - `npm test -- tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm test -- tests/desktop/desktopScaffold.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopUiShell.test.ts tests/desktop/desktopRuntimeServer.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-19: Milestone 20 Slice 19 - Desktop Settings Editor

- Added a real desktop settings editor to `desktop/src/App.tsx`.
- The desktop shell now keeps a `draftConfig` alongside the loaded config and exposes editable controls for:
  - `provider`
  - `model`
  - `streaming`
- Added a `Save Settings` action wired through `bridge.saveConfig(...)`, which now uses the native Tauri config save command in desktop mode.
- The settings panel only enables save when the draft differs from the persisted config, and successful saves now add a visible activity log entry.
- Added settings-specific styling in `desktop/src/styles.css` for the new form rows and toggle layout.
- Extended `tests/desktop/desktopUiShell.test.ts` first to require the settings editor contract and native save wiring, then implemented the minimum UI to make it pass.
- Verification completed:
  - `npm test -- tests/desktop/desktopUiShell.test.ts`
  - `npm test -- tests/desktop/desktopUiShell.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopScaffold.test.ts tests/desktop/desktopRuntimeServer.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-19: Milestone 20 Slice 20 - Desktop HITL Queue and Answer Flow

- Added a real desktop HITL interaction path across the runtime, transports, and UI.
- Extended the runtime event contract so HITL events now include stable prompt IDs:
  - `hitl:question` now carries `id`, `question`, and `options`
  - `hitl:permission` now carries `id`, `toolName`, and `args`
- Added `answerHitl(id, answer)` to `JooneRuntimeService`, the desktop IPC bridge, the HTTP dev server, and the desktop bridge contracts so prompts can be answered from either the desktop web shell or Tauri mode.
- Added native `runtime_answer_hitl` in `src-tauri/src/main.rs`, so the Tauri desktop app can submit prompt answers without falling back to HTTP at the frontend layer.
- Added a queue-based desktop HITL UI in `desktop/src/App.tsx`:
  - prompts are stored FIFO in `pendingHitlPrompts`
  - the active prompt is rendered in a dedicated HITL card
  - additional queued prompts are surfaced via `Pending prompts: N`
  - answers are submitted through `bridge.answerHitl(...)`
- Investigation result for "what happens if HITL questions are more than one":
  - before this slice, later prompts could overwrite earlier ones at the desktop UI layer because only one active prompt was tracked
  - after this slice, the desktop path handles multiple pending prompts in order using stable IDs and a FIFO queue
  - the older Ink/TUI path still uses single prompt state, so desktop is now safer here than the legacy TUI
- Extended tests first across the relevant seams:
  - `tests/runtime/runtimeService.test.ts` now proves multiple HITL questions can be emitted and answered in sequence
  - `tests/desktop/desktopUiShell.test.ts` now requires the desktop HITL queue/answer UI
  - `tests/desktop/desktopRuntimeServer.test.ts` now requires the HITL answer route
  - `tests/desktop/tauriRuntimeBridge.test.ts` now requires the native Tauri HITL answer command
- Verification completed:
  - `npm test -- tests/runtime/runtimeService.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopUiShell.test.ts tests/desktop/desktopRuntimeServer.test.ts`
  - `npm test -- tests/runtime/runtimeService.test.ts tests/desktop/desktopUiShell.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/desktop/desktopRuntimeServer.test.ts tests/desktop/desktopErrorRecovery.test.ts tests/desktop/desktopErrorHandling.test.ts tests/desktop/desktopBridgeStatus.test.ts tests/desktop/desktopScaffold.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-19: HITL Queue Parity - Legacy Ink/TUI

- Brought the same FIFO HITL queue behavior to the legacy Ink/TUI path so it no longer overwrites older pending prompts when a second question or permission request arrives before the first is answered.
- Updated `src/ui/App.tsx` to replace the separate `hitlQuestion` and `hitlPermission` slots with a single `pendingHitlPrompts` queue keyed by stable prompt IDs.
- The TUI now appends incoming questions and permissions in order and removes only the answered prompt via `bridge.resolveAnswer(id, answer)`, matching the safer desktop behavior.
- Updated `src/ui/components/HITLPrompt.tsx` to surface queue depth via `Pending prompts: N` while still rendering the active prompt inline in the input area.
- Added a focused regression in `tests/ui/hitlQueue.test.ts` first, then implemented the minimum TUI changes to make it pass.
- Verification completed:
  - `npm test -- tests/ui/hitlQueue.test.ts`
  - `npm test -- tests/ui/hitlQueue.test.ts tests/ui/appLifecycle.test.ts tests/runtime/runtimeService.test.ts`
  - `npm run build`

### 2026-03-19: Milestone 20 Slice 21 - Desktop Packaging Workflow

- Added `.github/workflows/desktop-build.yml` so desktop bundle generation now has a first cross-platform GitHub Actions path.
- The workflow runs on `main`, `dev`, pull requests, and manual dispatch, then builds on:
  - `windows-latest`
  - `ubuntu-22.04`
  - `macos-latest`
- Added Linux-specific package installation for Tauri's Ubuntu bundle requirements (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`).
- The workflow installs npm dependencies, runs focused desktop packaging regressions, builds the shared TypeScript runtime, and then uses `tauri-apps/tauri-action@v1` with `uploadWorkflowArtifacts: true` so installers are emitted as workflow artifacts instead of requiring a release flow immediately.
- Added `tests/desktop/desktopPackagingWorkflow.test.ts` first to lock the workflow contract before implementation.
- Updated `README.md` to point contributors at the new desktop packaging CI path.
- Verification completed:
  - `npm test -- tests/desktop/desktopPackagingWorkflow.test.ts`
  - `npm test -- tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopScaffold.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/ui/hitlQueue.test.ts`
  - `npm run build`

### 2026-03-19: Milestone 20 Slice 22 - Desktop Bundle Output Validation

- Added `src/desktop/validateBundles.ts`, a small packaging validator that maps each CI runner to the expected Tauri bundle output:
  - `windows-latest` -> `.msi`
  - `ubuntu-22.04` -> `.AppImage`
  - `macos-latest` -> `.dmg`
- The validator walks `src-tauri/target/release/bundle/<platform>` and fails with a descriptive error if the expected installer artifact is missing.
- Updated `.github/workflows/desktop-build.yml` to run `npx tsx src/desktop/validateBundles.ts --runner "${{ matrix.platform }}"` after the Tauri build step, turning packaging into a real smoke check instead of only a fire-and-forget bundle action.
- Added tests first:
  - `tests/desktop/desktopBundleValidation.test.ts` covers the validator against real temp directories
  - `tests/desktop/desktopPackagingValidationWorkflow.test.ts` locks the workflow step into CI
- Verification completed:
  - `npm test -- tests/desktop/desktopBundleValidation.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts`
  - `npm test -- tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts tests/desktop/desktopBundleValidation.test.ts tests/desktop/desktopScaffold.test.ts tests/desktop/tauriRuntimeBridge.test.ts tests/ui/hitlQueue.test.ts`
  - `npm run build`

### 2026-03-19: Desktop Settings Catalog Alignment

- Replaced the desktop settings provider/model free-text inputs with dropdowns backed by a shared provider catalog in `src/desktop/providerCatalog.ts`.
- Moved the CLI onboarding provider/model lists onto the same shared catalog so the CLI and desktop app now present the same supported providers and preconfigured model options.
- Updated `desktop/src/App.tsx` to:
  - render provider and model as `<select>` controls
  - show the selected provider hint in the settings panel
  - keep config save behavior unchanged while preventing arbitrary unsupported values from being typed in the desktop UI
- Added coverage in `tests/desktop/desktopUiShell.test.ts` to lock the dropdown-based settings contract and shared catalog usage.
- Verification completed:
  - `npm test -- tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-19: Desktop Session List Compaction and Naming

- Made the desktop sessions panel more manageable by default in `desktop/src/App.tsx`.
- The UI now:
  - shows only the first four saved sessions initially
  - exposes `View more` / `Show fewer` to expand or collapse the list
  - renders a conversation-derived label for each session instead of relying on the raw session id
  - keeps the session id as secondary metadata for precise identification when needed
- Extended the desktop bridge session contract with `description?: string` and updated the browser bridge to populate it for local mock sessions.
- Updated `src-tauri/src/main.rs` so native Tauri session snapshots also include the persisted session description from the JSONL header, keeping native mode aligned with the shared runtime/HTTP paths.
- Extended tests first:
  - `tests/desktop/desktopUiShell.test.ts` now locks the compact session list and naming contract
  - `tests/runtime/runtimeService.test.ts` now asserts that persisted desktop session snapshots include the conversation-derived description
- Verification completed:
  - `npm test -- tests/desktop/desktopUiShell.test.ts tests/runtime/runtimeService.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-19: Desktop Session Panel Scroll Refinement

- Refined the desktop sessions panel again to restore the intended compact default behavior.
- Updated `desktop/src/App.tsx` so the shell now:
  - shows only the first three sessions by default
  - restores `View more` / `Show fewer`
  - keeps the expanded list scrollable instead of letting it stretch the whole sidebar
- Updated `desktop/src/styles.css` so the base and expanded session-list states both remain bounded with `overflow-y: auto`.
- Removed the interrupted partial regression edit from `tests/desktop/desktopUiShell.test.ts` per user request not to add test coverage for this kind of UI refactor.
- Verification completed:
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-19: Desktop Composer Viewport Fix

- Refined the desktop layout so the main composer stays in the viewport even when the conversation history gets long.
- Updated `desktop/src/styles.css` to:
  - lock the app shell to the viewport height
  - make the sidebar and main column honor `min-height: 0`
  - keep the conversation pane as the scroll container
  - keep the hero and composer from shrinking away
- Tightened the same layout further so the shell itself no longer scrolls and the message history is constrained to the conversation pane, which keeps the composer visible without having to page-scroll back down.
- No regression was added for this UI/layout refactor per user request.
- Verification completed:
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-19: Desktop + TUI Workstream UI Polish

- Added a richer shared "workstream" presentation layer for live agent activity in both clients instead of relying on plain status strings.
- Updated `desktop/src/bridge/types.ts` so desktop runtime events now carry the full tool-call payload needed by the UI:
  - `session:status`
  - `tool:start.args`
  - `tool:end.result` and optional `tool:end.args`
- Updated the browser bridge in `desktop/src/bridge/browserBridge.ts` to emit mock tool/status events too, so the local fallback path still exercises the richer UI.
- Reworked `desktop/src/App.tsx` and `desktop/src/styles.css` so the desktop conversation pane now includes:
  - a live todo/progress card for the current request
  - richer tool-call cards with running/completed/error badges
  - compact argument chips and summarized tool results
  - active-session highlighting in the session list
- Reworked the Ink/TUI in `src/ui/App.tsx` to use the same mental model:
  - a dedicated `WorkflowTodoPanel` component in `src/ui/components/WorkflowTodoPanel.tsx`
  - upgraded tool-call cards in `src/ui/components/ToolCallPanel.tsx`
  - reduced tool-event spam in system messages now that tool state has a first-class UI
- No new regression tests were added for this mostly presentational slice per user request; verification stayed at build-level checks.
- Verification completed:
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-19: Desktop Session Resume Polish

- Added a proper saved-session recency path to the desktop contract:
  - `desktop/src/bridge/types.ts` now exposes `lastSavedAt?: number`
  - `src-tauri/src/main.rs` now carries persisted `lastSavedAt` through the native `DesktopSessionSnapshot`
  - `desktop/src/bridge/browserBridge.ts` now stamps mock sessions too so the local fallback path exercises the same UI
- Polished the desktop sessions rail in `desktop/src/App.tsx` and `desktop/src/styles.css`:
  - active session cards now show a `Current session` badge
  - saved sessions now show `Last saved ...` metadata with human-readable relative timestamps
  - the currently loading session now shows `Resuming...` and temporarily disables other resume actions for a clearer in-flight state
- Added regression coverage for this slice:
  - `tests/desktop/desktopUiShell.test.ts` now locks the saved-time metadata and resume-state UI contract
  - `tests/desktop/tauriRuntimeBridge.test.ts` now locks the native `lastSavedAt` propagation path
- Verification completed:
  - `npm test -- tests/desktop/desktopUiShell.test.ts tests/desktop/tauriRuntimeBridge.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-20: Desktop Resume Focus and Scroll Polish

- Tightened the restored-session experience in `desktop/src/App.tsx` by adding:
  - `conversationRef` so the desktop shell scrolls back to the latest restored conversation entry after resume/message updates
  - `composerInputRef` so the main composer regains focus after a session finishes resuming, as long as no HITL prompt is blocking input
- Implemented the actual behavior with small `useEffect` hooks plus `requestAnimationFrame(...)` to avoid fighting the DOM before the restored session content is painted.
- Added regression coverage in `tests/desktop/desktopUiShell.test.ts` for the new scroll/focus affordance contract.
- Verification completed:
  - `npm test -- tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-20: Desktop Restore and Empty-State Cleanup

- Cleaned up the remaining resumed-session UX gaps in `desktop/src/App.tsx` and `desktop/src/styles.css`:
  - added an explicit `isRestoringSession` state for the period after the user clicks resume but before the restored thread is active
  - replaced the generic conversation placeholder with distinct conversation-pane states for:
    - restoring a saved thread
    - no active session yet
    - an active session that has no saved conversation turns
  - added a small `hero-kicker` state cue so the top of the shell reflects whether the user is restoring a saved thread, continuing a resumed one, or starting fresh
- Added regression coverage in `tests/desktop/desktopUiShell.test.ts` for the new restore/empty-state contract.
- Verification completed:
  - `npm test -- tests/desktop/desktopUiShell.test.ts`
  - `npm run build`
  - `npm run desktop:web:build`

### 2026-03-20: Desktop Release Metadata and Artifact Naming Polish

- Added `src/desktop/releaseMetadata.ts` as the desktop release source of truth derived from `src-tauri/tauri.conf.json`.
- The helper now standardizes:
  - release tag naming
  - release names/body text
  - workflow artifact naming
  - release asset naming
- Updated `.github/workflows/desktop-build.yml` so the desktop bundle workflow now computes that metadata before invoking `tauri-apps/tauri-action` and passes explicit:
  - `tagName`
  - `releaseName`
  - `releaseBody`
  - `releaseAssetNamePattern`
  - `workflowArtifactNamePattern`
- Added regression coverage in `tests/desktop/desktopReleaseMetadata.test.ts` for both the helper output contract and the workflow wiring.
- Verification completed:
  - `npm test -- tests/desktop/desktopReleaseMetadata.test.ts tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts`
  - `npm run build`

### 2026-03-20: Desktop Installer Smoke Checks

- Added `src/desktop/smokeTestBundles.ts` to run platform-native installer sanity checks after Tauri bundling:
  - Windows: `msiexec /a` administrative extraction for `.msi` bundles
  - Linux: `--appimage-extract` for `.AppImage` bundles
  - macOS: `hdiutil attach` / `detach` plus `.app` presence checks for `.dmg` bundles
- Updated `.github/workflows/desktop-build.yml` so the desktop packaging workflow now runs `Smoke test desktop installers` immediately after bundle validation on every matrix platform.
- Added regression coverage in:
  - `tests/desktop/desktopInstallerSmoke.test.ts`
  - `tests/desktop/desktopInstallerSmokeWorkflow.test.ts`
- Verification completed:
  - `npm test -- tests/desktop/desktopInstallerSmoke.test.ts tests/desktop/desktopInstallerSmokeWorkflow.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts tests/desktop/desktopBundleValidation.test.ts`
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-20: Hosted Desktop CI Review and Release Upload Fixes

- Used GitHub-hosted Actions runs plus GitHub CLI to validate the desktop packaging workflow against the real repository instead of only local tests.
- Confirmed the first hosted green run (`23345088657`) still had two release-path gaps:
  - `tauri-apps/tauri-action@v0` warned that `releaseAssetNamePattern`, `workflowArtifactNamePattern`, and `uploadWorkflowArtifacts` are unsupported inputs
  - the published `joone-desktop-v0.1.0` release only received macOS/Linux assets while the Windows job skipped uploads after building the MSI
- Updated `src/desktop/releaseMetadata.ts` so the workflow now emits:
  - `asset_name_pattern` for the supported Tauri action input
  - `workflow_artifact_prefix` for explicit artifact uploads
- Added `src/desktop/publishReleaseAssets.ts` so validated bundles are uploaded to the release explicitly with `gh release upload --clobber` after the smoke checks pass.
- Updated `.github/workflows/desktop-build.yml` to:
  - use the supported `assetNamePattern` input
  - publish release assets explicitly after validation/smoke checks
  - upload workflow artifacts explicitly via `actions/upload-artifact@v4`
- Added regression coverage in:
  - `tests/desktop/desktopPackagingWorkflow.test.ts`
  - `tests/desktop/desktopReleaseMetadata.test.ts`
  - `tests/desktop/desktopReleasePublish.test.ts`
- Verification completed:
  - `npm test -- tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopReleaseMetadata.test.ts tests/desktop/desktopReleasePublish.test.ts`
  - `npm test -- tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopReleaseMetadata.test.ts tests/desktop/desktopReleasePublish.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts tests/desktop/desktopInstallerSmokeWorkflow.test.ts tests/desktop/desktopBundleValidation.test.ts tests/desktop/desktopInstallerSmoke.test.ts`
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-20: Windows Desktop Script Entry Fix

- Follow-up hosted CI inspection showed the Windows job still had blank `release_tag` / `workflow_artifact_prefix` outputs, so the publish step ran with `--tag ""` and the workflow artifact name degraded to `-windows-latest`.
- Root cause: multiple desktop CLI helper scripts used `import.meta.url === new URL(process.argv[1], "file:").href`, which worked on macOS/Linux but could silently no-op on Windows path shapes.
- Added `src/desktop/cliEntry.ts` with a shared `isDirectDesktopScriptExecution(...)` helper that normalizes Windows drive-letter paths and POSIX paths explicitly.
- Updated the affected desktop scripts to use the shared helper:
  - `src/desktop/releaseMetadata.ts`
  - `src/desktop/publishReleaseAssets.ts`
  - `src/desktop/validateBundles.ts`
  - `src/desktop/smokeTestBundles.ts`
- Added regression coverage in `tests/desktop/desktopCliEntry.test.ts` so Windows and POSIX argv path shapes both stay supported.
- Verification completed:
  - `npm test -- tests/desktop/desktopCliEntry.test.ts tests/desktop/desktopReleaseMetadata.test.ts tests/desktop/desktopReleasePublish.test.ts tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts tests/desktop/desktopInstallerSmokeWorkflow.test.ts tests/desktop/desktopBundleValidation.test.ts tests/desktop/desktopInstallerSmoke.test.ts`
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`

### 2026-03-20: Desktop Release Deduplication Polish

- Follow-up hosted release review showed the pipeline was functionally correct but still messy: the release contained duplicate assets because both `tauri-action` and the temporary explicit `gh release upload` path were publishing bundles.
- Simplified the release path so `tauri-action` is once again the only uploader for release assets, while workflow artifacts still upload explicitly through `actions/upload-artifact@v4`.
- Added `src/desktop/pruneReleaseAssets.ts` so the workflow now removes legacy non-canonical desktop asset names from the target release before the canonical upload step runs.
- Updated `src/desktop/releaseMetadata.ts` to emit `asset_name_prefix` alongside `asset_name_pattern`, giving the prune step a stable canonical prefix to preserve.
- Removed the temporary explicit publish path:
  - deleted `src/desktop/publishReleaseAssets.ts`
  - deleted `tests/desktop/desktopReleasePublish.test.ts`
- Added regression coverage in:
  - `tests/desktop/desktopReleasePrune.test.ts`
  - `tests/desktop/desktopPackagingWorkflow.test.ts`
  - `tests/desktop/desktopReleaseMetadata.test.ts`
- Verification completed:
  - `npm test -- tests/desktop/desktopCliEntry.test.ts tests/desktop/desktopPackagingWorkflow.test.ts tests/desktop/desktopReleaseMetadata.test.ts tests/desktop/desktopReleasePrune.test.ts tests/desktop/desktopPackagingValidationWorkflow.test.ts tests/desktop/desktopInstallerSmokeWorkflow.test.ts tests/desktop/desktopBundleValidation.test.ts tests/desktop/desktopInstallerSmoke.test.ts`
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml` using a temporary `CARGO_TARGET_DIR`
- Hosted CI then exposed one more GitHub CLI nuance: `gh release view --json assets` does not return the asset identifier shape expected by `gh release delete-asset` in this workflow. The prune helper now deletes by asset **name** instead of the JSON `id` field, which makes the cleanup step work consistently across runners.
