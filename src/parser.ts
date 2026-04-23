// src/parser.ts
// Parses a single agent.md file into a typed Agent object

import type { Agent, AgentGrade, AgentStatus, AgentTask } from "./types.js";

const VALID_STATUSES = new Set<AgentStatus>(["alpha", "beta", "rc", "stable", "deprecated"]);
const VALID_GRADES   = new Set<AgentGrade>(["A+", "A", "B", "C", "D", "F"]);

/** Extract the first capture group from a regex, returning "" if no match. */
function extract(content: string, pattern: RegExp): string {
  return content.match(pattern)?.[1]?.trim() ?? "";
}

/** Extract a number from a regex capture group, returning 0 if no match. */
function extractInt(content: string, pattern: RegExp): number {
  return parseInt(extract(content, pattern)) || 0;
}

/** Parse a YAML-style list like `["a", "b"]` or `['a', 'b']` */
function parseInlineList(raw: string): string[] {
  return raw
    .split(",")
    .map(s => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

export function parseAgentMd(id: string, content: string): Agent {
  // Inline helpers
  const get  = (re: RegExp) => extract(content, re);
  const getN = (re: RegExp) => extractInt(content, re);

  const name           = get(/^# (.+)/m);
  const specialization = get(/primary: "(.+?)"/);
  const version        = get(/version: "(.+?)"/);
  const description    = get(/description: "(.+?)"/);
  const generatedAt    = get(/Generated: (.+)/);

  // Validated enums — fall back to safe defaults
  const rawStatus = get(/status: "(.+?)"/);
  const status: AgentStatus = VALID_STATUSES.has(rawStatus as AgentStatus)
    ? (rawStatus as AgentStatus)
    : "alpha";

  const rawGrade = get(/\*\*Grade:\*\* (.+)/);
  const grade: AgentGrade = VALID_GRADES.has(rawGrade as AgentGrade)
    ? (rawGrade as AgentGrade)
    : "F";

  const score     = Math.min(100, Math.max(0, getN(/\*\*Jast Score:\*\* (\d+)/)));
  const stars     = getN(/\*\*Stars:\*\* (\d+)/);
  const downloads = getN(/\*\*Total Downloads:\*\* (\d+)/);
  const org       = get(/\*\*Organization:\*\* (.+)/);
  const division  = get(/\*\*Division:\*\* (.+)/);
  const creator   = get(/\*\*Creator:\*\* (.+)/);

  // Technologies from the inline summary line
  const techLine   = content.match(/\*\*Technology:\*\* (.+)/);
  const technologies: string[] = techLine
    ? techLine[1].split(",").map(t => t.trim()).filter(Boolean)
    : [];

  // Domain areas
  const domainMatch = content.match(/domain_specific: \[(.+?)\]/);
  const domains: string[] = domainMatch
    ? parseInlineList(domainMatch[1])
    : [];

  // Tasks — multi-match
  const tasks: AgentTask[] = [];
  for (const m of content.matchAll(/- name: (.+)\n\s+description: (.+)\n\s+async: (true|false)/g)) {
    tasks.push({
      name:        m[1].trim(),
      description: m[2].trim(),
      async:       m[3] === "true",
    });
  }

  // CI/CD systems
  const ciMatch = content.match(/ci_cd_systems: \[(.+?)\]/);
  const ciSystems: string[] = ciMatch ? parseInlineList(ciMatch[1]) : [];

  // Environments
  const envMatch = content.match(/environments: \[(.+?)\]/);
  const environments: string[] = envMatch ? parseInlineList(envMatch[1]) : [];

  return {
    id, name, description, specialization,
    version, status, score, grade,
    stars, downloads, org, division, creator,
    technologies, domains, tasks,
    ciSystems, environments, generatedAt,
    // Store the full raw content so executor.ts can build a system prompt from it
    rawContent: content,
  };
}