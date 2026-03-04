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
  - _The Edge Case:_ The agent runs tests, they fail, but the agent hallucinates that the failure is acceptable and marks the task as Done. Older approaches relied on fragile string parsing (e.g., matching "failed" in output), which could easily be bypassed or confused by test output.
  - _Mitigation:_ The harness must programmatically parse terminal exit codes. By explicitly surfacing structured tool metadata (e.g., `ToolResult.metadata.exitCode`) from execution sandboxes, the `PreCompletionMiddleware` reliably blocks the agent from exiting if tests don't pass (`exitCode !== 0`).
- **Tool Schema Amnesia (with Lazy Loading):**
  - _The Edge Case:_ An agent loads a complex tool lazily, uses it once, and then later forgets how to format its JSON schema.
  - _Mitigation:_ If a tool is "discovered", it must remain in the "Messages" context as a system reminder so the schema is preserved.
- **The "Ghost Tool Call" (Context Desync):**
  - _The Edge Case:_ A model emits a tool call but occasionally forgets to attach a internal `tool_call_id` (this breaks the strict `AIMessage[tool_calls] -> ToolMessage[tool_call_id]` sequencing rules required by modern LangChain/Anthropic/OpenAI APIs). If you forge a fake ID or cast it as a string, the LLM rejects the context on the next turn.
  - _Mitigation:_ The "Soft Fail" approach. Intercept the malformed tool call in the `ExecutionHarness`. Do not execute the tool and do not emit a `ToolMessage`. Instead, emit a corrective `HumanMessage` stating: _"You attempted to call tool X, but didn't provide a tool_call_id. Please try again."_ This prevents context poisoning.

## 3. Security & Execution Edge Cases (Tool Exploits)

- **Command Injection via Malicious Interpolation:**
  - _The Edge Case:_ Passing user-provided arguments directly into shell commands (e.g., `agent-browser --url "${args.url}"` or `gemini --file "${args.path}"`) allows attackers to escape quotes and execute arbitrary commands in the sandbox (e.g., `url = '"; cat /etc/passwd; "'`).
  - _Mitigation:_ Use strict Bash parameter escaping. All dynamic strings passed to shell commands are wrapped in single quotes, and any internal single quotes are escaped (`'\\''`).
- **Host Filesystem Path Traversal (The "Escaped Workspace" Vulnerability):**
  - _The Edge Case:_ Because `read_file` and `write_file` execute on the host machine to support live IDE syncing, a malicious prompt could instruct the agent to write to `~/.bashrc`, `C:\Windows\System32`, or `/.ssh/id_rsa`, compromising the user's host machine.
  - _Mitigation:_ Implement strict Workspace Jail boundaries. Before any host I/O operation, the resolved path is evaluated against `process.cwd()`. If the path attempts to escape the root workspace, the tool immediately rejects the call returning a permissions error.
- **Silently Swallowed CLI Errors:**
  - _The Edge Case:_ A CLI tool (like OSV-Scanner) crashes due to a configuration error (exit code > 1) and prints an error to `stderr`. If the orchestration layer only checks for `stdout` and swallows non-zero exit codes silently falling back to another tool, the critical error trace is lost.
  - _Mitigation:_ Enforce strict exit code verification (e.g., `exitCode === 1` means vulnerabilities found) and emit clear warnings with the full `stderr` trace before attempting any fallback strategies.
- **The "Over-Eager Doom Loop" Reporter:**
  - _The Edge Case:_ When detecting a doom loop (calling the same tool with identical args continuously), firing an alert during the active iteration causes redundant, spammy issue reports (e.g., reporting loop counts 3, 4, and 5 as separate critical issues).
  - _Mitigation:_ Track the loop state continuously but defer pushing the `AnalysisIssue` to the report array until the loop is visibly broken by a differing action, or the trace ends.
- **The "Parallel Tool Expansion" Bug (TUI Memory Corruption):**
  - _The Edge Case:_ In a Terminal UI rendering loop, executing an array of tool calls _inside_ the UI rendering iteration causes the generated `ToolMessage` array to be appended to the conversation history $N$ times (for $N$ tools), massively inflating context usage with duplicated data.

## 4. Persistent Session Edge Cases (State Management)

- **File System Drift (Host Desync):**
  - _The Edge Case:_ The agent edits a file, the session is paused. A human edits the file externally before the session is resumed. The agent resumes, unaware of the external edits, and attempts a line-based replacement that corrupts the file.
  - _Mitigation:_ `SessionResumer` explicitly logs `mtime` file stats. Upon resumption, it flags recently modified workspace files and injects a "Wakeup Prompt" forcing the LLM to diff or re-read the file before acting.
- **Sandbox Ephemerality (The Amnesia Problem):**
  - _The Edge Case:_ A session running a background Express server in a cloud sandbox on Friday is resumed on Monday. The cloud provider killed the idle VM. The new VM lacks the running server, but the LLM’s context history believes it is still running.
  - _Mitigation:_ Sandboxes are treated strictly statelessly. Upon string resumption, the agent is injected with a system message that the sandbox was recycled and it must manually restart required daemons/dev-servers.
- **"Mid-Breath" Interruption State (Corrupt Serialization):**
  - _The Edge Case:_ A forced exit (`SIGINT`/Power Loss) occurs exactly while the agent stream is halfway through emitting a JSON tool call chunk, serializing a broken `AIMessage` into history.
  - _Mitigation:_ The `SessionStore` must only trigger a `saveSession()` at strict execution boundaries (e.g. after a complete LLM generation cycle or successfully parsed CLI execution), guaranteeing invalid mid-stream JSON chunks never touch the disk.
- **Context Overflow (The Infinite Chat Log):**
  - _The Edge Case:_ A persistent session spanning weeks scales the context past 200k tokens, hitting API limits and exponentially inflating the per-turn token costs.
  - _Mitigation:_ Compaction is forced _before_ disk serialization. The session stringizes and compresses turns older than $N$ iterations into a dense system summary block before writing to `.jsonl`.
- **Provider/Model Switching Mid-Task:**
  - _The Edge Case:_ Starting a complex reasoning loop with Opus, pausing, and resuming with a lightweight local model like Llama 3 8B. The history is filled with complex schema usages that confused the smaller model.
  - _Mitigation:_ Serialize the `.jsonl` lines with `provider/model` metadata blocks. Upon resumption, the CLI explicitly warns if a provider downgrade is detected.
