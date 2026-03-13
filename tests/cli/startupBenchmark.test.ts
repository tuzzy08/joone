import { describe, expect, it } from "vitest";
import { StartupBenchmark } from "../../src/cli/startupBenchmark.js";

describe("StartupBenchmark", () => {
  it("records marks relative to startup", () => {
    const bench = new StartupBenchmark(() => 100);

    bench.mark("entry");
    bench.mark("config", 140);
    bench.mark("interactive", 225);

    expect(bench.report()).toEqual([
      { name: "entry", msFromStart: 0 },
      { name: "config", msFromStart: 40 },
      { name: "interactive", msFromStart: 125 },
    ]);
  });

  it("formats a readable benchmark report", () => {
    const bench = new StartupBenchmark(() => 100);

    bench.mark("entry");
    bench.mark("interactive", 180);

    expect(bench.format("Startup Benchmark")).toContain("Startup Benchmark");
    expect(bench.format("Startup Benchmark")).toContain("entry");
    expect(bench.format("Startup Benchmark")).toContain("interactive");
    expect(bench.format("Startup Benchmark")).toContain("80ms");
  });
});
