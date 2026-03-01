/**
 * Skill metadata parsed from SKILL.md YAML frontmatter.
 */
export interface SkillMeta {
  /** Human-readable name (from YAML `name` field). */
  name: string;
  /** Short description (from YAML `description` field). */
  description: string;
  /** Absolute path to the SKILL.md file. */
  path: string;
  /** Where this skill was discovered. */
  source: "project" | "user";
}
