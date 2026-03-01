# Initial Implementation Plan

## Phase 1: Context Engine & Caching Layer

Build a structured Prompt Builder that strictly enforces the Prefix Matching patterns so every task in a session enjoys a >90% cache hit rate.

```mermaid
graph TD
    A[Base System Prompt] -->|Static Prefix| B
    B[Tool Schemas] -->|Static Prefix| C
    C[Project Memory e.g., README] -->|Project Prefix| D
    D[Session Context e.g., OS Info] -->|Session Prefix| E
    E[Conversation History] -->|Dynamic Appends| F[New User/Tool Message]

    style A fill:#1e4620,stroke:#2b662e,color:#fff
    style B fill:#1e4620,stroke:#2b662e,color:#fff
    style C fill:#1e4620,stroke:#2b662e,color:#fff
    style D fill:#2b465e,stroke:#3b6282,color:#fff
    style E fill:#4a3219,stroke:#664422,color:#fff

    subgraph Fully Cached Prefix
    A
    B
    C
    end
```

## Phase 2: Interoperable Tooling & Lazy Loading

Implement tools as immutable objects for the session. Implement "Plan Mode" to alter agent rules without unloading tool schemas.

- Define core tools: `read_file`, `write_file`, `bash_command`.
- Implement dummy/stub tools for complex integrations.
- Implement "Cache-Safe Forking" for compaction.

## Phase 3: The Middleware Harness

Implement pre-completion checks and loop detection via a middleware pipeline.

```mermaid
sequenceDiagram
    participant Agent as LLM Agent
    participant Harness as Execution Harness
    participant Middle as Middleware Pipeline
    participant Env as Environment (Bash/FS)

    Agent->>Harness: Request: Edit target_file.py
    Harness->>Middle: Emit: 'pre_tool_call'
    Middle-->>Harness: Check LoopDetection (Fail if > 4 tries)
    Harness->>Env: Execute Edit
    Env-->>Harness: Return File Diff
    Harness->>Agent: Send Tool Result

    Agent->>Harness: Request: Submit/Exit
    Harness->>Middle: Emit: 'pre_submit'
    Middle->>Harness: Inject 'PreCompletionChecklist' (Wait, did you run tests?)
    Harness->>Agent: System Reminder: "Please run tests to verify."
    Agent->>Harness: Request: Run `pytest`
```

## Phase 4: Tracing & Feedback Loop

Build an automated pipeline that sends JSON traces of failed agent runs into an evaluation database.

- Hook LLM API calls to save traces.
- Implement `TraceAnalyzer` subagent to review failures.
