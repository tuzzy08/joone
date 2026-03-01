#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import {
  intro,
  outro,
  select,
  text,
  password,
  confirm,
  spinner,
  isCancel,
  cancel,
} from "@clack/prompts";
import { loadConfig, saveConfig, JooneConfig, DEFAULT_CONFIG } from "./config.js";
import { createModel } from "./modelFactory.js";
import { tryEnableLangSmithFromConfig } from "../tracing/langsmith.js";
import { TraceAnalyzer } from "../tracing/analyzer.js";
import { SessionTracer } from "../tracing/sessionTracer.js";
import { SandboxManager } from "../sandbox/manager.js";
import { ToolRouter } from "../tools/router.js";
import { MiddlewarePipeline } from "../middleware/pipeline.js";
import { LoopDetectionMiddleware } from "../middleware/loopDetection.js";
import { CommandSanitizerMiddleware } from "../middleware/commandSanitizer.js";
import { PreCompletionMiddleware } from "../middleware/preCompletion.js";
import { ExecutionHarness } from "../core/agentLoop.js";

const CONFIG_PATH = path.join(os.homedir(), ".joone", "config.json");

const SUPPORTED_PROVIDERS = [
  { value: "anthropic", label: "Anthropic", hint: "Claude 4, 3.5 Sonnet, Opus, Haiku" },
  { value: "openai", label: "OpenAI", hint: "GPT-4o, o1, o3-mini" },
  { value: "google", label: "Google", hint: "Gemini 2.0 Flash, 1.5 Pro" },
  { value: "mistral", label: "Mistral", hint: "Mistral Large, Codestral" },
  { value: "groq", label: "Groq", hint: "Llama 3.1 70B, Mixtral" },
  { value: "deepseek", label: "DeepSeek", hint: "DeepSeek Chat, Reasoner" },
  { value: "fireworks", label: "Fireworks AI", hint: "Llama 3.1 70B Instruct" },
  { value: "together", label: "Together AI", hint: "Llama 3.1 Turbo" },
  { value: "ollama", label: "Ollama (Local)", hint: "No API key needed" },
] as const;

const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "o1", label: "o1" },
    { value: "o3-mini", label: "o3-mini" },
  ],
  google: [
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  mistral: [
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "codestral-latest", label: "Codestral" },
    { value: "mistral-small-latest", label: "Mistral Small" },
  ],
  groq: [
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  fireworks: [
    { value: "accounts/fireworks/models/llama-v3p1-70b-instruct", label: "Llama 3.1 70B Instruct" },
  ],
  together: [
    { value: "meta-llama/Llama-3.1-70B-Instruct-Turbo", label: "Llama 3.1 70B Turbo" },
  ],
  ollama: [
    { value: "llama3", label: "Llama 3" },
    { value: "codellama", label: "Code Llama" },
    { value: "mistral", label: "Mistral" },
  ],
};

const program = new Command();

program
  .name("joone")
  .description("An autonomous coding agent powered by prompt caching and harness engineering")
  .version("0.1.0");

// ─── Shared onboarding flow ────────────────────────────────────────────────────

/**
 * Interactive onboarding wizard. Prompts the user for provider, model, API keys,
 * and optional service keys. Saves the config to disk and returns it.
 *
 * Called by `joone config` directly, and auto-triggered by `joone start` when
 * no valid configuration is found.
 */
async function runOnboarding(): Promise<JooneConfig> {
  intro(chalk.bgCyan.black(" 🔧 joone setup "));

  const existingConfig = loadConfig(CONFIG_PATH);

  // ── Provider ───────────────────────────────
  const provider = await select({
    message: "Select your LLM provider",
    options: SUPPORTED_PROVIDERS.map((p) => ({
      value: p.value,
      label: p.label,
      hint: p.hint,
    })),
    initialValue: existingConfig.provider,
  });

  if (isCancel(provider)) {
    cancel("Configuration cancelled.");
    process.exit(0);
  }

  // ── Model ─────────────────────────────────
  const models = PROVIDER_MODELS[provider] || [];
  let model: string | symbol;

  if (models.length > 0) {
    model = await select({
      message: "Select your model",
      options: models,
      initialValue: existingConfig.model,
    });
  } else {
    model = await text({
      message: "Enter the model name",
      defaultValue: existingConfig.model,
      placeholder: existingConfig.model,
    });
  }

  if (isCancel(model)) {
    cancel("Configuration cancelled.");
    process.exit(0);
  }

  // ── API Key ───────────────────────────────
  let apiKey: string | symbol | undefined;
  if (provider !== "ollama") {
    apiKey = await password({
      message: `Enter your ${chalk.bold(provider.toUpperCase())} API key`,
      mask: "•",
    });

    if (isCancel(apiKey)) {
      cancel("Configuration cancelled.");
      process.exit(0);
    }

    if (!apiKey || apiKey.trim() === "") {
      apiKey = existingConfig.apiKey;
    }
  }

  // ── Streaming ─────────────────────────────
  const streaming = await confirm({
    message: "Enable streaming output?",
    initialValue: existingConfig.streaming,
  });

  if (isCancel(streaming)) {
    cancel("Configuration cancelled.");
    process.exit(0);
  }

  // ── Optional Service Keys (skip with Enter) ──

  const sectionMsg = chalk.dim("\n  Optional service keys (press Enter to skip):\n");
  console.log(sectionMsg);

  // E2B (Sandbox)
  let e2bKey = await password({
    message: `E2B API key ${chalk.dim("(sandbox)")}`,
    mask: "•",
  });
  if (isCancel(e2bKey)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!e2bKey || (e2bKey as string).trim() === "") e2bKey = existingConfig.e2bApiKey ?? "";

  // Gemini (Security scanning)
  let geminiKey = await password({
    message: `Gemini API key ${chalk.dim("(security scan)")}`,
    mask: "•",
  });
  if (isCancel(geminiKey)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!geminiKey || (geminiKey as string).trim() === "") geminiKey = existingConfig.geminiApiKey ?? "";

  // Valyu (Web search)
  let valyuKey = await password({
    message: `Valyu API key ${chalk.dim("(web search)")}`,
    mask: "•",
  });
  if (isCancel(valyuKey)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!valyuKey || (valyuKey as string).trim() === "") valyuKey = existingConfig.valyuApiKey ?? "";

  // LangSmith (Tracing)
  let langsmithKey = await password({
    message: `LangSmith API key ${chalk.dim("(tracing)")}`,
    mask: "•",
  });
  if (isCancel(langsmithKey)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!langsmithKey || (langsmithKey as string).trim() === "") langsmithKey = existingConfig.langsmithApiKey ?? "";

  // ── Save ──────────────────────────────────
  const s = spinner();
  s.start("Saving configuration...");

  const newConfig: JooneConfig = {
    provider: provider as string,
    model: model as string,
    apiKey: typeof apiKey === "string" ? apiKey : undefined,
    maxTokens: existingConfig.maxTokens,
    temperature: existingConfig.temperature,
    streaming,
    sandboxTemplate: existingConfig.sandboxTemplate,
    e2bApiKey: typeof e2bKey === "string" ? e2bKey : undefined,
    geminiApiKey: typeof geminiKey === "string" ? geminiKey : undefined,
    valyuApiKey: typeof valyuKey === "string" ? valyuKey : undefined,
    langsmithApiKey: typeof langsmithKey === "string" ? langsmithKey : undefined,
    langsmithProject: existingConfig.langsmithProject,
  };

  saveConfig(CONFIG_PATH, newConfig);
  s.stop("Configuration saved!");

  outro(
    chalk.green("✓") +
      ` Config written to ${chalk.dim(CONFIG_PATH)}\n` +
      `  Starting Joone session...`
  );

  return newConfig;
}

// ─── joone config ──────────────────────────────────────────────────────────────

program
  .command("config")
  .description("Configure your LLM provider, model, and API key")
  .action(async () => {
    await runOnboarding();
  });

// ─── joone (default) ───────────────────────────────────────────────────────────

program
  .command("start", { isDefault: true })
  .description("Start a new Joone agent session")
  .option("--no-stream", "Disable streaming output")
  .action(async (options) => {
    let config = loadConfig(CONFIG_PATH);

    // Auto-trigger onboarding if no API key is configured
    if (!config.apiKey && config.provider !== "ollama") {
      console.log(
        chalk.yellow("\n  ⚠ No configuration found.") +
          chalk.dim(" Let's set up Joone!\n")
      );
      config = await runOnboarding();
    }

    if (options.stream === false) {
      config.streaming = false;
    }

    const tracingEnabled = tryEnableLangSmithFromConfig(config);

    console.log(
      chalk.cyan("\n  ◆ joone") +
        chalk.dim(" v0.1.0\n") +
        chalk.dim("  ├ Provider: ") + chalk.white(config.provider) + "\n" +
        chalk.dim("  ├ Model:    ") + chalk.white(config.model) + "\n" +
        chalk.dim("  ├ Stream:   ") + chalk.white(config.streaming ? "on" : "off") + "\n" +
        chalk.dim("  └ Tracing:  ") + (tracingEnabled ? chalk.green("LangSmith") : chalk.dim("local only")) + "\n"
    );

    try {
      const model = await createModel(config);
      
      const pipeline = new MiddlewarePipeline();
      pipeline.use(new LoopDetectionMiddleware(3));
      pipeline.use(new CommandSanitizerMiddleware());
      const tracer = new SessionTracer();
      
      const { bindSandbox } = await import("../tools/index.js");

      const s = spinner();
      s.start("Initializing E2B Sandbox...");
      const sandboxManager = new SandboxManager({ template: config.sandboxTemplate });
      await sandboxManager.create();
      
      const { FileSync } = await import("../sandbox/sync.js");
      const fileSync = new FileSync(process.cwd());
      bindSandbox(sandboxManager, fileSync);
      s.stop("Sandbox initialized");
      
      // For the CLI, we start by loading the CORE tools
      // Advanced tools (search, browser, etc.) will be dynamically loaded by the agent later
      // via the SearchToolsTool when the registry is fully integrated
      const { CORE_TOOLS } = await import("../tools/index.js");
      const tools = [...CORE_TOOLS] as import("../tools/index.js").DynamicToolInterface[];
      
      const harness = new ExecutionHarness(model, tools, pipeline, tracer);

      const initialState = {
        globalSystemInstructions: `You are Joone, a highly capable autonomous coding agent. 
You run in a hybrid environment: you have read/write access to the host machine for code edits, but all code execution, testing, and dependency installation MUST happen in the isolated E2B sandbox for safety.
Always use 'bash' to run terminal commands. Never read or write outside the current project directory unless explicitly requested.`,
        projectMemory: "No project context loaded yet.",
        sessionContext: `Environment: ${process.platform}\nCWD: ${process.cwd()}`,
        conversationHistory: []
      };

      const { render } = await import("ink");
      const { App } = await import("../ui/App.js");
      
      const { waitUntilExit } = render(
        // @ts-ignore (App is imported dynamically, JSX resolution might complain but it works)
        React.createElement(App, { 
          provider: config.provider, 
          model: config.model, 
          streaming: config.streaming, 
          harness, 
          initialState 
        })
      );
      
      await waitUntilExit();
      
      // Cleanup
      tracer.save();
      await sandboxManager.destroy();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n  ✗ ${error.message}\n`));
      }
      process.exit(1);
    }
  });

// ─── joone analyze ─────────────────────────────────────────────────────────────

program
  .command("analyze [sessionId]")
  .description("Analyze a session trace for performance insights")
  .action((sessionId) => {
    let tracePath;
    const tracesDir = path.join(os.homedir(), ".joone", "traces");

    if (sessionId) {
      tracePath = path.join(tracesDir, sessionId.endsWith(".json") ? sessionId : `${sessionId}.json`);
    } else {
      // Find the most recent trace
      if (!fs.existsSync(tracesDir)) {
        console.error(chalk.red("\n  ✗ No traces directory found.\n"));
        process.exit(1);
      }
      const files = fs.readdirSync(tracesDir)
        .filter(f => f.endsWith(".json"))
        .map(f => ({ name: f, time: fs.statSync(path.join(tracesDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time); // newest first

      if (files.length === 0) {
        console.error(chalk.red("\n  ✗ No trace files found.\n"));
        process.exit(1);
      }
      tracePath = path.join(tracesDir, files[0].name);
    }

    if (!fs.existsSync(tracePath)) {
      console.error(chalk.red(`\n  ✗ Trace file not found: ${tracePath}\n`));
      process.exit(1);
    }

    try {
      const trace = SessionTracer.load(tracePath);
      const analyzer = new TraceAnalyzer(trace);
      const report = analyzer.analyze();
      console.log(TraceAnalyzer.formatReport(report));
    } catch (e: any) {
      console.error(chalk.red(`\n  ✗ Error analyzing trace: ${e.message}\n`));
      process.exit(1);
    }
  });

program.parse();
