import { EventEmitter } from "node:events";

export interface HITLQuestion {
    /** Unique ID for this question. */
    id: string;
    /** The question text to display to the user. */
    question: string;
    /** Optional predefined answer choices. */
    options?: string[];
    /** Timestamp when the question was posed. */
    createdAt: number;
}

export interface HITLPermissionRequest {
    /** Unique ID for this request. */
    id: string;
    /** The tool requesting permission. */
    toolName: string;
    /** The arguments the tool was called with. */
    args: Record<string, unknown>;
    /** Timestamp when the request was created. */
    createdAt: number;
}

/**
 * HITLBridge — Human-in-the-Loop communication bridge.
 *
 * Provides a typed event-based interface between the tool execution layer
 * and the TUI rendering layer. When a tool needs user input, it emits
 * a question event and awaits the response. The TUI listens, renders
 * the prompt, and resolves the answer.
 *
 * Singleton pattern: one bridge per session.
 */
export class HITLBridge extends EventEmitter {
    private static instance: HITLBridge | null = null;
    private pendingResolvers = new Map<string, (answer: string) => void>();
    private timeoutMs: number;
    private questionCounter = 0;

    constructor(timeoutMs: number = 5 * 60 * 1000) {
        super();
        this.timeoutMs = timeoutMs;
    }

    static getInstance(timeoutMs?: number): HITLBridge {
        if (!HITLBridge.instance) {
            HITLBridge.instance = new HITLBridge(timeoutMs);
        }
        return HITLBridge.instance;
    }

    static resetInstance(): void {
        HITLBridge.instance = null;
    }

    /**
     * Called by a tool to ask the user a free-form question.
     * Blocks until the user responds (or times out).
     *
     * @returns The user's answer as a string.
     */
    async askUser(question: string, options?: string[]): Promise<string> {
        const id = `hitl-q-${++this.questionCounter}-${Date.now()}`;

        const payload: HITLQuestion = {
            id,
            question,
            options,
            createdAt: Date.now(),
        };

        return new Promise<string>((resolve, reject) => {
            this.pendingResolvers.set(id, resolve);

            // Emit the question so the TUI can render it
            this.emit("question", payload);

            // Timeout: auto-reject if user doesn't respond
            const timer = setTimeout(() => {
                if (this.pendingResolvers.has(id)) {
                    this.pendingResolvers.delete(id);
                    resolve("[No response — the user did not answer within the timeout period.]");
                }
            }, this.timeoutMs);

            // Clean up timer if resolved before timeout
            const originalResolve = this.pendingResolvers.get(id)!;
            this.pendingResolvers.set(id, (answer: string) => {
                clearTimeout(timer);
                originalResolve(answer);
            });
        });
    }

    /**
     * Called by the PermissionMiddleware to request tool execution approval.
     * Blocks until the user responds [y/n] (or times out with denial).
     *
     * @returns true if approved, false if denied or timed out.
     */
    async requestPermission(toolName: string, args: Record<string, unknown>): Promise<boolean> {
        const id = `hitl-perm-${++this.questionCounter}-${Date.now()}`;

        const payload: HITLPermissionRequest = {
            id,
            toolName,
            args,
            createdAt: Date.now(),
        };

        return new Promise<boolean>((resolve) => {
            const wrappedResolve = (answer: string) => {
                const normalized = answer.trim().toLowerCase();
                resolve(normalized === "y" || normalized === "yes" || normalized === "approve");
            };

            this.pendingResolvers.set(id, wrappedResolve as any);

            // Emit so the TUI can render the permission prompt
            this.emit("permission", payload);

            // Timeout: auto-deny
            const timer = setTimeout(() => {
                if (this.pendingResolvers.has(id)) {
                    this.pendingResolvers.delete(id);
                    resolve(false); // Denied by timeout
                }
            }, this.timeoutMs);

            // Clean up timer on resolve
            const current = this.pendingResolvers.get(id)!;
            this.pendingResolvers.set(id, (answer: string) => {
                clearTimeout(timer);
                (current as any)(answer);
            });
        });
    }

    /**
     * Called by the TUI when the user submits an answer.
     *
     * @param id - The question/permission request ID.
     * @param answer - The user's text response.
     */
    resolveAnswer(id: string, answer: string): void {
        const resolver = this.pendingResolvers.get(id);
        if (resolver) {
            this.pendingResolvers.delete(id);
            resolver(answer);
        }
    }

    /**
     * Returns true if there is an outstanding question awaiting an answer.
     */
    hasPendingQuestion(): boolean {
        return this.pendingResolvers.size > 0;
    }
}
