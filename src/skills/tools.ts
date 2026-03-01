import { DynamicToolInterface } from "../tools/index.js";
import { SkillLoader } from "./loader.js";

// ─── Shared SkillLoader instance ──────────────────────────────────────────────

let _loader: SkillLoader | null = null;

export function bindSkillLoader(loader: SkillLoader): void {
  _loader = loader;
}

function getLoader(): SkillLoader {
  if (!_loader) {
    _loader = new SkillLoader();
  }
  return _loader;
}

// ─── SearchSkillsTool ───────────────────────────────────────────────────────────

export const SearchSkillsTool: DynamicToolInterface = {
  name: "search_skills",
  description:
    "Search for available skills. Skills provide specialized instructions for specific tasks " +
    "(e.g., deployment workflows, testing strategies, coding patterns).",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query to match against skill names and descriptions (optional — omit to list all)",
      },
    },
  },
  execute: async (args?: { query?: string }) => {
    const loader = getLoader();
    let skills = loader.discoverSkills();

    if (args?.query) {
      const q = args.query.toLowerCase();
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    if (skills.length === 0) {
      return args?.query
        ? `No skills found matching "${args.query}".`
        : "No skills found. Create a skill by adding a folder with SKILL.md to ./skills/ or ~/.joone/skills/.";
    }

    const list = skills
      .map((s) => `- **${s.name}** (${s.source}): ${s.description}`)
      .join("\n");

    return (
      `Found ${skills.length} skill(s):\n${list}\n\n` +
      `To load a skill, call \`load_skill\` with the skill name.`
    );
  },
};

// ─── LoadSkillTool ──────────────────────────────────────────────────────────────

export const LoadSkillTool: DynamicToolInterface = {
  name: "load_skill",
  description:
    "Loads a specific skill's full instructions (SKILL.md content). " +
    "Use search_skills first to discover available skills.",
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name of the skill to load",
      },
    },
    required: ["name"],
  },
  execute: async (args: { name: string }) => {
    const loader = getLoader();
    const content = loader.loadSkill(args.name);

    if (!content) {
      return `Error: Skill "${args.name}" not found. Use search_skills to see available skills.`;
    }

    return content;
  },
};
