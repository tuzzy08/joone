# System Architecture

## High-Level Architecture Overview

The system operates as a CLI-based REPL (Read-Eval-Print Loop) Agent Wrapper. The user runs `joone` in their project directory. The LLM is nested within an "Execution Harness" that mediates all inputs, actions, and memory. Responses are **streamed** token-by-token.

### Hybrid Sandbox Model

Joone inherently favors a **Host-First Architecture** combined with deep agent orchestrations:

- **File operations** (`write_file`, `read_file`) and native builds (`install_host_dependencies`, `bash`) default to running on the **host machine**, guarded by strict Whitelisting and CommandSanitizer middlewares.
- **Deep Agent Sandboxing** (`e2b`) is available explicitly via `executionMode: "sandbox"` for dangerous or unknown environments, orchestrated through generic LangChain sandbox primitives.
- A **File Sync** layer mirrors changed files from host → sandbox only when operating in strict sandbox mode.

```
┌─────────────────────────┐          ┌──────────────────────────┐
│     HOST MACHINE        │   sync   │      E2B SANDBOX         │
│                         │ ───────► │                          │
│  write_file ──► disk    │          │  /workspace/ (mirror)    │
│  read_file  ◄── disk    │          │                          │
│                         │          │  bash, npm test, scripts │
│  User sees changes      │          │  run here (isolated)     │
│  live in their IDE      │          │                          │
└─────────────────────────┘          └──────────────────────────┘
```

## System Diagram

```mermaid
graph TD
    Client["User CLI (joone)"] -->|Task Input| Config
    Config["Config Manager (~/.joone/config.json)"] -->|Provider + Key| Factory
    Factory[Model Factory] -->|BaseChatModel| MainLoop

    subgraph Agent Execution Harness (LangGraph)
        MainLoop[Deep Agent State Graph]
        State[Conversation State / Memory Saver]
        PromptBuilder[Cache-Oriented Prompt Builder]
        StreamHandler[LangChain UI Streaming Hooks]

        State --> PromptBuilder
        MainLoop --> PromptBuilder
        PromptBuilder --> LLM((LLM API))
        LLM -->|Streamed Chunks| StreamHandler
        StreamHandler -->|Graph Interruptions (HITL)| Middlewares
        StreamHandler -->|Text Tokens| Terminal[UI Event Render]
    end

    subgraph Middleware Pipeline
        Middlewares{Middleware Orchestrator}
        LoopDet[Loop Detection]
        PreComp[Pre-Completion Check]
        Guard[File Size Guardrails]

        Middlewares --> LoopDet
        Middlewares --> PreComp
        Middlewares --> Guard
    end

    subgraph "Tool Routing (Hybrid)"
        Middlewares -->|Approved Tool Call| Router{Tool Router}
        Router -->|"write_file, read_file"| HostFS["Host Filesystem (Node.js fs)"]
        Router -->|"bash, test, install"| Sync[File Sync Layer]
        Sync -->|Upload changed files| Sandbox["E2B MicroVM (Ubuntu)"]
        Sandbox -->|stdout/stderr| MainLoop
        HostFS -->|File content| MainLoop
    end
```

## Component Breakdown

1. **CLI & Config Layer** (`src/cli/`):
   - `index.ts`: Parses user commands (`joone`, `joone config`) via Commander.js.
   - `config.ts`: Reads/writes `~/.joone/config.json`. Stores provider, model, API key (plain text + `chmod 600`), streaming preference, and temperature.
   - `modelFactory.ts`: Factory that dynamically imports the correct LangChain provider package and returns a `BaseChatModel`. Supports 9+ providers.

2. **State Manager & Prompt Builder** (`src/core/promptBuilder.ts`):
   - Maintains the "Prefix Match". Compiles the static system prompt, appends project variables once, and exclusively appends subsequent messages.

3. **Execution Engine (LangGraph & Deep Agents)** (`src/core/agentLoop.ts`):
   - Refactored from a bespoke while-loop into an official LangGraph `StateGraph` and Agent Executor.
   - Utilizes Deep Agent primitives for tool binding and execution orchestration, routing transparently between tools, logic loops, and native interruptions.
   - The **Stream Handler** leans on LangChain's native frontend streaming hooks to power live UI updates without manual buffering.
   - Extracts precise provider `CacheMetrics` for the tracer.

4. **ContextGuard** (`src/core/contextGuard.ts`):
   - Proactively checks token payload size _before_ querying the API.
   - Decouples UI Context Limits from config generation limits using `getProviderContextLimit` (e.g. tracking against 1M tokens for Gemini rather than 4096 output tokens).
   - Auto-triggers LLM compaction at 80%, with a 95% Emergency Truncation fallback to prevent OOM process deaths.

5. **Middleware Orchestrator** (`src/middleware/`):
   - Implements the Observer pattern over the `on_tool_call` and `on_submit` events.
   - Operates on a structured `ToolResult` interface (`{ content, metadata, isError }`) to robustly pass execution metadata (like process exit codes) through the pipeline without brittle string parsing.
   - Can _intercept_ or _modify_ a tool request before it hits the tools.
   - Can _inject_ `<system-reminder>` messages back to the Execution Engine.

6. **Tool Router & Hybrid Execution**:
   - **Host tools** (`write_file`, `read_file`): Execute directly on the host via Node.js `fs`. Changes appear instantly in the user's IDE.
   - **Sandbox tools** (`bash`, `run_tests`, `install_deps`): Route through the File Sync layer → E2B sandbox.
   - The split is determined by tool type, not configuration.

7. **File Sync Layer** (`src/sandbox/sync.ts`):
   - Tracks which files have changed on the host since the last sandbox sync.
   - Before each sandbox execution, uploads only the changed files to the sandbox's `/workspace/` directory.
   - Strategies: **upload-on-execute** (default) or **watch & mirror** (future).

8. **E2B Sandbox** (`src/sandbox/`):
   - Each agent session initializes an E2B cloud sandbox via the `e2b` TypeScript SDK.
   - All bash commands and code execution run via `sandbox.commands.run()`.
   - The sandbox is destroyed on session end or timeout.
   - The host machine is **never** exposed to agent-executed commands.

## Tool Routing Table

| Tool                   | Runs On     | Why                                       |
| ---------------------- | ----------- | ----------------------------------------- |
| `write_file`           | **Host**    | User sees changes in IDE instantly        |
| `read_file`            | **Host**    | Reads the real project files              |
| `run_bash_command`     | **Sandbox** | Protects host from destructive commands   |
| `run_tests`            | **Sandbox** | Tests may have side-effects               |
| `install_dependencies` | **Sandbox** | npm install can execute arbitrary scripts |
| `search_tools`         | **Host**    | Registry lookup, no execution             |

## Supported LLM Providers

| Provider       | Package                   | Dynamic Import             |
| -------------- | ------------------------- | -------------------------- |
| Anthropic      | `@langchain/anthropic`    | `ChatAnthropic`            |
| OpenAI         | `@langchain/openai`       | `ChatOpenAI`               |
| Google         | `@langchain/google-genai` | `ChatGoogleGenerativeAI`   |
| Mistral        | `@langchain/mistralai`    | `ChatMistralAI`            |
| Groq           | `@langchain/groq`         | `ChatGroq`                 |
| DeepSeek       | OpenAI-compatible         | `ChatOpenAI` with base URL |
| Fireworks      | `@langchain/community`    | `ChatFireworks`            |
| Together AI    | `@langchain/community`    | `ChatTogetherAI`           |
| Ollama (Local) | `@langchain/ollama`       | `ChatOllama`               |

## Security Roadmap

| Tier | Method                     | Status               |
| ---- | -------------------------- | -------------------- |
| 1    | Plain config + `chmod 600` | **Active (Default)** |
| 2    | OS Keychain (`keytar`)     | Planned              |
| 3    | AES-256 encrypted config   | Planned              |
