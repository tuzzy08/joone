import { HITLBridge } from "../hitl/bridge.js";
import { tool } from "langchain";
import { z } from "zod";

/**
 * askUserQuestionTool — allows the agent to ask the user a clarifying question mid-turn.
 *
 * Use cases:
 * - Resolving ambiguous requirements before coding.
 * - Getting user preferences (framework choice, styling, naming).
 * - Requesting approval of an implementation plan before proceeding.
 */
export const askUserQuestionTool = tool(
    async ({ question, options }: { question: string; options?: string[] }) => {
        if (!question || question.trim() === "") {
            return "Error: You must provide a non-empty question.";
        }

        const bridge = HITLBridge.getInstance();
        const answer = await bridge.askUser(question, options);

        return answer;
    },
    {
        name: "ask_user_question",
        description:
            "Ask the user a question and wait for their response. " +
            "Use this when you need clarification on the task, user preferences, " +
            "or approval before proceeding with a significant change. " +
            "You may optionally provide a list of answer choices.",
        schema: z.object({
            question: z.string().describe("The question to ask the user."),
            options: z.array(z.string()).optional().describe("Optional list of predefined answer choices."),
        }),
    }
);
