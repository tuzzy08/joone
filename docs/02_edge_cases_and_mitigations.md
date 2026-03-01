# Edge Cases & Mitigations

When building a coding agent with Prompt Caching + Middlewares, these are the primary edge cases to design around:

## 1. Prompt Caching Edge Cases (Cost & Latency Traps)

- **The "Leaky Timestamp" Cache Breaker:**
  - _The Edge Case:_ If you inject dynamic data (like the current time, memory usage, or random UUIDs) into your Base System Prompt, you will achieve a **0% cache hit rate**. The cache relies on exact prefix matching.
  - _Mitigation:_ Put all static, immutable instructions at the top. Any dynamic state must be injected via a `<system-reminder>` inside the _Messages_ array (which sits at the end of the context).
- **The Mid-Session Model Switch:**
  - _The Edge Case:_ Switching models mid-thread (e.g., cheap model for summarizing, smart model for coding) means the new model has an empty cache and must re-process the entire prompt prefix from scratch.
  - _Mitigation:_ Avoid swapping models in the same thread. Span a "Sub-agent" thread and only pass minimum necessary context.
- **Context Window Compaction (Amnesia):**
  - _The Edge Case:_ Summarizing a long conversation and starting a new prompt causes you to lose your cached prefix AND the agent forgets specific constraints.
  - _Mitigation:_ Implement **Cache-Safe Forking**. Keep the exact same System Prompt and Tool definitions. Start a new thread by passing the summary of the previous history as the first few messages, followed by the new task.

## 2. Harness & Middleware Edge Cases (Logic Traps)

- **The "Massive File" Blunder:**
  - _The Edge Case:_ The agent reads a 10,000-line minified file. This floods the context window, pushes out important instructions, and ruins the session cache.
  - _Mitigation:_ Harness-level Guardrails. Restrict `read_file` to return chunks or force the agent to use `grep_search` / `view_file_outline`.
- **The "Blind Retry" Doom Loop:**
  - _The Edge Case:_ The agent misses a space in a search-and-replace, fails, and tries the exact same edit endlessly.
  - _Mitigation:_ Use `LoopDetectionMiddleware`. If the agent emits identical tool calls 3 times, intercept and inject: _"You have failed this 3 times. Stop trying this approach."_
- **The "Fake Success" Verification:**
  - _The Edge Case:_ The agent runs tests, they fail, but the agent hallucinates that the failure is acceptable and marks the task as Done.
  - _Mitigation:_ The harness must parse terminal exit codes. If `pytest` returns `1`, the harness programmatically blocks the agent from exiting until tests pass.
- **Tool Schema Amnesia (with Lazy Loading):**
  - _The Edge Case:_ An agent loads a complex tool lazily, uses it once, and then later forgets how to format its JSON schema.
  - _Mitigation:_ If a tool is "discovered", it must remain in the "Messages" context as a system reminder so the schema is preserved.
- **The "Ghost Tool Call" (Context Desync):**
  - _The Edge Case:_ A model emits a tool call but occasionally forgets to attach a internal `tool_call_id` (this breaks the strict `AIMessage[tool_calls] -> ToolMessage[tool_call_id]` sequencing rules required by modern LangChain/Anthropic/OpenAI APIs). If you forge a fake ID or cast it as a string, the LLM rejects the context on the next turn.
  - _Mitigation:_ The "Soft Fail" approach. Intercept the malformed tool call in the `ExecutionHarness`. Do not execute the tool and do not emit a `ToolMessage`. Instead, emit a corrective `HumanMessage` stating: _"You attempted to call tool X, but didn't provide a tool_call_id. Please try again."_ This prevents context poisoning.
