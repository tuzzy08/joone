import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SkillMeta } from "./types.js";

/**
 * SkillLoader — discovers and loads skills from multiple directories.
 *
 * Discovery paths (priority order — project overrides user):
 * 1. Project root: ./skills/, ./.agents/skills/, ./.agent/skills/
 * 2. User home: ~/.joone/skills/, ~/.agents/skills/
 *
 * On Windows, ~ resolves to %USERPROFILE%.
 *
 * Skills are folders containing a SKILL.md with YAML frontmatter:
 * ---
 * name: my-skill
 * description: What this skill does
 * ---
 * ## Instructions
 * ...
 */
export class SkillLoader {
  private projectRoot: string;
  private userHome: string;
  private cachedSkills: SkillMeta[] | null = null;

  constructor(projectRoot?: string, userHome?: string) {
    this.projectRoot = projectRoot ?? process.cwd();
    this.userHome = userHome ?? os.homedir();
  }

  /**
   * Returns all skill discovery directories in priority order.
   * Project-level directories come first (higher priority).
   */
  getDiscoveryPaths(): { path: string; source: "project" | "user" }[] {
    const home = this.userHome;

    return [
      // Project-level (highest priority)
      { path: path.join(this.projectRoot, "skills"), source: "project" as const },
      { path: path.join(this.projectRoot, ".agents", "skills"), source: "project" as const },
      { path: path.join(this.projectRoot, ".agent", "skills"), source: "project" as const },
      // User-level
      { path: path.join(home, ".joone", "skills"), source: "user" as const },
      { path: path.join(home, ".agents", "skills"), source: "user" as const },
    ];
  }

  /**
   * Parses YAML frontmatter from a SKILL.md content string.
   * Simple parser — handles `name:` and `description:` fields.
   */
  parseFrontmatter(content: string): { name?: string; description?: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};

    const yaml = match[1];
    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    const descMatch = yaml.match(/^description:\s*(.+)$/m);

    return {
      name: nameMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
    };
  }

  /**
   * Discovers all available skills from all discovery paths.
   * Deduplicates by name — project-level skills override user-level.
   * Results are cached per session.
   */
  discoverSkills(): SkillMeta[] {
    if (this.cachedSkills) return this.cachedSkills;

    const skills = new Map<string, SkillMeta>();
    const paths = this.getDiscoveryPaths();

    for (const { path: dir, source } of paths) {
      if (!fs.existsSync(dir)) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillMdPath = path.join(dir, entry.name, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;

        try {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          const frontmatter = this.parseFrontmatter(content);

          const name = frontmatter.name || entry.name;

          // Only add if not already found (project overrides user)
          if (!skills.has(name)) {
            skills.set(name, {
              name,
              description: frontmatter.description || `Skill: ${name}`,
              path: skillMdPath,
              source,
            });
          }
        } catch {
          // Skip unreadable skills
        }
      }
    }

    this.cachedSkills = Array.from(skills.values());
    return this.cachedSkills;
  }

  /**
   * Loads the full content of a specific skill's SKILL.md.
   * Returns undefined if the skill is not found.
   */
  loadSkill(name: string): string | undefined {
    const skills = this.discoverSkills();
    const skill = skills.find((s) => s.name === name);
    if (!skill) return undefined;

    try {
      return fs.readFileSync(skill.path, "utf-8");
    } catch {
      return undefined;
    }
  }

  /**
   * Clears the cached skills. Call when skills directory contents may have changed.
   */
  clearCache(): void {
    this.cachedSkills = null;
  }
}
