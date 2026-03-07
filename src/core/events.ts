/**
 * Agent Event System
 * 
 * Defines the strongly typed events emitted by the ExecutionHarness
 * for real-time tracking of agent actions within the TUI.
 */

export type AgentEvent =
  | { type: "agent:stream"; token: string }
  | { type: "tool:start"; toolName: string; args: string }
  | { type: "tool:end"; toolName: string; result: string; durationMs: number }
  | { type: "subagent:spawn"; agentName: string; task: string }
  | { type: "file:io"; action: "read" | "write"; path: string }
  | { type: "system:script_exec"; command: string; location: "host" | "sandbox" }
  | { type: "browser:nav"; url: string }
  | { type: "system:save"; sessionId: string };

/**
 * Interface for typed event emitters overriding Node's EventEmitter
 */
export interface AgentEventEmitter {
  on(event: "agent:event", listener: (e: AgentEvent) => void): this;
  emit(event: "agent:event", e: AgentEvent): boolean;
  off(event: "agent:event", listener: (e: AgentEvent) => void): this;
}
