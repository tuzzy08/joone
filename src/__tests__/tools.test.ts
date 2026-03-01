import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ReadFileTool, WriteFileTool } from "../tools/index.js";

describe("ReadFileTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "joone-tools-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Test #27: Reads a normal file ───

  it("reads a small file and returns its content", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "Hello, world!", "utf-8");

    const result = await ReadFileTool.execute({ path: filePath });

    expect(result).toBe("Hello, world!");
  });

  // ─── Test #28: Returns error for non-existent file ───

  it("returns an error message for a non-existent file", async () => {
    const result = await ReadFileTool.execute({
      path: path.join(tmpDir, "nope.txt"),
    });

    expect(result).toMatch(/not found/i);
  });

  // ─── Test #29: File size guardrail rejects files over 512KB ───

  it("rejects files larger than 512KB with a descriptive error", async () => {
    const filePath = path.join(tmpDir, "big.txt");
    // Create a 600KB file
    const bigContent = "x".repeat(600 * 1024);
    fs.writeFileSync(filePath, bigContent, "utf-8");

    const result = await ReadFileTool.execute({ path: filePath });

    expect(result).toMatch(/too large/i);
    expect(result).toMatch(/512/);
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

    expect(result).toContain("5: Line 5");
    expect(result).toContain("6: Line 6");
    expect(result).toContain("7: Line 7");
    expect(result).not.toContain("4: Line 4");
    expect(result).not.toContain("8: Line 8");
  });

  // ─── Test #31: Line count guardrail truncates long files ───

  it("truncates files with more than 2000 lines", async () => {
    const filePath = path.join(tmpDir, "long.txt");
    // Create a file with 2500 short lines (under 512KB)
    const lines = Array.from({ length: 2500 }, (_, i) => `L${i + 1}`);
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

    const result = await ReadFileTool.execute({ path: filePath });

    expect(result).toMatch(/truncated at 2000 lines/i);
    expect(result).toContain("1: L1");
    expect(result).toContain("2000: L2000");
    expect(result).not.toContain("2001: L2001");
  });
});

describe("WriteFileTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "joone-write-test-"));
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

    expect(result).toMatch(/file written/i);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("const x = 42;");
  });

  // ─── Test #33: Creates parent directories if needed ───

  it("creates parent directories if they do not exist", async () => {
    const filePath = path.join(tmpDir, "nested", "deep", "file.ts");

    const result = await WriteFileTool.execute({
      path: filePath,
      content: "export {}",
    });

    expect(result).toMatch(/file written/i);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
