import "dotenv/config";
import { ChatAnthropic } from "@langchain/anthropic";
import { ExecutionHarness } from "./core/agentLoop.js";
import { ContextState } from "./core/promptBuilder.js";
import { HumanMessage } from "@langchain/core/messages";

async function runCacheTest() {
    console.log("=== Starting Prompt Caching Test ===\n");
    
    // We need Anthropic API Key for this to actually hit the network and measure cache
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn("WARNING: ANTHROPIC_API_KEY is not set in .env file. The LLM call will fail.");
    }

    const model = new ChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 4096,
    }); // No tools needed for this basic string test

    const harness = new ExecutionHarness(model, []);

    // 1. Create a massive static prefix (simulating a lot of project context)
    // We repeat a string many times to ensure we pass the 1024 token minimum for Anthropic caching.
    const massiveProjectMemory = Array(500).fill("Project Rule: Always write clean, modular TypeScript code with strict typings. ").join("\n");

    const state: ContextState = {
        globalSystemInstructions: "You are a helpful coding assistant. You remember rules carefully.",
        projectMemory: massiveProjectMemory,
        sessionContext: "User OS: Windows 11",
        conversationHistory: []
    };

    console.log("Turn 1: Initial Query (Should create cache)");
    state.conversationHistory.push(new HumanMessage("Hello! What is one of the project rules?"));
    
    const response1 = await harness.step(state);
    state.conversationHistory.push(response1);
    
    // In @langchain/anthropic, the actual usage stats (including cache hits/misses) 
    // are stored in the response_metadata of the AIMessage.
    console.log(`Response 1: ${response1.content}`);
    console.log(`Token Usage 1: ${JSON.stringify(response1.response_metadata?.usage, null, 2)}\n`);

    // --- TURN 2 ---
    console.log("Turn 2: Follow-up Query (Should hit cache)");
    // We DO NOT change the globalSystemInstructions, projectMemory, or sessionContext.
    // We only append to the conversation history. This preserves the prefix!
    state.conversationHistory.push(new HumanMessage("Could you summarize the rule again briefly?"));
    
    const response2 = await harness.step(state);
    state.conversationHistory.push(response2);
    
    console.log(`Response 2: ${response2.content}`);
    console.log(`Token Usage 2: ${JSON.stringify(response2.response_metadata?.usage, null, 2)}\n`);

    // --- TURN 3: The System Reminder Pattern ---
    console.log("Turn 3: Using <system-reminder> to simulate environment change without breaking cache");
    // If a file changed, we DON'T update `state.projectMemory`. We inject a reminder.
    state.conversationHistory.push(new HumanMessage(
        "<system-reminder>\nThe file 'auth.ts' has just been deleted by the user.\n</system-reminder>\nWhat should we do if we need auth now?"
    ));

    const response3 = await harness.step(state);
    
    console.log(`Response 3: ${response3.content}`);
    console.log(`Token Usage 3: ${JSON.stringify(response3.response_metadata?.usage, null, 2)}\n`);
}

if (require.main === module) {
    runCacheTest().catch(console.error);
}
