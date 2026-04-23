// src/registry.ts
// Loads all agent.md files, caches them, and implements all query/filter logic

import fs from "fs";
import path from "path";
import { parseAgentMd } from "./parser.js";
import type {
  Agent,
  AgentGrade,
  AgentStatus,
  AgentWithMatchScore,
  FilterOptions,
  ListAgentsInput,
  ListAgentsResult,
  MatchAgentsResult,
  RegistryStats,
  SortField,
} from "./types.js";

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache: Agent[] | null = null;

export function loadAgents(agentsDir: string): Agent[] {
  if (_cache) return _cache;

  if (!fs.existsSync(agentsDir)) {
    throw new Error(`Agents directory not found: ${agentsDir}`);
  }

  const agents: Agent[] = [];
  const folders = fs.readdirSync(agentsDir);

  for (const folder of folders) {
    const mdPath = path.join(agentsDir, folder, "agent.md");
    if (!fs.existsSync(mdPath)) continue;

    try {
      const content = fs.readFileSync(mdPath, "utf-8");
      agents.push(parseAgentMd(folder, content));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Registry] Parse error in ${folder}: ${msg}`);
    }
  }

  console.error(`[Registry] Loaded ${agents.length} agents from ${agentsDir}`);
  _cache = agents;
  return _cache;
}

/** Bust the cache (useful for hot-reload / testing) */
export function clearCache(): void {
  _cache = null;
}

// ── list_agents ───────────────────────────────────────────────────────────────

export function listAgents(agents: Agent[], input: ListAgentsInput): ListAgentsResult {
  let results = [...agents];

  // Filters
  if (input.specialization) {
    const s = input.specialization.toLowerCase();
    results = results.filter(a => a.specialization.toLowerCase().includes(s));
  }
  if (input.technology) {
    const t = input.technology.toLowerCase();
    results = results.filter(a =>
      a.technologies.some(tech => tech.toLowerCase().includes(t))
    );
  }
  if (input.org) {
    const o = input.org.toLowerCase();
    results = results.filter(a => a.org.toLowerCase().includes(o));
  }
  if (input.status) {
    results = results.filter(a => a.status === input.status);
  }
  if (input.grade) {
    results = results.filter(a => a.grade === input.grade);
  }
  if (input.search) {
    const q = input.search.toLowerCase();
    results = results.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.specialization.toLowerCase().includes(q) ||
      a.org.toLowerCase().includes(q) ||
      a.technologies.some(t => t.toLowerCase().includes(q))
    );
  }

  // Sort
  const sortField: SortField = input.sort_by ?? "score";
  const asc = input.sort_order === "asc";

  results.sort((a, b) => {
    if (sortField === "name") {
      const cmp = a.name.localeCompare(b.name);
      return asc ? cmp : -cmp;
    }
    const diff = (b[sortField] as number) - (a[sortField] as number);
    return asc ? -diff : diff;
  });

  // Paginate
  const page     = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.page_size ?? 20));
  const total    = results.length;
  const start    = (page - 1) * pageSize;
  const sliced   = results.slice(start, start + pageSize);

  return {
    agents: sliced,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  };
}

// ── get_agent ─────────────────────────────────────────────────────────────────

export function getAgent(agents: Agent[], id: string): Agent | null {
  return agents.find(a => a.id === id) ?? null;
}

// ── get_registry_stats ────────────────────────────────────────────────────────

export function getRegistryStats(agents: Agent[]): RegistryStats {
  const stats: RegistryStats = {
    total: agents.length,
    by_specialization: {},
    by_org:            {},
    by_status:         {},
    by_grade:          {},
    top_technologies:  {},
    avg_score:         0,
    total_downloads:   0,
    total_stars:       0,
  };

  let scoreSum = 0;

  for (const a of agents) {
    stats.by_specialization[a.specialization] = (stats.by_specialization[a.specialization] ?? 0) + 1;
    stats.by_org[a.org]                        = (stats.by_org[a.org] ?? 0) + 1;
    stats.by_status[a.status]                  = (stats.by_status[a.status] ?? 0) + 1;
    stats.by_grade[a.grade]                    = (stats.by_grade[a.grade] ?? 0) + 1;
    scoreSum              += a.score;
    stats.total_downloads += a.downloads;
    stats.total_stars     += a.stars;

    for (const tech of a.technologies) {
      stats.top_technologies[tech] = (stats.top_technologies[tech] ?? 0) + 1;
    }
  }

  stats.avg_score = agents.length > 0 ? Math.round(scoreSum / agents.length) : 0;

  // Keep only top 15 technologies
  stats.top_technologies = Object.fromEntries(
    Object.entries(stats.top_technologies)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
  );

  return stats;
}

// ── get_filter_options ────────────────────────────────────────────────────────

export function getFilterOptions(agents: Agent[]): FilterOptions {
  return {
    specializations: [...new Set(agents.map(a => a.specialization))].sort(),
    technologies:    [...new Set(agents.flatMap(a => a.technologies))].sort(),
    orgs:            [...new Set(agents.map(a => a.org))].sort(),
    statuses:        ["alpha", "beta", "rc", "stable", "deprecated"] as AgentStatus[],
    grades:          ["A+", "A", "B", "C", "D", "F"] as AgentGrade[],
  };
}

// ── match_agents_to_capability ────────────────────────────────────────────────

export function matchAgentsByCapability(
  agents: Agent[],
  capability: string,
  maxResults: number = 10
): MatchAgentsResult {
  const words = capability.toLowerCase().split(/\s+/).filter(Boolean);

  const scored: AgentWithMatchScore[] = agents.map(a => {
    let keywordScore = 0;

    for (const word of words) {
      if (a.specialization.toLowerCase().includes(word)) keywordScore += 10;
      if (a.name.toLowerCase().includes(word))           keywordScore += 5;
      for (const tech of a.technologies) {
        if (tech.toLowerCase().includes(word)) keywordScore += 8;
      }
      for (const domain of a.domains) {
        if (domain.toLowerCase().includes(word)) keywordScore += 3;
      }
    }

    // Quality boost only if keywords matched
    const matchScore = keywordScore > 0 ? Math.round(keywordScore + a.score / 20) : 0;
    return { ...a, matchScore };
  });

  const matches = scored
    .filter(a => a.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);

  return { matches, query: capability };
}