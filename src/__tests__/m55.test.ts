import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { BrowserTool } from "../tools/browser.js";
import { WebSearchTool, bindValyuApiKey } from "../tools/webSearch.js";
import { SkillLoader } from "../skills/loader.js";
import {
  SearchSkillsTool,
  LoadSkillTool,
  bindSkillLoader,
} from "../skills/tools.js";
import { ToolRouter, ToolTarget } from "../tools/router.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 5.5a: Browser Tool
// ═══════════════════════════════════════════════════════════════════════════════

describe("BrowserTool", () => {
  // ─── Test #70: Builds navigate command ───

  it("has the correct schema with all supported actions", () => {
    expect(BrowserTool.name).toBe("browser");
    expect(BrowserTool.schema.properties.action.enum).toContain("navigate");
    expect(BrowserTool.schema.properties.action.enum).toContain("snapshot");
    expect(BrowserTool.schema.properties.action.enum).toContain("click");
    expect(BrowserTool.schema.properties.action.enum).toContain("type");
    expect(BrowserTool.schema.properties.action.enum).toContain("screenshot");
    expect(BrowserTool.schema.properties.action.enum).toContain("scroll");
  });

  // ─── Test #71: Rejects without sandbox ───

  it("throws when sandbox is not active", async () => {
    const result = await BrowserTool.execute({ action: "navigate", url: "https://example.com" });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/sandbox/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.5b: Web Search Tool
// ═══════════════════════════════════════════════════════════════════════════════

describe("WebSearchTool", () => {
  // ─── Test #72: Returns error if no API key ───

  it("returns error when API key is not configured", async () => {
    bindValyuApiKey(undefined);
    const result = await WebSearchTool.execute({ query: "test" });

    expect(result.content).toMatch(/api key not configured/i);
  });

  // ─── Test #73: Schema includes all sources ───

  it("schema includes all search sources", () => {
    const sources = WebSearchTool.schema.properties.source.enum;

    expect(sources).toContain("web");
    expect(sources).toContain("papers");
    expect(sources).toContain("finance");
    expect(sources).toContain("patents");
    expect(sources).toContain("sec");
    expect(sources).toContain("companies");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.5c: Skills System
// ═══════════════════════════════════════════════════════════════════════════════

describe("SkillLoader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "joone-skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createSkill = (
    dir: string,
    name: string,
    content: string
  ): void => {
    const skillDir = path.join(dir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  };

  // ─── Test #74: Discovers skills from project root ───

  it("discovers skills from a directory", () => {
    const skillsDir = path.join(tmpDir, "skills");
    createSkill(
      skillsDir,
      "deploy",
      "---\nname: deploy\ndescription: Deploy to Vercel\n---\n## Steps\n1. Run vercel deploy"
    );

    const loader = new SkillLoader(tmpDir);
    const skills = loader.discoverSkills();

    expect(skills.length).toBeGreaterThanOrEqual(1);
    const deploy = skills.find((s) => s.name === "deploy");
    expect(deploy).toBeDefined();
    expect(deploy!.description).toBe("Deploy to Vercel");
    expect(deploy!.source).toBe("project");
  });

  // ─── Test #75: Parses YAML frontmatter ───

  it("parses YAML frontmatter correctly", () => {
    const loader = new SkillLoader(tmpDir);
    const result = loader.parseFrontmatter(
      "---\nname: test-skill\ndescription: A test skill\n---\n# Instructions"
    );

    expect(result.name).toBe("test-skill");
    expect(result.description).toBe("A test skill");
  });

  // ─── Test #76: Project skills override user skills with same name ───

  it("project skills override user-level skills with the same name", () => {
    // Create user-level skill in the mocked home directory (tmpDir)
    const userSkillsDir = path.join(tmpDir, ".joone", "skills");
    createSkill(
      userSkillsDir,
      "deploy",
      "---\nname: deploy\ndescription: User deploy\n---\n"
    );

    // Create project-level skill
    const projectSkillsDir = path.join(tmpDir, "skills");
    createSkill(
      projectSkillsDir,
      "deploy",
      "---\nname: deploy\ndescription: Project deploy\n---\n"
    );

    // Pass tmpDir as both projectRoot and userHome
    const loader = new SkillLoader(tmpDir, tmpDir);
    const skills = loader.discoverSkills();

    const deploy = skills.find((s) => s.name === "deploy");
    expect(deploy).toBeDefined();
    expect(deploy!.source).toBe("project");
    expect(deploy!.description).toBe("Project deploy");

    // Ensure we only discovered one deploy skill
    const deployCount = skills.filter((s) => s.name === "deploy").length;
    expect(deployCount).toBe(1);
  });

  // ─── Test #77: loadSkill reads full content ───

  it("loads the full content of a skill", () => {
    const skillsDir = path.join(tmpDir, "skills");
    const content =
      "---\nname: tdd\ndescription: Test-driven development\n---\n## Red-Green-Refactor\n1. Write failing test";
    createSkill(skillsDir, "tdd", content);

    const loader = new SkillLoader(tmpDir);
    const loaded = loader.loadSkill("tdd");

    expect(loaded).toBe(content);
  });
});

describe("Skills Tools", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "joone-skills-tools-test-"));

    const skillsDir = path.join(tmpDir, "skills");
    const skillDir = path.join(skillsDir, "deploy");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: deploy\ndescription: Deploy to production\n---\n## Steps"
    );

    bindSkillLoader(new SkillLoader(tmpDir));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Test #78: search_skills returns matching skills ───

  it("search_skills finds matching skills", async () => {
    const result = await SearchSkillsTool.execute({ query: "deploy" });

    expect(result.content).toContain("deploy");
    expect(result.content).toContain("production");
  });

  // ─── Test #79: load_skill reads full content ───

  it("load_skill returns the full SKILL.md content", async () => {
    const result = await LoadSkillTool.execute({ name: "deploy" });

    expect(result.content).toContain("## Steps");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routing
// ═══════════════════════════════════════════════════════════════════════════════

describe("ToolRouter (M5.5 additions)", () => {
  const router = new ToolRouter();

  // ─── Test #80: Browser routes to sandbox ───

  it("routes browser to sandbox", () => {
    expect(router.getTarget("browser")).toBe(ToolTarget.SANDBOX);
  });

  // ─── Test #81: web_search routes to host ───

  it("routes web_search to host", () => {
    expect(router.getTarget("web_search")).toBe(ToolTarget.HOST);
  });

  // ─── Test #82: skills tools route to host ───

  it("routes search_skills and load_skill to host", () => {
    expect(router.getTarget("search_skills")).toBe(ToolTarget.HOST);
    expect(router.getTarget("load_skill")).toBe(ToolTarget.HOST);
  });
});
