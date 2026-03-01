# Tech Stack

The technology stack has been finalized. We are moving forward with a combination of the strong typing of TypeScript and the robust AI orchestration ecosystem of LangChain.

## The Final Stack

- **Language:** TypeScript (Node.js)
  - Provides end-to-end type safety, especially crucial for tool schemas (Zod) and avoiding runtime errors in the execution loop.
- **Orchestration / LLM Framework:** LangChain.js / LangGraph.js
  - Using the TypeScript SDK for LangChain allows us to build complex, cyclical agent workflows (like Middlewares and self-correction loops) via LangGraph.
- **Typing / Tool Schemas:** Zod
  - Seamless integration with LangChain for structural output parsing and strict tool definition.
- **Tracing:** LangSmith
  - First-party integration with LangChain, providing deep visibility into token usage, prompt construction, and latency. Essential for debugging cache hit rates.
- **CLI Framework (Optional):** Commander.js / Ink
  - To be used if we build a robust terminal interface for the agent.

## Why this combination?

This marries the best of both originally proposed worlds. It gives us the frontend/backend interoperability and strict compile-time checks of TypeScript, while retaining the mature, graph-based agent orchestration and high-fidelity trace analysis typically dominated by Python's LangChain ecosystem.
