# User Stories

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
- **US 4.2**: As a user, I want all bash commands, test runs, and dependency installs to execute inside an E2B cloud sandbox, so my local machine is never at risk from destructive operations.
- **US 4.3**: As the system, I want to sync changed files from the host to the sandbox before every execution command, so the sandbox always has the latest code.
- **US 4.4**: As the system, I want to create a new E2B sandbox at the start of each agent session and destroy it when the session ends or times out.
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

## Epic 7: Analytics & Tracing

- **US 7.1**: As an operator, I want every agent decision, tool call, and token metric logged to a standard trace format so I can monitor cache hit rates.
- **US 7.2**: As an operator, I want a script that can read failed traces and use an LLM to automatically summarize _why_ the agent failed tasks, allowing me to refine the harness.
