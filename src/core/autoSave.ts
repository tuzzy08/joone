/**
 * Auto-Save
 *
 * Periodically saves the session state to disk using atomic writes.
 * This prevents data loss if the terminal crashes or the LLM loop hangs.
 * Atomic writes ensure the JSONL session file is never corrupted during save.
 */

import { SessionStore } from "./sessionStore.js";
import { ContextState } from "./promptBuilder.js";
import { ActiveToolCall } from "../ui/App.js";

// We extract just what we need for auto-save from the harness
export interface AutoSaveData {
  config: { provider: string; model: string };
  state: ContextState;
  activeTool?: ActiveToolCall;
}

export class AutoSave {
  private store: SessionStore;
  private sessionId: string;
  private saveFrequencyTurns: number;
  private turnsSinceLastSave = 0;
  private lastSaveTime = 0;
  private debounceMs: number;
  private isSaving = false;

  constructor(
    sessionId: string,
    store: SessionStore = new SessionStore(),
    saveFrequencyTurns = 5,
    debounceMs = 10000 // 10 seconds minimum between saves
  ) {
    this.sessionId = sessionId;
    this.store = store;
    this.saveFrequencyTurns = saveFrequencyTurns;
    this.debounceMs = debounceMs;
  }

  /**
   * Called at the end of every agent loop turn.
   * Periodically triggers an atomic save.
   */
  async tick(data: AutoSaveData): Promise<boolean> {
    this.turnsSinceLastSave++;

    const now = Date.now();
    const shouldSave =
      this.turnsSinceLastSave >= this.saveFrequencyTurns &&
      now - this.lastSaveTime >= this.debounceMs;

    if (shouldSave && !this.isSaving) {
      await this.forceSave(data);
      return true;
    }

    return false;
  }

  /**
   * Forces an immediate atomic save, e.g., during SIGINT/SIGTERM shutdown.
   */
  async forceSave(data: AutoSaveData): Promise<void> {
    if (this.isSaving) return; // Prevent concurrent overlapping saves
    this.isSaving = true;

    try {
      // SessionStore.saveSession creates a write stream directly to a new cleanly formatted JSONL payload.
      await this.store.saveSession(
        this.sessionId,
        data.state,
        data.config.provider,
        data.config.model
      );

      this.turnsSinceLastSave = 0;
      this.lastSaveTime = Date.now();
    } catch (err: any) {
      // We explicitly swallow auto-save errors so they don't crash the agent loop.
      // E2B Sandboxes and other critical operations take precedence.
      console.error(`\n[AutoSave Failed] ${err.message}`);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Resets the counter.
   */
  resetTimer(): void {
    this.turnsSinceLastSave = 0;
    this.lastSaveTime = Date.now();
  }
}
