import { SessionTrace } from "./types.js";

/**
 * TraceAnalyzer — reads a SessionTrace and produces actionable insight reports.
 *
 * Analysis capabilities:
 * - Loop detection: Identifies repeated tool call patterns
 * - Cost hotspots: Flags turns that consumed >20% of total tokens
 * - Error clustering: Groups errors by tool
 * - Cache efficiency: Warns if cache hit rate < 70%
 * - Recommendations: Human-readable suggestions for improvement
 */

export interface AnalysisReport {
  /** Human-readable title. */
  title: string;
  /** Key metrics. */
  metrics: Record<string, string | number>;
  /** Detected issues. */
  issues: AnalysisIssue[];
  /** Actionable recommendations. */
  recommendations: string[];
}

export interface AnalysisIssue {
  severity: "info" | "warning" | "critical";
  category: "loop" | "cost" | "error" | "cache" | "performance";
  message: string;
}

export class TraceAnalyzer {
  private trace: SessionTrace;

  constructor(trace: SessionTrace) {
    this.trace = trace;
  }

  /**
   * Run all analysis checks and produce a full report.
   */
  analyze(): AnalysisReport {
    const issues: AnalysisIssue[] = [
      ...this.detectLoops(),
      ...this.detectCostHotspots(),
      ...this.detectCacheIssues(),
      ...this.clusterErrors(),
    ];

    const recommendations = this.generateRecommendations(issues);
    const { summary } = this.trace;

    return {
      title: `Session Analysis: ${this.trace.sessionId}`,
      metrics: {
        "Total Tokens": summary.totalTokens,
        "Prompt Tokens": summary.promptTokens,
        "Completion Tokens": summary.completionTokens,
        "Estimated Cost": `$${summary.totalCost.toFixed(4)}`,
        "Cache Hit Rate": `${(summary.cacheHitRate * 100).toFixed(1)}%`,
        "Tool Calls": summary.toolCallCount,
        "Errors": summary.errorCount,
        "Turns": summary.turnCount,
        "Duration": `${(summary.totalDuration / 1000).toFixed(1)}s`,
      },
      issues,
      recommendations,
    };
  }

  /**
   * Detect repeated identical tool call patterns (potential doom-loops).
   */
  detectLoops(): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];
    const toolCalls = this.trace.events.filter((e) => e.type === "tool_call");

    let consecutiveCount = 1;
    for (let i = 1; i < toolCalls.length; i++) {
      const prev = toolCalls[i - 1];
      const curr = toolCalls[i];

      if (
        prev.data.name === curr.data.name &&
        JSON.stringify(prev.data.args) === JSON.stringify(curr.data.args)
      ) {
        consecutiveCount++;
        if (consecutiveCount >= 3) {
          issues.push({
            severity: "critical",
            category: "loop",
            message: `Doom-loop detected: "${curr.data.name}" called ${consecutiveCount} times consecutively with identical args.`,
          });
        }
      } else {
        consecutiveCount = 1;
      }
    }

    return issues;
  }

  /**
   * Find LLM calls that consumed >20% of total tokens (cost hotspots).
   */
  detectCostHotspots(): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];
    const { totalTokens } = this.trace.summary;

    if (totalTokens === 0) return issues;

    const llmCalls = this.trace.events.filter((e) => e.type === "llm_call");

    llmCalls.forEach((event, index) => {
      const callTokens =
        (event.data.promptTokens || 0) + (event.data.completionTokens || 0);
      const ratio = callTokens / totalTokens;

      if (ratio > 0.2) {
        issues.push({
          severity: "warning",
          category: "cost",
          message: `Turn ${index + 1} consumed ${(ratio * 100).toFixed(0)}% of total tokens (${callTokens} tokens).`,
        });
      }
    });

    return issues;
  }

  /**
   * Warn if cache hit rate is below 70%.
   */
  detectCacheIssues(): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];
    const { cacheHitRate, turnCount } = this.trace.summary;

    // Only relevant if we have enough turns
    if (turnCount >= 3 && cacheHitRate < 0.7) {
      issues.push({
        severity: "warning",
        category: "cache",
        message: `Cache hit rate is ${(cacheHitRate * 100).toFixed(1)}% (below 70% target). This increases cost significantly.`,
      });
    }

    return issues;
  }

  /**
   * Group errors by tool and report clusters.
   */
  clusterErrors(): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];
    const errors = this.trace.events.filter((e) => e.type === "error");

    if (errors.length === 0) return issues;

    const byTool = new Map<string, number>();
    for (const error of errors) {
      const tool = error.data.tool || "unknown";
      byTool.set(tool, (byTool.get(tool) || 0) + 1);
    }

    for (const [tool, count] of byTool) {
      if (count >= 2) {
        issues.push({
          severity: "warning",
          category: "error",
          message: `${count} errors from tool "${tool}" — may indicate a systemic issue.`,
        });
      }
    }

    return issues;
  }

  /**
   * Generate actionable recommendations from detected issues.
   */
  generateRecommendations(issues: AnalysisIssue[]): string[] {
    const recs: string[] = [];

    const hasLoops = issues.some((i) => i.category === "loop");
    const hasCostHotspots = issues.some((i) => i.category === "cost");
    const hasCacheIssues = issues.some((i) => i.category === "cache");
    const hasErrors = issues.some((i) => i.category === "error");

    if (hasLoops) {
      recs.push(
        "Consider lowering the LoopDetectionMiddleware threshold or adding argument variation hints to the system prompt."
      );
    }

    if (hasCostHotspots) {
      recs.push(
        "Consider compacting context earlier — some turns consumed a large share of the token budget."
      );
    }

    if (hasCacheIssues) {
      recs.push(
        "Review the static system prompt prefix — cache misses often indicate the prompt prefix is being mutated between turns."
      );
    }

    if (hasErrors) {
      recs.push(
        "Investigate recurring tool errors — consider adding fallback strategies or better error messages in tool implementations."
      );
    }

    if (issues.length === 0) {
      recs.push("Session looks healthy! No issues detected.");
    }

    return recs;
  }

  /**
   * Format the report as a human-readable string (for CLI output).
   */
  static formatReport(report: AnalysisReport): string {
    const lines: string[] = [];

    lines.push(`\n  ◆ ${report.title}`);
    lines.push("  ─────────────────────────────────────");

    // Metrics
    lines.push("\n  📊 Metrics:");
    for (const [key, value] of Object.entries(report.metrics)) {
      lines.push(`     ${key.padEnd(20)} ${value}`);
    }

    // Issues
    if (report.issues.length > 0) {
      lines.push("\n  ⚠ Issues:");
      for (const issue of report.issues) {
        const icon = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
        lines.push(`     ${icon} [${issue.category}] ${issue.message}`);
      }
    }

    // Recommendations
    lines.push("\n  💡 Recommendations:");
    for (const rec of report.recommendations) {
      lines.push(`     • ${rec}`);
    }

    lines.push("");
    return lines.join("\n");
  }
}
