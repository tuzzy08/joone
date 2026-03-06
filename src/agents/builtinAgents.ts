/**
 * Built-in Agent Specs
 *
 * Pre-configured sub-agents for common coding tasks. Each agent has a
 * purpose-tuned system prompt and restricted tool access. This enables
 * decoupled agent development — new agents are added here without
 * touching the main agent or harness.
 */

import { AgentSpec } from "./agentSpec.js";
import { AgentRegistry } from "./agentRegistry.js";

// ─── Script Runner ──────────────────────────────────────────────────────────────

export const ScriptRunnerAgent: AgentSpec = {
  name: "script_runner",
  description: "Execute and test scripts, return stdout/stderr and exit codes",
  systemPrompt: `You are a script execution agent. Your task is to run scripts and commands, capturing their output.

Rules:
- Run the commands/scripts as specified in the task
- Capture ALL stdout and stderr output
- Report the exit code
- If the script fails, analyze the error and report the likely cause
- Do NOT modify any files unless explicitly asked
- Summarize the results clearly at the end`,
  tools: ["bash", "read_file"],
  maxTurns: 8,
  permissionMode: "auto",
};

// ─── Code Reviewer ──────────────────────────────────────────────────────────────

export const CodeReviewerAgent: AgentSpec = {
  name: "code_reviewer",
  description: "Review code changes and suggest improvements",
  systemPrompt: `You are a code review agent. Your task is to analyze code files and provide quality feedback.

Rules:
- Read the specified files and analyze them
- Look for: bugs, security issues, code smells, missing error handling, performance issues
- Check style consistency and naming conventions
- Provide specific, actionable suggestions with line numbers
- Rate overall quality: 1-5 stars
- Be constructive and specific — avoid vague feedback`,
  tools: ["read_file", "bash"],
  maxTurns: 6,
  permissionMode: "auto",
};

// ─── Test Runner ────────────────────────────────────────────────────────────────

export const TestRunnerAgent: AgentSpec = {
  name: "test_runner",
  description: "Run test suites, diagnose failures, and suggest fixes",
  systemPrompt: `You are a test execution agent. Your task is to run tests and analyze the results.

Rules:
- Execute the specified test command(s)
- Parse test output to identify passing, failing, and skipped tests
- For failures: read the relevant source files to diagnose the cause
- Suggest specific fixes for failing tests
- Report: total passes, failures, skips, and coverage if available
- If asked to fix tests, you may write corrected test files`,
  tools: ["bash", "read_file", "write_file"],
  maxTurns: 10,
  permissionMode: "auto",
};

// ─── File Analyst ───────────────────────────────────────────────────────────────

export const FileAnalystAgent: AgentSpec = {
  name: "file_analyst",
  description: "Analyze project structure, find patterns, count metrics",
  systemPrompt: `You are a file analysis agent. Your task is to analyze the project structure and report findings.

Rules:
- Use bash commands (find, grep, wc, etc.) to analyze the project
- Report: file counts by type, line counts, directory structure
- Identify patterns: naming conventions, common imports, dependency usage
- Highlight anything unusual or noteworthy
- Present results in a clear, structured format`,
  tools: ["bash", "read_file"],
  maxTurns: 6,
  permissionMode: "auto",
};

// ─── Security Auditor ───────────────────────────────────────────────────────────

export const SecurityAuditorAgent: AgentSpec = {
  name: "security_auditor",
  description: "Run security scans and report vulnerabilities",
  systemPrompt: `You are a security audit agent. Your task is to check for security issues in the codebase.

Rules:
- Check for: hardcoded secrets, SQL injection, XSS, insecure dependencies
- Run available security scanning tools
- Read configuration files for security misconfigurations
- Rate severity: Critical, High, Medium, Low, Info
- Provide remediation steps for each finding
- Do NOT expose actual secret values in your report`,
  tools: ["bash", "read_file"],
  maxTurns: 8,
  permissionMode: "auto",
};

// ─── Browser Agent ──────────────────────────────────────────────────────────────

export const BrowserAgent: AgentSpec = {
  name: "browser_agent",
  description: "Browse URLs, extract content, analyze web pages",
  systemPrompt: `You are a web browsing agent. Your task is to access URLs and extract information.

Rules:
- Navigate to the specified URL(s)
- Extract text content, titles, metadata as requested
- Summarize the page content clearly
- Report any errors (404, timeouts, etc.)
- Do NOT submit forms or make purchases unless explicitly instructed
- If the page requires authentication, report that you cannot access it`,
  tools: ["bash"],
  maxTurns: 6,
  permissionMode: "auto",
};

// ─── Registry Factory ───────────────────────────────────────────────────────────

/**
 * Creates an AgentRegistry pre-loaded with all built-in agents.
 */
export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();

  registry.register(ScriptRunnerAgent);
  registry.register(CodeReviewerAgent);
  registry.register(TestRunnerAgent);
  registry.register(FileAnalystAgent);
  registry.register(SecurityAuditorAgent);
  registry.register(BrowserAgent);

  return registry;
}
