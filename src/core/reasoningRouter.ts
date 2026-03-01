/**
 * Reasoning Sandwich — Dynamic Reasoning Router
 *
 * Adjusts the reasoning intensity per turn:
 * - HIGH: Planning, recovery after errors, final verification
 * - MEDIUM: Mechanical code writing, tool-heavy turns
 *
 * We adjust temperature only (not model variant) to preserve prompt cache prefix.
 * See docs/02_edge_cases_and_mitigations.md — "The Mid-Session Model Switch."
 */

export enum ReasoningLevel {
  HIGH = "high",
  MEDIUM = "medium",
}

export interface ReasoningConfig {
  /** Temperature for HIGH reasoning (default: 0). */
  highTemp: number;
  /** Temperature for MEDIUM reasoning (default: 0.2). */
  mediumTemp: number;
  /** Number of initial turns that always use HIGH reasoning (default: 2). */
  planningTurns: number;
}

const DEFAULT_CONFIG: ReasoningConfig = {
  highTemp: 0,
  mediumTemp: 0.2,
  planningTurns: 2,
};

/**
 * Tracks turn context and decides the reasoning level for each step.
 */
export class ReasoningRouter {
  private config: ReasoningConfig;
  private turnCount = 0;
  private lastTurnHadError = false;
  private consecutiveToolTurns = 0;

  constructor(config?: Partial<ReasoningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Advances to the next turn and records the outcome of the previous one.
   * Call exactly once per turn BEFORE querying the level for the new turn.
   *
   * @param hasToolCalls - Whether the previous response contained tool calls.
   * @param hadError - Whether the previous turn resulted in an error.
   */
  advanceTurn(hasToolCalls = false, hadError = false): void {
    this.turnCount++;
    this.lastTurnHadError = hadError;

    if (hadError) {
      this.consecutiveToolTurns = 0;
    } else if (hasToolCalls) {
      this.consecutiveToolTurns++;
    } else {
      this.consecutiveToolTurns = 0;
    }
  }

  /**
   * Determines the reasoning level for the current turn based on state.
   *
   * @returns The recommended reasoning level.
   */
  getLevel(): ReasoningLevel {
    // First N turns → always HIGH (planning phase)
    if (this.turnCount <= this.config.planningTurns) {
      return ReasoningLevel.HIGH;
    }

    // Post-error → HIGH (recovery)
    if (this.lastTurnHadError) {
      return ReasoningLevel.HIGH;
    }

    // Tool-heavy turn → MEDIUM (mechanical work)
    if (this.consecutiveToolTurns > 0) {
      return ReasoningLevel.MEDIUM;
    }

    // No tool calls previously (agent is thinking/planning) → HIGH
    return ReasoningLevel.HIGH;
  }

  /**
   * Returns the temperature setting for a given reasoning level.
   */
  getTemperature(level: ReasoningLevel): number {
    return level === ReasoningLevel.HIGH
      ? this.config.highTemp
      : this.config.mediumTemp;
  }

  /**
   * Convenience: get the recommended temperature for the current turn.
   */
  getRecommendedTemperature(): number {
    return this.getTemperature(this.getLevel());
  }

  /**
   * Returns the current turn count.
   */
  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Resets state. For testing or new sessions.
   */
  reset(): void {
    this.turnCount = 0;
    this.lastTurnHadError = false;
    this.consecutiveToolTurns = 0;
  }
}
