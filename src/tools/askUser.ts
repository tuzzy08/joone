import { HITLBridge } from "../hitl/bridge.js";
import { DynamicToolInterface, ToolResult } from "./index.js";

/**
 * AskUserQuestionTool — allows the agent to ask the user a clarifying question mid-turn.
 *
 * Use cases:
 * - Resolving ambiguous requirements before coding.
 * - Getting user preferences (framework choice, styling, naming).
 * - Requesting approval of an implementation plan before proceeding.
 */
export const AskUserQuestionTool: DynamicToolInterface = {
    name: "ask_user_question",
    description:
        "Ask the user a question and wait for their response. " +
        "Use this when you need clarification on the task, user preferences, " +
        "or approval before proceeding with a significant change. " +
        "You may optionally provide a list of answer choices.",
    schema: {
        type: "object" as const,
        properties: {
            question: {
                type: "string",
                description: "The question to ask the user.",
            },
            options: {
                type: "array",
                items: { type: "string" },
                description: "Optional list of predefined answer choices.",
            },
        },
        required: ["question"],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const question = args.question as string;
        const options = args.options as string[] | undefined;

        if (!question || question.trim() === "") {
            return { content: "Error: You must provide a non-empty question.", isError: true };
        }

        const bridge = HITLBridge.getInstance();
        const answer = await bridge.askUser(question, options);

        return { content: answer };
    },
};
