import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Legacy TUI HITL queue", () => {
  it("queues multiple pending HITL prompts in the Ink app instead of storing only one", () => {
    const source = fs.readFileSync(path.resolve("src/ui/App.tsx"), "utf8");

    expect(source).toContain("pendingHitlPrompts");
    expect(source).toContain("setPendingHitlPrompts((prev) => [");
    expect(source).toContain("prev.filter((prompt) => prompt.id !== id)");
    expect(source).not.toContain("const [hitlQuestion, setHitlQuestion]");
    expect(source).not.toContain("const [hitlPermission, setHitlPermission]");
  });

  it("shows the queue depth in the Ink HITL prompt component", () => {
    const source = fs.readFileSync(
      path.resolve("src/ui/components/HITLPrompt.tsx"),
      "utf8",
    );

    expect(source).toContain("pendingCount");
    expect(source).toContain("Pending prompts:");
  });
});
