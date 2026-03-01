# Actionable Insights, Patterns, and Best Practices

Derived from recent research on Harness Engineering and Prompt Caching for Agentic Coding.

## 1. The Cache-Optimized Context Prefix (Prompt Caching)

- **Prefix Matching Rule:** LLM APIs cache everything from the start of a prompt up to a `cache_control` breakpoint. Any dynamic change in the middle invalidates the rest of the cache.
- **Order Matters (Static to Dynamic):**
  1. Base System Instructions & Tool Definitions (Globally Cached)
  2. Project/Workspace memory (e.g., `CLAUDE.md`) (Cached per project)
  3. Session State (Environment variables, rules) (Cached per session)
  4. Conversation Messages (Grows iteratively)
- **Immutability within a Session:** Never add/remove tools mid-conversation, and never swap models (e.g., from Opus to Haiku) mid-session, as this breaks the cache prefix.
- **The `<system-reminder>` Pattern:** If you need to update agent behavior or state, do **not** edit the system prompt. Instead, insert a `<system-reminder>` tag inside the next simulated User Message or Tool Result.

## 2. Harness Engineering & Middleware

- **Control via Harness, Not Just Prompts:** Mold the agent's behavior by building programmatic wrappers (middleware) around the LLM reasoning step rather than just asking the LLM nicely.
- **Anti-Doom-Loop Middleware:** Track per-file edits in the harness. If an agent edits the same file N times without success, inject a message forcing it to reconsider its approach.
- **Forced Self-Verification:** Agents tend to write code and immediately stop without testing. Implement a `PreCompletionChecklistMiddleware` that intercepts the agent's attempt to exit, forcing it to run local tests and read the full output before concluding.
- **Local Context Injection:** Automatically discover and map the working directory and available binaries (e.g., Python, Node) into the prompt upon startup.

## 3. Agent Execution Strategy

- **The Reasoning Sandwich:** Adjust the amount of compute/reasoning dynamically. Use heavy reasoning for Planning, Discovery, and Final Verification, but use medium reasoning for straightforward code implementations to save time and tokens.
- **Lazy Tool Loading (Searchable Tools):** Instead of stuffing every possible schema into the prompt, provide "stubs" (tool names and descriptions). Allow the agent to search for advanced tools, deferring the loading of full schemas to preserve prefix caching.
- **Trace-Driven Improvement:** Treat tracing (e.g., LangSmith) as a first-class feature. Route raw text-space traces to a designated "Trace Analyzer Subagent" to find where the agent frequently fails, allowing you to patch the harness without blindly guessing.
