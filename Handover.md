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

All development follows strict TDD. Currently, **95 out of 95 tests are GREEN** across 13 test suites. TypeScript compiles cleanly.

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

### Tool Routing Summary

| HOST (safe, runs on user machine) | SANDBOX (isolated, runs in E2B)     |
| --------------------------------- | ----------------------------------- |
| `read_file`, `write_file`         | `bash`, `run_tests`, `install_deps` |
| `search_tools`, `activate_tool`   | `security_scan`, `dep_scan`         |
| `web_search` (API call)           | `browser` (agent-browser CLI)       |
| `search_skills`, `load_skill`     | Unknown tools (safe-by-default)     |

### Pending Next Steps (Where to resume)

**Start on Milestone 7: Testing & Evaluations (Evals).**

1.  **LangSmith Evals**: Hook LangSmith datasets up to the `ExecutionHarness` to run regression tests against known code tasks (already supported by tracing!).
2.  **Dataset CI**: Build `joone eval` or similar offline script to assert Cache Hit Rate > 90% and Cost < $X per conversation.

_Reference `docs/08_roadmap.md` and `task.md` (in the agent brain) for the full checklist._
