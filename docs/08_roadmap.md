# Implementation Roadmap

We will tackle this project moving from the foundation outward.

## Milestone 1: The Foundation (Core Execution & Caching) ✅

**Goal:** Build a basic agent that successfully executes simple loops while maintaining a 100% cache prefix validity across turns.

1. ~~**Setup Project**: Initialize the repository based on the chosen Tech Stack.~~
2. ~~**The Prompt Builder Engine**: Build the class responsible for layering static instruction strings, tools, and message arrays cleanly.~~
3. **Core Tooling**: Implement `bash_executor` and `file_reader` / `file_writer`.
4. **Basic Event Loop**: Implement a while loop that queries the LLM and runs the exact tool.

## Milestone 2: CLI Packaging & Provider Selection

**Goal:** Package joone as an installable CLI tool with dynamic LLM provider configuration, streaming output, and secure API key management.

### 2a. Config Manager (`src/cli/config.ts`)

1. **`JooneConfig` interface**: Define shape: `provider`, `model`, `apiKey`, `maxTokens`, `temperature`, `streaming`.
2. **`loadConfig()`**: Reads `~/.joone/config.json`. Returns sensible defaults if file doesn't exist.
3. **`saveConfig(config)`**: Writes JSON to `~/.joone/config.json`. Sets file permissions to `600` (owner-only).
4. **Env var fallback**: If `apiKey` is missing from config, check `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.

### 2b. Model Factory (`src/cli/modelFactory.ts`)

1. **`createModel(config)`**: Factory function that switches on `config.provider`.
2. **Dynamic imports**: Uses `await import("@langchain/anthropic")` etc. to avoid bundling all providers.
3. **Missing package detection**: If the import fails, print `"Provider X requires @langchain/X. Run: npm install @langchain/X"`.
4. **API key validation**: Throws a descriptive error if the API key is missing for the selected provider.
5. **Supported providers** (9+): Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, Fireworks, Together AI, Ollama.

### 2c. CLI Entry Point (`src/cli/index.ts`)

1. **Commander.js** for command parsing.
2. **`joone` (default command)**: Loads config → creates model → starts execution harness REPL.
3. **`joone config`**: Interactive prompts (via `@inquirer/prompts`) for provider, model, API key (masked), streaming toggle.
4. **`package.json` `"bin"` field**: Maps `joone` → `./dist/cli/index.js`.

### 2d. Streaming Support

1. **`ExecutionHarness.streamStep()`**: New method using `this.llm.stream(messages)`.
2. **Text chunks**: Printed to `process.stdout` in real-time.
3. **Tool call chunks**: Buffered until the full tool call JSON is received, then executed via the middleware pipeline.
4. **Config flag**: `streaming: true` (default). Disable via `joone config` or `--no-stream` flag.

### 2e. Security Tiers (Phased)

1. **Tier 1 (Now)**: Plain `config.json` + `chmod 600` + masked input.
2. **Tier 2 (Planned)**: OS Keychain via `keytar` — user selects during onboarding.
3. **Tier 3 (Planned)**: AES-256 encrypted config with machine-derived key — user selects during onboarding.

### TDD Test Plan (Vertical Slices)

| #   | RED Test                                                                   | GREEN Implementation                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `loadConfig` returns defaults when no file exists                          | `loadConfig()` with default fallback |
| 2   | `saveConfig` writes JSON and `loadConfig` reads it back                    | `saveConfig()` implementation        |
| 3   | `loadConfig` falls back to env var if `apiKey` is missing                  | Env var fallback logic               |
| 4   | `createModel` returns `ChatAnthropic` when provider is `"anthropic"`       | Factory Anthropic branch             |
| 5   | `createModel` returns `ChatOpenAI` when provider is `"openai"`             | Factory OpenAI branch                |
| 6   | `createModel` throws descriptive error if API key missing                  | Key validation                       |
| 7   | `createModel` throws with install instructions if provider package missing | Dynamic import error handling        |
| 8   | `streamStep` emits text chunks to provided callback                        | Stream handler implementation        |
| 9   | `streamStep` buffers tool call JSON and returns complete `AIMessage`       | Tool call buffering                  |

---

## Milestone 3: Hybrid Sandbox Integration

**Goal:** Route all agent code execution through isolated E2B cloud microVMs while keeping file I/O on the host for real-time IDE visibility.

### 3a. E2B Sandbox Lifecycle (`src/sandbox/manager.ts`)

1. **Install E2B SDK**: Add `e2b` to dependencies.
2. **`SandboxManager`**: Class that creates/destroys an E2B sandbox per session.
3. **Timeout & Cleanup**: Auto-destroy sandbox after configurable idle timeout.

### 3b. File Sync Layer (`src/sandbox/sync.ts`)

1. **Change Tracker**: Track which host files have been modified since last sync using file mtimes or a dirty set.
2. **`syncToSandbox()`**: Upload only changed files to `/workspace/` in the sandbox before each execution.
3. **Initial Sync**: On session start, upload the full project directory.

### 3c. Tool Router (`src/tools/router.ts`)

1. **Host tools**: `write_file`, `read_file` → execute via Node.js `fs` on the host.
2. **Sandbox tools**: `bash`, `run_tests`, `install_deps` → sync files, then execute via `sandbox.commands.run()`.
3. **Automatic routing**: Tool router determines target based on tool type.

### 3d. Rewire Existing Tools

1. **`BashTool`**: Remove stub, connect to `sandbox.commands.run()`.
2. **`ReadFileTool`**: Keep on host, add size guardrail.
3. **`WriteFileTool`**: Keep on host, mark file as dirty for next sync.

### TDD Test Plan

| #   | Test                                             | Behavior          |
| --- | ------------------------------------------------ | ----------------- |
| 1   | `SandboxManager.create()` initializes a sandbox  | Session lifecycle |
| 2   | `SandboxManager.destroy()` cleans up the sandbox | Teardown          |
| 3   | `syncToSandbox()` uploads dirty files            | Change tracking   |
| 4   | Tool router sends `write_file` to host           | Host routing      |
| 5   | Tool router sends `bash` to sandbox              | Sandbox routing   |

---

## Milestone 3.5: Security Scanning Tool

**Goal:** Give the agent the ability to scan code for security vulnerabilities using the Gemini CLI Security Extension, with a native LLM-powered fallback.

### 3.5a. SecurityScanTool (`src/tools/security.ts`)

1. **Gemini CLI path** (preferred): Shell out to `gemini -x security:analyze` via sandbox.
2. **Native LLM fallback**: Use the agent's configured LLM with a security-focused prompt to analyze code diffs.
3. Accepts `target`: `"changes"` | `"file"` | `"deps"`, optional `path`.

### 3.5b. DepScanTool (`src/tools/depScan.ts`)

1. **OSV-Scanner**: Run `osv-scanner --json .` in sandbox, parse JSON results.
2. **Fallback**: Run `npm audit --json` if OSV-Scanner is not installed.

### 3.5c. Tool Registration

1. Add both tools to `CORE_TOOLS` in `tools/index.ts`.
2. Add `security_scan` and `dep_scan` to `SANDBOX_TOOLS` in `tools/router.ts`.
3. Add security scan stubs to `DeferredToolsDB` in `tools/registry.ts`.

### TDD Test Plan

| #   | Test                                                      | Behavior    |
| --- | --------------------------------------------------------- | ----------- |
| 1   | SecurityScanTool returns report when Gemini CLI available | Shell path  |
| 2   | SecurityScanTool falls back to LLM analysis               | Native path |
| 3   | DepScanTool parses OSV-Scanner JSON output                | Dep scan    |
| 4   | DepScanTool falls back to `npm audit`                     | Fallback    |
| 5   | ToolRouter routes both to sandbox                         | Routing     |

## Milestone 4: Harness Engineering & Middlewares

**Goal:** Make the agent resilient. Stop it from breaking itself.

1. **Middleware Pipeline Pattern**: Implement a generic pre/post execution hook system for tool calls.
2. **Build `LoopDetectionMiddleware`**: Track hashes or signatures of tool calls. Throw errors/warnings when duplicated explicitly.
3. **Build `SafeguardMiddleware`**: Prevent massive file reads.
4. **Build `PreCompletionMiddleware`**: Intercept task completion and require proof of verification (e.g. running tests).

## Milestone 5: Advanced Optimizations

**Goal:** Scale the agent for complex workspaces and heavy memory.

1. **Tool Lazy Loading**: Implement the "Tool Search" mechanism for dynamic capabilities.
2. **Context Compaction**: Implement Cache-Safe Forking. When tokens hit 80% capacity, summarize earlier messages, retaining the static prefix format.
3. **Reasoning Sandwich**: Implement dynamic logic routing. Allow the agent to use `high-reasoning` mode for planning, and drop to `medium-reasoning` for mechanical typing.

## Milestone 5.5: Browser, Web Search & Skills

**Goal:** Give the agent internet access, browser interaction, and extensible skill loading.

### 5.5a. Browser Tool (`agent-browser`)

- Wrap Vercel Labs' `agent-browser` CLI via sandbox shell calls
- Commands: `navigate`, `snapshot` (accessibility tree), `click`, `type`, `screenshot`, `scroll`
- Lazy-installed in dev, pre-baked in prod template

### 5.5b. Web Search Tool (`@valyu/ai-sdk`)

- AI-native search via Valyu API (runs on Host)
- Sources: web, papers (arXiv/PubMed), finance, patents, SEC filings, companies
- API key stored in config (`valyuApiKey`)

### 5.5c. Skills System

- Discovery paths: `./skills/`, `./.agents/skills/`, `~/.joone/skills/`, `~/.agents/skills/`
- SKILL.md format: YAML frontmatter (name, description) + markdown instructions
- Tools: `search_skills`, `load_skill` (injects into conversation as system-reminder)
- Project skills override user skills with same name

## Milestone 6: Tracing & Refinement

**Goal:** Monitor performance and improve via feedback.

1. **Integrate Tracing**: (LangSmith / LangFuse / OpenTelemetry) to track exact costs, cache hit rates, and execution paths.
2. **Trace Analyzer Subagent**: Build the offline script that reads failed traces and outputs summaries for human harness engineers.

## Milestone 7: Testing & Evaluations (TDD - Ongoing)

**Goal:** Ensure the context boundaries, middlewares, and tools function flawlessly before production. This milestone runs **in parallel** with all others via TDD.

1. ~~**Setup Vitest**~~
2. **Unit Testing (Red-Green-Refactor)**:
   - ~~`CacheOptimizedPromptBuilder` (5/5 GREEN)~~
   - `ConfigManager`: loadConfig, saveConfig, env fallback
   - `ModelFactory`: provider switching, error handling
   - `MiddlewarePipeline`: Loop detection, pre-completion interception
   - `SandboxLifecycleManager`: create/destroy lifecycle hooks
3. **E2E Evaluations (Evals)**:
   - Hook LangSmith datasets up to the `ExecutionHarness` to run regression tests against known code tasks.
   - Measure **Cache Hit Rate** assertions (e.g., Assert CacheHit > 90% over a 10-turn conversation).

---

## Milestone 15: Telemetry & Engine Bug Bash

**Goal:** Fix the production execution bugs restricting the agent's performance and accuracy.

1. **The Truncation/Tool Bug**: Refactor `modelFactory` and `index.ts` to ensure the core LLM instance actively binds to tools (`bindTools`) before the agent loop begins, stopping it from hallucinating raw XML `<tool_call>` blocks.
2. **The Cache Hit Bug**: Write provider-specific parsers to properly extract `cache_creation_input_tokens` and `cache_read_input_tokens` from Anthropic and Gemini payloads so the TUI reflects real usage.
3. **The Context Window Bug**: Decouple the TUI's token limit UI from the completion `maxTokens` configuration so it accurately reflects the 1M+ token limits of models like Gemini and Claude.

## Milestone 16: TUI v2, Event Tracking & Host Dependency Mgmt

**Goal:** Upgrade the TUI into a transparent, deeply integrated IDE layout and capture real-time actions.

1. **The Event System**: Refactor `ExecutionHarness` to implement an `EventEmitter` interface. Broadcast fine-grained `AgentEvent` objects to capture all real-time actions including File I/O (`read_file`/`write_file`), Script Execution (host & sandbox), Sub-agent spawning, and Web Browsing/Navigation.
2. **Host Dependency Management**: Create a new `install_host_dependencies` tool gated by HITL permission and secured by a strict package manager whitelist. This allows the agent to natively bootstrap and build applications purely on the host OS for the user (running `npm install`, etc.).
3. **2-Column Layout Redesign**: Rewrite `App.tsx` (using `ink`) from a simple chat scroll to a 2-column format.
4. **Live UI Workspaces**: Add a live File Browser tree to the right column, a real-time Agent Actions event log (powered by the event bus), and pinned Metrics panels for instantaneous token monitoring.

## Milestone 17: MCP Client Integration

**Goal:** Connect Joone directly to standard Model Context Protocol servers.

1. **Install `@modelcontextprotocol/sdk`**.
2. **Configuration Support**: Support configuring multiple MCP servers with execution commands or URLs in `config.json`.
3. **Dynamic MCP Tool Proxying**: Implement a bridge between the MCP standard and Langchain's `StructuredTool` interface so the agent can naturally route requests directly into the MCP connection layer.

## Milestone 18: TUI Stability & UX Polish

**Goal:** Resolve severe Terminal UI bugs (freezing, disappearing messages), improve the conversational UX, and fix timeout issues.

1. **Fixed Input & Scrollable Chat**: Refactor `App.tsx` using `ink`'s `<Static>` component or a strict flex-box layout. Research LangChain/Deep Agent native front-end streaming hooks to replace complex manual states.
2. **Infinite HITL Wait & State Management**: Remove timeouts on HITL waiting. Utilize LangGraph/Deep Agent's native "allowed decisions list" and interrupt nodes for rigorous and explicit human branching.
3. **Message Differentiation**: Overhaul `MessageBubble.tsx` with thin persona-colored gradient borders, explicit tags, and tailored padding.
4. **Persistent Event Nodes**: Emit critical agent events directly into the main conversation array as stylized `<Static>` nodes, while strictly ensuring they are filtered out of the API context payload to prevent token bloat.

## Milestone 19: Core Engine Alignment & Host-First Execution

**Goal:** Remove Sandbox-by-default initialization, inject rich workspace context, and refactor the core loop to standard LangChain primitives.

1. **Host-First Architecture & Native Sandboxing**: Disable automatic E2B startup. Set `executionMode: "host" | "sandbox"`. Route `bash` via the Host protected by strict command whitelisting. Use Deep Agent Sandbox Primitives to orchestrate fallback containers natively rather than bespoke wrappers.
2. **Context Injection**: Update the `<system-reminder>` to actively scan and inject `process.cwd()` and a directory tree on start/resume.
3. **LangChain Primitives Refactor**: Deprecate the bespoke `while(true)` custom tool-calling loop. Refactor completely to use LangGraph's native state graphs, interrupts, memory savers, and agent executables (Deep Agents) to guarantee predictable routing.

## Milestone 20: Tauri Cross-Platform Desktop Client

**Goal:** Migrate the agent into a modern, native GUI application using Tauri.

1. **Architecture Scaffold**: Initialize a Tauri workspace and structure the Rust/TS bridge.
2. **GUI Development**: Build a highly polished two-pane IDE interface using standard web technologies (React/Tailwind) rendering rich markdown and interactive tool-call accordions.
3. **System Integration**: Leverage Tauri native APIs for fast filesystem access and package binaries (`.msi`, `.dmg`, `.AppImage`) via GitHub Actions.
