import "dotenv/config";
import { ChatAnthropic } from "@langchain/anthropic";
import { ContextState } from "./core/promptBuilder.js";
import { ExecutionHarness } from "./core/agentLoop.js";
import { CORE_TOOLS } from "./tools/index.js";

async function main() {
    console.log("Starting Execution Harness...");

    // 1. Initialize the specific LLM provider here (Anthropic, OpenAI, etc.)
    const model = new ChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 4096,
    }).bindTools(CORE_TOOLS.map(t => t.schema));

    // 2. Inject the bound LLM into the harness
    const harness = new ExecutionHarness(model, CORE_TOOLS);

    // Initial State Structure ensuring cache optimizations
    const state: ContextState = {
        globalSystemInstructions: `You are an autonomous pair-programmer. 
Your goal is to complete technical tasks effectively.
You have access to a terminal and file system.`,
        projectMemory: `Project: Coding Agent
Version: 1.0.0
Rules: Do not delete files without asking.`,
        sessionContext: `Environment: NodeJS (Windows)
CWD: /joone`,
        conversationHistory: []
    };

    console.log("System Context Built:", state);
    console.log("Ready to accept tasks and enter the REPL loop.");
}

if (require.main === module) {
    main().catch(console.error);
}
