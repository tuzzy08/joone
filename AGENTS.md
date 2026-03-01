# Welcome to the Agentic Coding Project

You are an autonomous AI Agent contributing to this codebase. To ensure consistency with the established architectural patterns (Prompt Caching + Harness Engineering), you **MUST** review the foundational documents in the `docs/` directory before proposing new features or modifying the core loop.

## Required Reading List

Before tackling complex tasks related to the context engine, middleware, or tools, please reference:

- `Handover.md`: **MUST READ FIRST if this is a new session.** Contains all key architectural decisions and current project state.
- `docs/01_insights_and_patterns.md`: The core thesis of the project (Prefix caching rules, Middleware hooks).
- `docs/02_edge_cases_and_mitigations.md`: What _not_ to do (e.g., Leaky timestamps, Mid-session model switches).
- `docs/07_system_architecture.md`: The REPL execution graph.

## Development Process: Red-Green-Refactor TDD

> **CRITICAL:** This project follows a strict **Test-Driven Development (TDD)** workflow using the **Red-Green-Refactor** cycle.

### TDD Skills (MUST READ)

Before writing **any** production code, you **MUST** load and follow the TDD skill instructions:

1. **Primary:** `C:\Users\Lenovo\.agents\skills\tdd\SKILL.md` — Covers vertical slicing (tracer bullets), behavior-driven testing, and anti-patterns.
2. **Extended:** `C:\Users\Lenovo\.agents\skills\test-driven-development\SKILL.md` — The "Iron Law": no production code without a failing test first. Includes rationalizations to watch for and a verification checklist.

### The Cycle

1. **RED** — Write a failing test first. The test defines expected behavior.
2. **GREEN** — Write the minimum production code to make the failing test pass.
3. **REFACTOR** — Clean up both test and production code while keeping all tests green.

### Rules

- **Vertical slices only.** One test → one implementation → repeat. Never write all tests first.
- **No production code without a failing test.** Code written before the test? Delete it. Start over.
- **Never refactor while RED.** Get to GREEN first.

**Test Runner:** Vitest (`npx vitest` or `npm test`).

## Tracking Progress

Any time you complete a significant milestone, you **must**:

1. Append a summary of your actions and the current state of the project to `PROGRESS.md` in the project root.
2. Update `Handover.md` to reflect any new architectural decisions, tool additions, or shifts in the project state.

This ensures the next agent or human developer knows exactly where to pick up and why decisions were made.

## API Key Management

> **CRITICAL:** When implementing a **new tool** that requires an API key or token, you **must**:
>
> 1. Add the key field to `JooneConfig` in `src/cli/config.ts`.
> 2. Add a password prompt for it in the `joone config` onboarding flow in `src/cli/index.ts` (under the "Optional Service Keys" section).
> 3. Ensure the key is included in the `newConfig` object that gets saved.
>
> All service keys (except the primary LLM provider key) should be **optional** — the user can press Enter to skip. Tools should gracefully degrade when their API key is not configured.
