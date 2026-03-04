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
import { installProvider, uninstallProvider, getProviderDir } from "./providers.js";
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
import { SessionStore } from "../core/sessionStore.js";
import { SessionResumer } from "../core/sessionResumer.js";
import { PermissionMiddleware } from "../middleware/permission.js";
import { AskUserQuestionTool } from "../tools/askUser.js";

const CONFIG_PATH = path.join(os.homedir(), ".joone", "config.json");

const SUPPORTED_PROVIDERS = [
  { value: "anthropic", label: "Anthropic", hint: "Claude 4, 3.5 Sonnet, Opus, Haiku" },
  { value: "openai", label: "OpenAI", hint: "GPT-4o, o1, o3-mini" },
  { value: "google", label: "Google", hint: "Gemini 3.1 Pro-preview, 3 Flash-preview" },
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

  // ── Optional Service Keys (skip with Enter) ──

  const sectionMsg = chalk.dim("\n  Optional service keys (press Enter to skip):\n");
  console.log(sectionMsg);

  // E2B (Sandbox)
  let e2bKey = await password({
    message: `E2B API key ${chalk.dim("(primary sandbox)")}`,
    mask: "•",
  });
  if (isCancel(e2bKey)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!e2bKey || (e2bKey as string).trim() === "") e2bKey = existingConfig.e2bApiKey ?? "";

  // OpenSandbox (Fallback)
  let osKey = await password({
    message: `OpenSandbox API key ${chalk.dim("(fallback sandbox)")}`,
    mask: "•",
  });
  if (isCancel(osKey)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!osKey || (osKey as string).trim() === "") osKey = existingConfig.openSandboxApiKey ?? "";

  let osDomain = await text({
    message: `OpenSandbox Domain ${chalk.dim("(fallback sandbox domain, default: localhost:8080)")}`,
    placeholder: "localhost:8080",
    defaultValue: existingConfig.openSandboxDomain ?? "",
  });
  if (isCancel(osDomain)) { cancel("Configuration cancelled."); process.exit(0); }
  if (!osDomain || (osDomain as string).trim() === "") osDomain = existingConfig.openSandboxDomain ?? "";

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

  const s = spinner();
  try {
    s.start(`Downloading and installing the ${provider} provider package...`);
    await installProvider(provider as string);
    s.stop(`Installed ${provider} provider package!`);
  } catch (err: any) {
    s.stop(`Failed to install ${provider} package.`);
    console.error(chalk.yellow(`\n  ⚠ Could not auto-install the provider package: ${err.message}`));
    console.log(chalk.dim(`  Try running: joone provider add ${provider}\n`));
  }

  const s2 = spinner();
  s2.start("Saving configuration...");

  const newConfig: JooneConfig = {
    provider: provider as string,
    model: model as string,
    apiKey: typeof apiKey === "string" ? apiKey : undefined,
    maxTokens: existingConfig.maxTokens,
    temperature: existingConfig.temperature,
    streaming: existingConfig.streaming,
    sandboxTemplate: existingConfig.sandboxTemplate,
    e2bApiKey: typeof e2bKey === "string" ? e2bKey : undefined,
    openSandboxApiKey: typeof osKey === "string" ? osKey : undefined,
    openSandboxDomain: typeof osDomain === "string" ? osDomain : undefined,
    geminiApiKey: typeof geminiKey === "string" ? geminiKey : undefined,
    valyuApiKey: typeof valyuKey === "string" ? valyuKey : undefined,
    langsmithApiKey: typeof langsmithKey === "string" ? langsmithKey : undefined,
    langsmithProject: existingConfig.langsmithProject,
  };

  saveConfig(CONFIG_PATH, newConfig);
  s2.stop("Configuration saved!");

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

// ─── joone provider ────────────────────────────────────────────────────────────

const providerCmd = program.command("provider").description("Manage dynamic LLM provider packages");

providerCmd
  .command("add <providerName>")
  .description("Install a provider package")
  .action(async (providerName) => {
    const s = spinner();
    s.start(`Installing ${providerName}...`);
    try {
      await installProvider(providerName);
      s.stop(`Successfully installed ${providerName}`);
    } catch (e: any) {
      s.stop(`Failed to install ${providerName}`);
      console.error(chalk.red(`\n  ✗ ${e.message}\n`));
      process.exit(1);
    }
  });

providerCmd
  .command("remove <providerName>")
  .description("Uninstall a provider package")
  .action(async (providerName) => {
    const s = spinner();
    s.start(`Uninstalling ${providerName}...`);
    try {
      await uninstallProvider(providerName);
      s.stop(`Successfully uninstalled ${providerName}`);
    } catch (e: any) {
      s.stop(`Failed to uninstall ${providerName}`);
      console.error(chalk.red(`\n  ✗ ${e.message}\n`));
      process.exit(1);
    }
  });

// ─── joone cleanup ─────────────────────────────────────────────────────────────

program
  .command("cleanup")
  .description("Remove all Joone user data, settings, and dynamically installed providers")
  .action(async () => {
    const isConfirmed = await confirm({
      message: `Are you sure you want to delete all Joone data and settings in ${chalk.bold("~/.joone")}?`,
    });

    if (isCancel(isConfirmed) || !isConfirmed) {
      cancel("Cleanup aborted.");
      process.exit(0);
    }

    const jooneDir = path.join(os.homedir(), ".joone");
    const s = spinner();
    s.start("Deleting ~/.joone directory...");

    try {
      if (fs.existsSync(jooneDir)) {
        fs.rmSync(jooneDir, { recursive: true, force: true });
        s.stop("Cleanup complete.");
        console.log(
          chalk.green(`\n  ✓ Successfully removed ${jooneDir}\n`) +
          chalk.dim(`  To finish removing Joone entirely, uninstall it via your package manager:\n`) +
          chalk.dim(`  e.g., \`npm uninstall -g joone\` or \`brew uninstall joone\`\n`)
        );
      } else {
        s.stop("Nothing to clean up.");
        console.log(chalk.dim(`\n  Directory ${jooneDir} does not exist.\n`));
      }
    } catch (e: any) {
      s.stop("Cleanup failed.");
      console.error(chalk.red(`\n  ✗ Error deleting directory: ${e.message}\n`));
      process.exit(1);
    }
  });

// ─── joone (default) ───────────────────────────────────────────────────────────

program
  .command("start", { isDefault: true })
  .description("Start a new Joone agent session")
  .option("--no-stream", "Disable streaming output")
  .option("-r, --resume <sessionId>", "Resume a previous session by ID")
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
      pipeline.use(new PermissionMiddleware(config.permissionMode ?? "auto"));
      const tracer = new SessionTracer();
      
      const { bindSandbox } = await import("../tools/index.js");

      const s = spinner();
      s.start("Initializing Sandbox Environment...");
      const sandboxManager = new SandboxManager({ 
        template: config.sandboxTemplate,
        apiKey: config.e2bApiKey,
        openSandboxApiKey: config.openSandboxApiKey,
        openSandboxDomain: config.openSandboxDomain,
      });
      await sandboxManager.create();
      
      const { FileSync } = await import("../sandbox/sync.js");
      const fileSync = new FileSync(process.cwd());
      bindSandbox(sandboxManager, fileSync);

      // Sync user-level skills into the sandbox
      const { SkillLoader } = await import("../skills/loader.js");
      const skillLoader = new SkillLoader();
      const skillPaths = skillLoader.getDiscoveryPaths();
      await fileSync.syncSkillsToSandbox(sandboxManager, skillPaths);

      s.stop("Sandbox initialized");
      
      // For the CLI, we start by loading the CORE tools
      // Advanced tools (search, browser, etc.) will be dynamically loaded by the agent later
      // via the SearchToolsTool when the registry is fully integrated
      const { CORE_TOOLS } = await import("../tools/index.js");
      const tools = [...CORE_TOOLS, AskUserQuestionTool] as import("../tools/index.js").DynamicToolInterface[];
      
      let initialState;
      let sessionId: string | undefined = undefined;

      if (options.resume) {
        const s = spinner();
        s.start(`Loading session ${chalk.bold(options.resume)}...`);
        const store = new SessionStore();
        try {
          const payload = await store.loadSession(options.resume);
          const resumer = new SessionResumer(process.cwd());
          initialState = resumer.prepareForResume(payload);
          sessionId = options.resume;
          s.stop(`Session resumed`);
        } catch (e: any) {
          s.stop(`Failed to load session`);
          console.error(chalk.red(`\n  ✗ ${e.message}\n`));
          process.exit(1);
        }
      } else {
        initialState = {
          globalSystemInstructions: `You are Joone, a highly capable autonomous coding agent. 
You run in a hybrid environment: you have read/write access to the host machine for code edits, but all code execution, testing, and dependency installation MUST happen in the isolated E2B sandbox for safety.
Always use 'bash' to run terminal commands. Never read or write outside the current project directory unless explicitly requested.

IMPORTANT CAPABILITIES:
- You have access to an 'ask_user_question' tool. Use it to ask the user for clarification, preferences, or approval before making significant changes.
- Some tool calls may require user approval before execution, depending on the user's permission settings. If a tool call is denied, try an alternative approach or ask the user for guidance.
- You have access to Skills — reusable instruction sets for specialized tasks. Use 'search_skills' to discover them and 'load_skill' to activate their instructions.`,
          projectMemory: "No project context loaded yet.",
          sessionContext: `Environment: ${process.platform}\nCWD: ${process.cwd()}`,
          conversationHistory: []
        };
      }

      const harness = new ExecutionHarness(model, tools, pipeline, tracer, config.provider, config.model, sessionId);

      const { render } = await import("ink");
      const React = await import("react");
      const { App } = await import("../ui/App.js");
      
      const { waitUntilExit } = render(
        // @ts-ignore (App is imported dynamically, JSX resolution might complain but it works)
        React.createElement(App, { 
          provider: config.provider, 
          model: config.model, 
          streaming: config.streaming, 
          harness, 
          initialState,
          maxTokens: config.maxTokens,
        })
      );
      
      await waitUntilExit();
      
      // Cleanup
      tracer.save();
      await sandboxManager.destroy();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n  ✗ ${error.stack}\n`));
      } else {
        console.error(chalk.red(`\n  ✗ ${String(error)}\n`));
      }
      process.exit(1);
    }
  });

// ─── joone sessions ────────────────────────────────────────────────────────────

program
  .command("sessions")
  .description("List all persistent sessions available for resumption")
  .action(async () => {
    const store = new SessionStore();
    const sessions = await store.listSessions();

    if (sessions.length === 0) {
      console.log(chalk.dim("\n  No saved sessions found.\n"));
      return;
    }

    console.log(chalk.bold("\n  Recent Sessions:"));
    console.log(chalk.dim("  ─────────────────────────────────────────────────────────"));
    
    for (const session of sessions) {
      const date = new Date(session.lastSavedAt).toLocaleString();
      console.log(
        `  ${chalk.cyan(session.sessionId)} ` + 
        chalk.dim(`[${date}] `) + 
        chalk.grey(`(${session.model})\n`) +
        `    ↳ ${chalk.white(session.description)}\n`
      );
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

// ─── joone eval ────────────────────────────────────────────────────────────────

program
  .command("eval")
  .description("Run automated offline evaluation against the baseline LangSmith dataset")
  .action(async () => {
    let config = loadConfig(CONFIG_PATH);

    if (!config.langsmithApiKey) {
      console.error(chalk.red("\n  ✗ LangSmith API key is missing. Run `joone config` to set it.\n"));
      process.exit(1);
    }

    tryEnableLangSmithFromConfig(config);

    console.log(chalk.cyan("\n  ◆ joone evals") + chalk.dim(` (Model: ${config.model})\n`));

    try {
      const { evaluate } = await import("langsmith/evaluation");
      const { ensureBaselineDataset } = await import("../evals/dataset.js");
      const { 
        successEvaluator, 
        cacheEfficiencyEvaluator, 
        filePresenceEvaluator 
      } = await import("../evals/evaluator.js");

      const s = spinner();
      s.start("Verifying baseline dataset...");
      const datasetName = await ensureBaselineDataset();
      s.stop(`Dataset verified: ${chalk.white(datasetName)}`);

      const model = await createModel(config);
      const pipeline = new MiddlewarePipeline();
      pipeline.use(new LoopDetectionMiddleware(3));
      pipeline.use(new CommandSanitizerMiddleware());
      const tracer = new SessionTracer();
      
      const { bindSandbox, CORE_TOOLS } = await import("../tools/index.js");
      const tools = [...CORE_TOOLS] as import("../tools/index.js").DynamicToolInterface[];

      s.start("Running evaluations across dataset (this may take a few minutes)...");
      
      // We define a target function that the generic `evaluate` engine will call for each example
      const agentTargetFn = async (inputs: Record<string, any>) => {
        const runTracer = new SessionTracer();
        const harness = new ExecutionHarness(model, tools, pipeline, runTracer);

        // Initialize an empty sandbox just for this run
        const sandboxManager = new SandboxManager({ 
          template: config.sandboxTemplate,
          apiKey: config.e2bApiKey,
          openSandboxApiKey: config.openSandboxApiKey,
          openSandboxDomain: config.openSandboxDomain,
        });
        await sandboxManager.create();
        const { FileSync } = await import("../sandbox/sync.js");
        const fileSync = new FileSync(process.cwd());
        bindSandbox(sandboxManager, fileSync);

        const { HumanMessage, AIMessage, ToolMessage } = await import("@langchain/core/messages");
        
        let conversationHistory: any[] = [
          new HumanMessage(inputs.instruction)
        ];

        let finalOutput = "";
        let turnCount = 0;
        const MAX_TURNS = 15; // Anti-doom-loop for evals
        
        try {
          while (turnCount < MAX_TURNS) {
            turnCount++;
            const state = {
              globalSystemInstructions: `You are Joone, a highly capable autonomous coding agent. 
You run in a hybrid environment: you have read/write access to the host machine for code edits, but all code execution, testing, and dependency installation MUST happen in the isolated E2B sandbox for safety.
Always use 'bash' to run terminal commands. Never read or write outside the current project directory unless explicitly requested.`,
              projectMemory: "Evaluation run.",
              sessionContext: `Environment: ${process.platform}\nCWD: ${process.cwd()}`,
              conversationHistory
            };

            const response = await harness.step(state);
            conversationHistory.push(response);

            if (response.content && typeof response.content === "string") {
              finalOutput += response.content + "\n";
            }

            if (!response.tool_calls || response.tool_calls.length === 0) {
              break; // Task complete
            }

            const toolResults = await harness.executeToolCalls(response, state);
            conversationHistory.push(...toolResults);
          }
        } catch (e: any) {
          await sandboxManager.destroy();
          throw e; // LangSmith catches this for the error evaluation
        }

        // Gather metrics
        const summary = runTracer.getSummary();
        const metrics = {
          promptTokens: summary.promptTokens,
          completionTokens: summary.completionTokens,
          cacheCreationTokens: summary.promptTokens * (summary.cacheHitRate), // LangChain doesn't expose explicit creation tokens directly yet, estimating for eval.
          cacheReadTokens: summary.promptTokens * summary.cacheHitRate,
          totalTokens: summary.totalTokens,
        };

        // Check sandbox for uploaded/created files before ripping it down
        let fileManifest: string[] = [];
        try {
          const result = await sandboxManager.exec(`find /workspace -type f`);
          if (result.stdout) {
             fileManifest = result.stdout.split('\n').map((l: string) => l.trim()).filter(Boolean);
          }
        } catch {
          // Ignore, fallback to empty array
        }

        await sandboxManager.destroy();

        return {
          finalOutput,
          metrics,
          fileManifest,
        };
      };

      const results = await evaluate(agentTargetFn, {
        data: datasetName,
        evaluators: [successEvaluator, cacheEfficiencyEvaluator, filePresenceEvaluator],
        experimentPrefix: `joone-eval-${config.model.split('/').pop()}`,
      });

      s.stop("Evaluations completed!");
      // LangSmith automatically prints the web URL to the interactive results dashboard here.
      
    } catch (e: any) {
      console.error(chalk.red(`\n  ✗ Evaluation failed: ${e.message}\n`));
      process.exit(1);
    }
  });

program.parse();
