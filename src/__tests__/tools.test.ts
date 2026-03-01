import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ReadFileTool, WriteFileTool } from "../tools/index.js";

describe("ReadFileTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".joone-tools-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Test #27: Reads a normal file ───

  it("reads a small file and returns its content", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "Hello, world!", "utf-8");

    const result = await ReadFileTool.execute({ path: filePath });

    expect(result.content).toBe("Hello, world!");
  });

  // ─── Test #28: Returns error for non-existent file ───

  it("returns an error message for a non-existent file", async () => {
    const result = await ReadFileTool.execute({
      path: path.join(tmpDir, "nope.txt"),
    });

    expect(result.content).toMatch(/not found/i);
  });

  // ─── Test #29: File size guardrail rejects files over 512KB ───

  it("rejects files larger than 512KB with a descriptive error", async () => {
    const filePath = path.join(tmpDir, "big.txt");
    // Create a 600KB file
    const bigContent = "x".repeat(600 * 1024);
    fs.writeFileSync(filePath, bigContent, "utf-8");

    const result = await ReadFileTool.execute({ path: filePath });

    expect(result.content).toMatch(/too large/i);
    expect(result.content).toMatch(/512/);
  });

  // ─── Test #30: Line range slicing works ───

  it("returns only the requested line range", async () => {
    const filePath = path.join(tmpDir, "lines.txt");
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

    const result = await ReadFileTool.execute({
      path: filePath,
      startLine: 5,
      endLine: 7,
    });

    expect(result.content).toContain("5: Line 5");
    expect(result.content).toContain("6: Line 6");
    expect(result.content).toContain("7: Line 7");
    expect(result.content).not.toContain("4: Line 4");
    expect(result.content).not.toContain("8: Line 8");
  });

  // ─── Test #31: Line count guardrail truncates long files ───

  it("truncates files with more than 2000 lines", async () => {
    const filePath = path.join(tmpDir, "long.txt");
    // Create a file with 2500 short lines (under 512KB)
    const lines = Array.from({ length: 2500 }, (_, i) => `L${i + 1}`);
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

    const result = await ReadFileTool.execute({ path: filePath });

    expect(result.content).toMatch(/truncated at 2000 lines/i);
    expect(result.content).toContain("1: L1");
    expect(result.content).toContain("2000: L2000");
    expect(result.content).not.toContain("2001: L2001");
  });

  // ─── Test #X: Security Guardrail Blocks Outside Files ───

  it("blocks reading files outside the project workspace", async () => {
    // Create a file in the OS tmp directory (guaranteed outside project workspace)
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "joone-outside-"));
    const filePath = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(filePath, "secret token", "utf-8");

    try {
      const result = await ReadFileTool.execute({ path: filePath });
      expect(result.isError).toBe(true);
      expect(result.content).toMatch(/Security Error: Access Denied/i);
      expect(result.content).toMatch(/outside the current project workspace/i);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe("WriteFileTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".joone-write-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Test #32: Writes a file to disk ───

  it("writes content to a file and confirms", async () => {
    const filePath = path.join(tmpDir, "output.ts");

    const result = await WriteFileTool.execute({
      path: filePath,
      content: "const x = 42;",
    });

    expect(result.content).toMatch(/file written/i);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("const x = 42;");
  });

  // ─── Test #33: Creates parent directories if needed ───

  it("creates parent directories if they do not exist", async () => {
    const filePath = path.join(tmpDir, "nested", "deep", "file.ts");

    const result = await WriteFileTool.execute({
      path: filePath,
      content: "export {}",
    });

    expect(result.content).toMatch(/file written/i);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
