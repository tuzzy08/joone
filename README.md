<div align="center">

# ⚡ Joone

**An autonomous coding agent powered by prompt caching, harness engineering, and secure sandboxing.**

[![npm version](https://img.shields.io/npm/v/joone.svg)](https://npmjs.org/package/joone)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

</div>

---

**Joone** is a highly capable autonomous AI coding assistant that runs directly in your terminal. It leverages a hybrid environment: it has read/write access to your local project files for seamless editing, but all code execution, testing, and dependency installations happen securely inside an isolated cloud sandbox (powered by E2B).

## ✨ Features

- **🧠 Pluggable Intelligence**: Seamlessly switch between Anthropic (Claude 3.5 Sonnet, Opus), OpenAI (GPT-4o, o1), Google (Gemini 1.5/pro), Mistral, Groq, local Ollama models, and more.
- **🔌 User-Local Provider Plugins**: Heavy LLM SDKs (like `@langchain/google-genai`) are dynamically installed into `~/.joone/providers`. This keeps the base Joone installation incredibly lightweight while supporting every major AI provider.
- **🛡️ Secure Execution Sandbox**: Joone cannot accidentally delete your local database or run malicious `npm install` scripts on your host machine. All execution happens in an isolated E2B cloud sandbox that syncs seamlessly with your local workspace.
- **🖥️ Beautiful Terminal UI**: Built with React and Ink, Joone provides a rich, interactive TUI (Terminal User Interface) with spinners, syntax highlighting, and progress tracking.
- **🔍 Deep Insights**: Integrated with LangSmith for comprehensive session tracing, token counting, and performance analysis.
- **🔁 Agent Resilience**: Includes loop detection, command sanitization, backoff retries, and a human-in-the-loop (HITL) permission middleware (`auto`, `ask_dangerous`, `ask_all`).

---

## 🚀 Getting Started

### Installation

Install Joone globally via npm:

```bash
npm install -g joone
```

### Configuration

Run the automated onboarding wizard to configure your preferred LLM provider, models, and API keys:

```bash
joone config
```

_This will prompt you for your LLM API Key and optionally your E2B Sandbox API key. Keys are securely stored in `~/.joone/config.json`._

### Start Joone

To start an autonomous session in your current project directory:

```bash
joone start
```

Or, if you want to skip global installation altogether, run it on-demand:

```bash
npx joone@latest start
```

---

## 🛠️ Commands

| Command                        | Description                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `joone start`                  | Start a new Joone agent session in the current directory.                       |
| `joone start --resume <id>`    | Resume a previously saved persistent session.                                   |
| `joone config`                 | Run the configuration wizard (Providers, API Keys, etc.).                       |
| `joone sessions`               | List all available persistent sessions for resumption.                          |
| `joone provider add <name>`    | Manually download a dynamic LLM provider package (e.g., `google`, `anthropic`). |
| `joone provider remove <name>` | Uninstall a provider package locally.                                           |
| `joone analyze [sessionId]`    | Analyze a session trace for token usage and performance insights.               |
| `joone eval`                   | Run automated offline evaluation against the LangSmith dataset.                 |
| `joone cleanup`                | Wipe all Joone configurations, keys, traces, and plugins from your machine.     |

---

## 🏗️ Architecture

Joone is built around the **Execution Harness** pattern.

1. **Prompt Builder**: Dynamically constructs LLM prompts using Anthropic/LangChain's prompt caching features to save tokens over long sessions.
2. **Middleware Pipeline**: Tool calls pass through a robust middleware stack (Loop Detection, Command Sanitization, Permissions) before executing.
3. **Dynamic Sandbox**: Tools executing terminal commands or running dev servers are routed via `@langchain/core` directly into a temporary E2B sandbox. File modifications are synchronized back to your local machine via a bidirectional sync layer.

## 🤝 Contributing

We welcome contributions!

1. Clone the repository
2. Run `npm install`
3. Make your changes in `src/`
4. Compile with `npm run build`
5. Test your changes locally using `npm run dev -- start`

## 📝 License

ISC License. See `LICENSE` for more information.
