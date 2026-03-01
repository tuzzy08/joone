# Product Requirements Document (PRD)

## 1. Product Overview

**Joone** is a CLI-based autonomous coding agent that leverages **Prompt Caching** and **Harness Engineering** to achieve high autonomy and robustness in complex coding tasks while minimizing token cost and latency. It executes all generated code inside **E2B sandboxed microVMs**, isolating the host machine from any destructive operations.

## 2. Target Audience

- Software Engineers looking for an autonomous pair-programmer.
- DevOps engineers looking to automate script fixes and verifications.
- AI Researchers running benchmarks (e.g., Terminal Bench 2.0).

## 3. Core Features

### 3.1. CLI Interface & Provider Selection

- **Installable CLI**: Packaged as an npm global binary (`npx joone` or `npm i -g joone`).
- **Provider/Model Selection**: On first run (or via `joone config`), the user interactively selects their LLM provider and model. Stored at `~/.joone/config.json`.
- **Supported Providers**: Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, Fireworks, Together AI, Ollama (local).
- **Dynamic Provider Loading**: Provider packages are loaded on demand. If a package isn't installed, the CLI prints a helpful install command.
- **Streaming Output**: Token-by-token streaming enabled by default for all providers. Tool calls are buffered until complete before execution.

### 3.2. API Key Security (Tiered)

- **Tier 1 (Default)**: API keys stored in `~/.joone/config.json` with restrictive file permissions (`chmod 600`). Masked input during `joone config`.
- **Tier 2 (Planned)**: OS Keychain integration (Windows Credential Manager / macOS Keychain) via `keytar`.
- **Tier 3 (Planned)**: AES-256 encrypted config file with machine-derived key.
- During onboarding, the user will eventually be able to choose their preferred security tier.

### 3.3. Cache-Optimized Context Engine

- **Strict Prefix Ordering**: Separates static system instructions, tool definitions, project memory, and conversation history to align with LLM `cache_control` behaviors.
- **`<system-reminder>` Injection**: Updates agent state natively via standard messages rather than system prompt overwrites, preserving the cache.
- **Cache-Safe Compaction**: Forks and summarizes contexts seamlessly without full cache eviction.

### 3.4. Hybrid Sandbox Execution

- **Architecture**: The agent uses a **Hybrid** model — file operations (`write_file`, `read_file`) run on the **host machine** so the user sees changes live in their IDE, while all **code execution** (`bash`, tests, scripts) runs inside an [E2B](https://e2b.dev) cloud microVM sandbox.
- **File Sync Mechanism**: Before each sandbox execution, changed files are synced from host → sandbox.
  - _Tracking:_ Modifications are tracked via a "dirty paths" memory array. The `write_file` host tool explicitly marks paths as dirty upon successful write.
  - _Concurrency:_ Concurrent modifications are prevented by the `ExecutionHarness`, which executes agent tool calls sequentially and blocks the LLM loop until file I/O and sandbox syncs are fully complete.
  - _Conflict Resolution:_ The Host machine is the absolute source of truth. The sandbox filesystem is ephemeral and overwritten by the Host's dirty files before any command runs. Modifications made manually in the sandbox bypass the host and are lost upon destroy.
- **Security**: The host machine is never exposed to agent-executed commands. Only file read/write touches the host.

### 3.5. Middleware Harness

- **Loop Detection (Anti-Doom Loop)**: Tracks agent action duplication and injects corrective context to break the loop.
- **Pre-Completion Checklist**: Intercepts task submission to force a self-verification/testing phase.
- **Guardrails for Scale**: Prevents loading oversized files (>1MB) entirely into memory; enforces chunked reads.

### 3.6. Lazy & Interoperable Tooling

- **Immutable Tool Definition**: Prevents mid-session tool swapping to preserve cache.
- **Tool Search**: Implements "stub" tools, allowing dynamic loading of complex tools only when actively requested.

### 3.7. Trace Analytics (V2)

- Logs reasoning loops and tool execution traces to analyze points of failure.
- Trace analyzer sub-agent that periodically reviews failures to suggest harness improvements.

## 4. Non-Functional Requirements

- **Latency**: High cache hit rates (>80% for long sessions) leading to sub-second Time-To-First-Token.
- **Cost**: Minimize redundant prefix token generation.
- **Extensibility**: Middleware pipeline should make it trivial to add new guardrails.
- **Development Process**: Strict Red-Green-Refactor TDD for all new features.
