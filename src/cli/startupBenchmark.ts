import { performance } from "node:perf_hooks";

export interface StartupBenchmarkEntry {
  name: string;
  msFromStart: number;
}

export class StartupBenchmark {
  private readonly startedAt: number;
  private readonly now: () => number;
  private readonly marks = new Map<string, number>();

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.startedAt = this.now();
  }

  mark(name: string, timestamp: number = this.now()): void {
    this.marks.set(name, timestamp);
  }

  report(): StartupBenchmarkEntry[] {
    return [...this.marks.entries()].map(([name, timestamp]) => ({
      name,
      msFromStart: Math.round(timestamp - this.startedAt),
    }));
  }

  format(title = "Startup Benchmark"): string {
    const lines = [title];

    for (const entry of this.report()) {
      lines.push(`  ${entry.name.padEnd(22, ".")} ${entry.msFromStart}ms`);
    }

    return lines.join("\n");
  }
}
