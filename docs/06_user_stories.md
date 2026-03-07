# User Stories

This document contains the foundational user stories for the Joone agent, organized by Epic. It does not include exhaustive acceptance criteria, but rather serves as a high-level requirements tracker for the core features.

## Epic 1: CLI & Configuration

- **US 1.1**: As a user, I want to install joone globally via `npm i -g joone` and run it with `joone` in any project directory.
- **US 1.2**: As a user, I want to select my preferred LLM provider and model on first run or via `joone config`, choosing from at least 9 providers (Anthropic, OpenAI, Google, Mistral, Groq, DeepSeek, Fireworks, Together AI, Ollama).
- **US 1.3**: As a user, I want my API key collected via masked interactive input during `joone config`, so I never have to manually create `.env` files.
- **US 1.4**: As a user, I want my preferences stored at `~/.joone/config.json` with restrictive file permissions, so I don't re-enter them every session.
- **US 1.5**: As a user, I want the CLI to tell me which provider package to install if it's missing (e.g., `Run: npm install @langchain/groq`).
- **US 1.6** _(Planned)_: As a security-conscious user, I want to choose during onboarding whether to store my API key in a plain config file, OS Keychain, or encrypted config.

## Epic 2: Streaming & Output

- **US 2.1**: As a user, I want to see the agent's response stream token-by-token in my terminal, not wait for the entire response to finish.
- **US 2.2**: As the system, I want to buffer tool call JSON during streaming until the full call is received, then execute it.
- **US 2.3**: As a user, I want the option to disable streaming via `joone config` or a CLI flag (`--no-stream`).

## Epic 3: The Context & Prompt Layer

- **US 3.1**: As a developer, I want the system prompt to be strictly divided into static and dynamic sections, so that I maximize prompt caching and reduce costs.
- **US 3.2**: As the system, I need to inject state updates (like time or file changes) into the conversation history as simulated messages (`<system-reminder>`), so I avoid invalidating the static prefix cache.
- **US 3.3**: As the system, when the context window reaches 90% capacity, I want to execute a cache-safe compaction that summarizes early history while keeping the system prompt matching the parent thread.

## Epic 4: Hybrid Sandbox Execution

- **US 4.1**: As a user, I want `write_file` and `read_file` to operate on my host filesystem, so I can see the agent's code changes in my IDE in real-time.
- **US 4.4**: As the system, I want to create a new E2B sandbox at the start of each agent session and destroy it when the session ends or times out, so that each session has a clean isolated environment and resources are properly released.
- **US 4.5**: As a developer, I want the tool router to automatically determine whether a tool runs on the host or in the sandbox based on tool type.

## Epic 5: Tooling & Lazy Loading

- **US 5.1**: As an agent, I want access to core tools (`read_file`, `write_file`, `run_bash_command`) defined statically at the beginning of the session.
- **US 5.2**: As an agent, I want to use a "Search Tools" endpoint to learn about complex or specific tools, rather than having all 50+ tool schemas loaded simultaneously into my context window.
- **US 5.3**: As a developer, I want guardrails on `read_file` so the agent cannot accidentally load a 10MB file into the context window and blind itself.

## Epic 6: Middleware Guards & Execution Loops

- **US 6.1**: As a developer, I want a `LoopDetectionMiddleware` that counts how many consecutive times an agent has failed a specific action.
- **US 6.2**: As an agent stuck in a loop, I want the system to interrupt me and tell me to reconsider my approach, so I don't waste tokens repeating a failure.
- **US 6.3**: As an agent trying to finish a task, I want a `PreCompletionMiddleware` to ask me if I have run tests. If I haven't, it should block completion and ask me to run verifications.
- **US 6.4**: As the system, I want to parse test exit codes; if a test fails (`exit 1`), I want to block the agent from declaring the task "Done" unless a max retry limit is reached.

- **US 7.1**: As an operator, I want every agent decision, tool call, and token metric logged to a standard trace format so I can monitor cache hit rates.
- **US 7.2**: As an operator, I want a script that can read failed traces and use an LLM to automatically summarize _why_ the agent failed tasks, allowing me to refine the harness.

## Epic 8: TUI Slash Commands (M11)

- **US 8.1**: As a user, I want to type `/help` or `/?` to see a list of all available commands without making an LLM call.
- **US 8.2**: As a user, I want to switch models mid-session securely by typing `/model <name>`.
- **US 8.3**: As a user with a bloated history context, I want to type `/compact` to manually force a context summarization.
- **US 8.4**: As an error-prone user, if I type `/cls` instead of `/clear`, I want the UI to suggest `/clear` via Levenshtein distance grouping instead of sending garbage tokens to the API.

## Epic 9: LLM-Powered Compaction (M12)

- **US 9.1**: As an agent managing a huge conversation history, I want to delegate summarization of my older messages to an LLM, so the resulting summary is precise, preserving file paths and tool outcomes perfectly.
- **US 9.2**: As the system, I want to automatically select a cheaper, faster LLM model (like `gpt-4o-mini` instead of `gpt-4o`) to perform the background compaction, saving the user money.
- **US 9.3**: As a resumed agent, I want a seamless Handoff Prompt injected directly beneath the compaction summary, so I instantly understand my persona and context haven't broken.

## Epic 10: Sub-Agent Orchestration (M13)

- **US 10.1**: As the main reasoning agent, I want the ability to spawn named "sub-agents" to handle specialized tasks (e.g., executing scripts, analyzing directories) so I don't clutter my own context overhead.
- **US 10.2**: As the main agent, I want to spawn certain sub-agents asynchronously, allowing me to continue reasoning or writing files while the sub-agent scans tests in the background.
- **US 10.3**: As an orchestrator, I want hard limitations (a Depth-1 limit) that strictly prevent a sub-agent from accidentally spawning another sub-agent ad infinitum.

## Epic 11: Stability & Reliability (M14)

- **US 11.1**: As the core engine, I want a proactive `ContextGuard` that estimates API token payloads before sending the request to the provider, automatically triggering compaction at 80% usage.
- **US 11.2**: As the core engine, I want an absolute Emergency Truncation trap door at 95% capacity to prevent immediate process death when compaction isn't fast enough.
- **US 11.3**: As a user working on a long-running complex task, I want the `AutoSave` feature to quietly save my `.jsonl` session file atomically in the background every few turns.
- **US 11.4**: As a user, when I hit `Ctrl+C` in my terminal, I want the CLI to intercept the shutdown signal, force a final instantaneous save, and clean up the sandbox before exiting.

## Epic 12: Telemetry & Engine Bug Bash (M15)

- **US 12.1**: As the core engine, I want to bind tools natively to my LLM runnable before invoking it, preventing raw XML text truncation and ensuring proper Tool orchestration.
- **US 12.2**: As an operator tracking efficiency, I want the system to parse granular provider-specific metadata (like `cache_creation_input_tokens` and `cachedContentTokenCount`) to calculate an accurate Cache Hit Rate.
- **US 12.3**: As a user with a powerful model (like Claude 3.5 Sonnet), I want the TUI context progress bar and engine compaction thresholds to be decoupled from my generation size limit (`maxTokens`) and accurately reflect my true 200k+ context window limit.

## Epic 13: TUI v2, Event Tracking & Host Dependency Mgmt (M16)

- **US 13.1**: As a user monitoring long-running autonomous tasks, I want to see a real-time event log in my TUI that explicitly broadcasts file system I/O, script executions, subagent spawns, and web browsing actions so I am never blind to the agent's behavior.
- **US 13.2**: As an agent tasked with scaffolding locally, I want access to an `install_host_dependencies` tool so I can natively bootstrap and install packages (via `npm`/`pip`/etc.) directly onto the user's host OS, rather than isolating everything in the sandbox.
- **US 13.3**: As a security-conscious user, I want the new host dependency tool to be strictly gated by Human-in-the-Loop (HITL) permission prompts by default, so no malicious code executes natively without my approval.
- **US 13.4**: As a user reading dense code traces, I want the TUI converted from a scrolling vertical chat log into a structured 2-column IDE layout so I can pin metrics, active processes, and a live File Tree in a dedicated sidebar.
