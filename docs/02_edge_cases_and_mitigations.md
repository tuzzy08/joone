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
- **The "Hook Signature Drift" Crash (Deep Agents Middleware):**
  - _The Edge Case:_ During SDK migrations, a custom middleware is written against the wrong hook contract, e.g. treating `beforeAgent` like `(request, handler)` instead of `(state, runtime)`. On the first user turn this can explode while reading custom state like `globalSystemInstructions`.
  - _Mitigation:_ Match each hook to the documented Deep Agents/LangChain signature exactly. Use `beforeAgent` only for state patches, and use `wrapModelCall` when you need to modify `request.systemMessage` or inspect `request.state` before the model call. Add a first-turn regression test for any custom middleware that injects system context.
- **The "Fake Lazy Load" Startup Stall:**
  - _The Edge Case:_ A CLI entrypoint moves some imports to `import()` calls but still statically imports heavyweight modules like model factories or provider managers at top-level, or still awaits full runtime construction before first render. Users experience multi-second or multi-minute startup even though the code looks "lazy".
  - _Mitigation:_ Keep the entry module lightweight, dynamically import heavyweight runtime modules only inside the command path that needs them, and defer expensive agent/model/sandbox construction until after the UI is mounted or the first task actually needs it. Protect the entrypoint with a regression test that forbids eager heavyweight imports.
- **The "Dev Reconciler in Production" Perf Leak:**
  - _The Edge Case:_ A packaged Ink CLI starts without `NODE_ENV=production`, so React loads the development reconciler. On long-lived sessions or render-heavy paths this can flood Node's global `perf_hooks` buffer with `performance.measure` entries, trigger `MaxPerformanceEntryBufferExceededWarning`, and slow startup noticeably.
  - _Mitigation:_ Default the CLI runtime to `NODE_ENV=production` before importing Ink/React, keep the initial UI module free of heavyweight runtime imports, and let the outer CLI own process shutdown so React/Ink can tear down cleanly.

## 3. Security & Execution Edge Cases (Tool Exploits)

- **Command Injection via Malicious Interpolation:**
  - _The Edge Case:_ Passing user-provided arguments directly into shell commands (e.g., `agent-browser --url "${args.url}"` or `gemini --file "${args.path}"`) allows attackers to escape quotes and execute arbitrary commands in the sandbox (e.g., `url = '"; cat /etc/passwd; "'`).
  - _Mitigation:_ Use strict Bash parameter escaping. All dynamic strings passed to shell commands are wrapped in single quotes, and any internal single quotes are escaped (`'\\''`).
- **Host Filesystem Path Traversal (The "Escaped Workspace" Vulnerability):**
  - _The Edge Case:_ Because `read_file` and `write_file` execute on the host machine to support live IDE syncing, a malicious prompt could instruct the agent to write to `~/.bashrc`, `C:\Windows\System32`, or `/.ssh/id_rsa`, compromising the user's host machine.
  - _Mitigation:_ Implement strict Workspace Jail boundaries. Before any host I/O operation, the resolved path is evaluated against `process.cwd()`. If the path attempts to escape the root workspace, the tool immediately rejects the call returning a permissions error.
- **Arbitrary Code Execution via Host Dependencies:**
  - _The Edge Case:_ The `install_host_dependencies` runs direct commands on the user's machine (bypassing the sandbox) to globally scaffold projects. A malicious prompt could trick it into running `npm install express && rm -rf /` or executing unknown dangerous binaries.
  - _Mitigation:_ The tool is strictly firewalled in two ways: (1) it defaults to asking for Human-in-the-Loop permission (via the `DANGEROUS_TOOLS` registry), and (2) it programmatically checks the target executable and subcommand against a hardcoded whitelist (e.g., `npm install`, `pip install`) while immediately failing if dangerous shell operators (`&`, `|`, `;`, `` ` ``, `$`) are detected.
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

## 5. Error Recovery & Retry Edge Cases

- **Transient LLM API Failure (429/5xx):**
  - _The Edge Case:_ The LLM provider returns a rate-limit (429) or server error (500/502/503) mid-turn, crashing the entire session.
  - _Mitigation:_ `retryWithBackoff()` wraps all LLM calls with exponential backoff (1s→2s→4s + jitter). Only `JooneError` instances with `retryable === true` trigger retries; auth failures (401/403) propagate immediately.
- **Exhausted Retries (Self-Recovery):**
  - _The Edge Case:_ After 3 retry attempts, the LLM API is still down. The session crashes and the user loses all progress.
  - _Mitigation:_ Instead of crashing, `ExecutionHarness` injects the error's `toRecoveryHint()` as a `SystemMessage` into the conversation, returning a synthetic `AIMessage`. The agent can observe the error context and adapt (e.g., wait, simplify, or ask the user).
- **Unclassified Provider Errors:**
  - _The Edge Case:_ A new LLM provider throws a non-standard error with no HTTP status code, bypassing the retry classification.
  - _Mitigation:_ `wrapLLMError()` inspects `.status`, `.statusCode`, `.code`, and `.response.status` on raw errors, covering the common patterns of LangChain, Axios, and native `fetch` errors.

## 6. Human-in-the-Loop Edge Cases

- **Permission Timeout (User Away):**
  - _The Edge Case:_ The agent calls a dangerous tool (`bash`, `write_file`) while the user is away from the terminal. The agent blocks indefinitely waiting for permission.
  - _Mitigation:_ `HITLBridge.requestPermission()` has a configurable timeout (default 5 minutes) that auto-denies and returns a short-circuit string, letting the agent try an alternative.
- **Ask Question Timeout:**
  - _The Edge Case:_ The agent asks the user a clarifying question via `ask_user_question`, but the user doesn't respond.
  - _Mitigation:_ `HITLBridge.askUser()` resolves with `"[No response]"` after timeout, so the agent can proceed with a default assumption.
- **Permission Mode Misconfiguration:**
  - _The Edge Case:_ The user sets `"permissionMode": "ask_all"` and then every tool call — including harmless reads — triggers a prompt, making the agent unusable.
  - _Mitigation:_ `PermissionMiddleware` maintains a hardcoded `SAFE_TOOLS` whitelist (`read_file`, `search_skills`, `ask_user_question`, etc.) that bypasses approval even in `ask_all` mode.

## 7. Skills Sync Edge Cases

- **Missing User Skills Directory:**
  - _The Edge Case:_ `~/.joone/skills/` doesn't exist on the user's machine. The sync crashes trying to walk a nonexistent path.
  - _Mitigation:_ `syncSkillsToSandbox()` checks `fs.existsSync()` before walking each skill directory and silently skips missing paths.
- **Skill Name Collision (Project vs. User):**
  - _The Edge Case:_ A user-level skill and a project-level skill have the same name. Both get synced to the sandbox, creating confusion.
  - _Mitigation:_ `SkillLoader.discoverSkills()` deduplicates by name with project-level priority. `syncSkillsToSandbox()` only uploads `source: "user"` skills since project-level skills are already inside `projectRoot`.

## 8. Slash Command Edge Cases (M11)

- **Command Typos & Frustration:**
  - _The Edge Case:_ User types `/modle` instead of `/model` and the agent treats it as a prompt, wasting LLM tokens and failing to switch the model.
  - _Mitigation:_ Levenshtein distance check in `CommandRegistry`. If an unknown command is `< 3` edits away from a known command, the TUI intercepts it and suggests the correct command without calling the LLM.
- **State Mutation While Processing:**
  - _The Edge Case:_ User runs `/exit` or `/clear` while the agent is midway through generating a sequence of ToolCalls.
  - _Mitigation:_ App-level UI blocks input while `isProcessing === true`. The commands are disabled.
- **Model Switch to Non-Existent Model:**
  - _The Edge Case:_ User runs `/model nonexistent`.
  - _Mitigation:_ The command validates the model string against `ConfigManager`'s available models and securely rejects it before updating internal state.

## 9. LLM-Powered Compaction Edge Cases (M12)

- **Compaction Data Loss (Amnesia 2.0):**
  - _The Edge Case:_ The LLM summarizes a 50-turn conversation but drops explicit file paths or tool choices, leaving the main agent blind when resuming.
  - _Mitigation:_ The built-in Compact Prompt explicitly mandates a structured format: `Files Modified`, `Decisions Made`, `Tools Used`. A handoff prompt (`[CONTEXT HANDOFF]`) is injected into the bottom of the history to glue the summary back to the agent's persona.
- **Double Compaction Fidelity Loss:**
  - _The Edge Case:_ A session exists so long it must be compacted twice. A "summary of a summary" loses critical resolution.
  - _Mitigation:_ `ConversationCompactor` detects prior summaries and includes them entirely in the eviction block, prompting the LLM to unify the old summary with the new evicted messages.

## 10. Sub-Agent Orchestration Edge Cases (M13)

- **The Sub-Agent Recursion Bomb:**
  - _The Edge Case:_ A sub-agent uses the `spawn_agent` tool to spawn another sub-agent, creating an infinite nesting loop.
  - _Mitigation:_ Hardcoded Depth-1 limit. Pre-configured sub-agents in `AgentRegistry` never include `spawn_agent` or `check_agent` in their allowed toolsets.
- **Async Resource Contention:**
  - _The Edge Case:_ The main agent loops over a directory and spawns 50 async `test_runner` agents concurrently.
  - _Mitigation:_ `SubAgentManager` maintains a hard cap of 3 concurrent async tasks. Further spawn requests are queued or rejected with a backpressure error tool response.
- **Stale Files in Sandbox:**
  - _The Edge Case:_ The main agent edits a file on the host, then immediately spawns a `bash` sub-agent. The sub-agent runs in the sandbox before the new host file is synced.
  - _Mitigation:_ The `SubAgentManager` shares the main harness's `FileSync` instance and always forces a `syncToSandbox()` pass _before_ the sub-agent takes its first step.

## 11. Stability & Reliability Edge Cases (M14)

- **Context Window Overflows (Instant Death):**
  - _The Edge Case:_ Despite compaction thresholds, a single `read_file` returns 120k tokens string, instantly blowing past the 100% capacity mark. Compaction fails because the context is already overflowing.
  - _Mitigation:_ `ContextGuard` has a 95% "Emergency Truncation" threshold. Before hitting the API, if tokens > 95%, it _bypasses_ LLM compaction and brutally slices all but the last 4 messages, inserting a loud warning message directly into the stream, guaranteeing survival.

## 12. Telemetry & Engine Edge Cases (M15)

- **The "Lobotomized Model" Truncation (`bindTools` missing):**
  - _The Edge Case:_ An LLM instance is created but `.bindTools(tools)` isn't explicitly chained onto it. The LLM attempts to emit XML-style raw tool payloads into standard text output, which causes downstream stream parsers or APIs to truncate unexpectedly.
  - _Mitigation:_ The `ExecutionHarness` constructor conditionally checks for the `.bindTools` method on the incoming model and natively binds the tools to the active runnable before processing the first step.
- **Provider Cache Metric Inconsistencies:**
  - _The Edge Case:_ Trying to track Cache Hit Rates across models fails because Anthropic nests metadata as `cache_creation_input_tokens`, while Google uses `cachedContentTokenCount`. Standardizing into a generic `usage` payload results in a 0% tracker.
  - _Mitigation:_ Implement a specialized `extractCacheMetrics()` utility to safely introspect the `response_metadata` of the `AIMessage` by checking the exact `provider` string before extracting metrics.
- **Misaligned Context vs. Completion Thresholds:**
  - _The Edge Case:_ A user sets `maxTokens: 4096` in their config to cap generation output. The `ContextGuard` historically reads this and tries to auto-compact the session once the overall context hits 3,200 (80%), causing an immediate loop of aggressive compactions even though the model supports 200k+ tokens.
  - _Mitigation:_ Decouple TUI Context Monitors and `ContextGuard` boundaries from config generation limits. Implement a mapping function (`getProviderContextLimit()`) that dynamically returns the true capability of the model (1M for Gemini, 200k for Claude) as the guard boundary.

- **Process Death Serialization Tearing:**
  - _The Edge Case:_ The `AutoSave` triggers at the exact millisecond the user presses `Ctrl+C`. The Node process terminates while `fs.writeFileSync` is mid-chunk, corrupting the JSONL session file irreversibly.
  - _Mitigation:_ Atomic saves. `SessionStore.saveSession()` writes to an intermediate staging stream. On `process.on('SIGINT')`, a synchronous `forceSave()` is fired to cleanly flush state _before_ `process.exit(0)`.
