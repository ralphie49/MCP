// src/health.ts
// Registry-level health checks for agents.
//
// Since agents are not live MCP servers with URLs, "health" here means:
//   1. Is the agent.md complete? (required fields present, valid values)
//   2. Is the agent properly registered? (id, schema, parseable)
//   3. Are there any quality warnings? (low score, deprecated, missing tasks)
//
// This gives Keerthi's MCP server registration story a clear status model
// without needing agents to be running processes.

import type { Agent } from "./types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheck {
  name:    string;
  passed:  boolean;
  message: string;
}

export interface AgentHealthReport {
  agent_id:    string;
  agent_name:  string;
  status:      HealthStatus;
  score:       number;          // 0–100 registry health score (not JAST score)
  checks:      HealthCheck[];
  warnings:    string[];
  checked_at:  string;          // ISO timestamp
}

export interface RegistryHealthSummary {
  total:      number;
  healthy:    number;
  degraded:   number;
  unhealthy:  number;
  health_pct: number;           // % of agents that are healthy
  checked_at: string;
}

// ── Individual checks ─────────────────────────────────────────────────────────

function checkRequired(agent: Agent): HealthCheck {
  const missing: string[] = [];
  if (!agent.name)           missing.push("name");
  if (!agent.specialization) missing.push("specialization");
  if (!agent.description)    missing.push("description");
  if (!agent.version)        missing.push("version");
  if (!agent.org)            missing.push("org");
  if (!agent.creator)        missing.push("creator");

  return missing.length === 0
    ? { name: "required_fields", passed: true,  message: "All required fields present" }
    : { name: "required_fields", passed: false, message: `Missing fields: ${missing.join(", ")}` };
}

function checkTechnologies(agent: Agent): HealthCheck {
  return agent.technologies.length > 0
    ? { name: "technologies",  passed: true,  message: `${agent.technologies.length} technology tag(s) declared` }
    : { name: "technologies",  passed: false, message: "No technologies declared — capability matching will be limited" };
}

function checkTasks(agent: Agent): HealthCheck {
  return agent.tasks.length > 0
    ? { name: "tasks",  passed: true,  message: `${agent.tasks.length} task(s) defined` }
    : { name: "tasks",  passed: false, message: "No tasks defined — MCP tool mapping will be incomplete" };
}

function checkStatus(agent: Agent): HealthCheck {
  if (agent.status === "deprecated") {
    return { name: "lifecycle_status", passed: false, message: "Agent is deprecated and should not be used in new integrations" };
  }
  if (agent.status === "alpha") {
    return { name: "lifecycle_status", passed: true, message: "Agent is in alpha — expect breaking changes" };
  }
  return { name: "lifecycle_status", passed: true, message: `Agent status: ${agent.status}` };
}

function checkScore(agent: Agent): HealthCheck {
  if (agent.score >= 60) {
    return { name: "quality_score", passed: true,  message: `JAST score ${agent.score}/100 meets quality threshold` };
  }
  return { name: "quality_score", passed: false, message: `JAST score ${agent.score}/100 is below minimum threshold of 60` };
}

function checkGrade(agent: Agent): HealthCheck {
  const passing = new Set(["A+", "A", "B"]);
  return passing.has(agent.grade)
    ? { name: "grade", passed: true,  message: `Grade ${agent.grade} is acceptable` }
    : { name: "grade", passed: false, message: `Grade ${agent.grade} indicates quality issues` };
}

function checkRawContent(agent: Agent): HealthCheck {
  return agent.rawContent && agent.rawContent.length > 100
    ? { name: "agent_md_parseable", passed: true,  message: "agent.md is present and parseable" }
    : { name: "agent_md_parseable", passed: false, message: "agent.md content is missing or too short" };
}

function checkDomains(agent: Agent): HealthCheck {
  return agent.domains.length > 0
    ? { name: "domains", passed: true,  message: `${agent.domains.length} domain area(s) declared` }
    : { name: "domains", passed: true,  message: "No domain areas declared (optional)" };
  // Not a failure — domains are optional
}

// ── Aggregate into a health report ───────────────────────────────────────────

export function checkAgentHealth(agent: Agent): AgentHealthReport {
  const checks: HealthCheck[] = [
    checkRequired(agent),
    checkRawContent(agent),
    checkTechnologies(agent),
    checkTasks(agent),
    checkStatus(agent),
    checkScore(agent),
    checkGrade(agent),
    checkDomains(agent),
  ];

  const warnings: string[] = [];
  if (agent.status === "alpha")      warnings.push("Alpha status — not recommended for production MCP integration");
  if (agent.downloads === 0)         warnings.push("Zero downloads — agent may be untested in real workflows");
  if (agent.tasks.length === 0)      warnings.push("No tasks defined — MCP capability inference will be limited");
  if (!agent.division)               warnings.push("No division specified");

  // Count failures (excluding optional checks like domains)
  const criticalChecks = checks.filter(c => c.name !== "domains");
  const failures       = criticalChecks.filter(c => !c.passed).length;
  const total          = criticalChecks.length;

  // Health score: 0–100 based on how many checks pass
  const healthScore = Math.round(((total - failures) / total) * 100);

  // Status thresholds
  const status: HealthStatus =
    failures === 0              ? "healthy"   :
    failures <= 2               ? "degraded"  :
    "unhealthy";

  return {
    agent_id:   agent.id,
    agent_name: agent.name,
    status,
    score:      healthScore,
    checks,
    warnings,
    checked_at: new Date().toISOString(),
  };
}

// ── Batch check ───────────────────────────────────────────────────────────────

export function checkRegistryHealth(agents: Agent[]): {
  reports: AgentHealthReport[];
  summary: RegistryHealthSummary;
} {
  const reports = agents.map(checkAgentHealth);

  const healthy   = reports.filter(r => r.status === "healthy").length;
  const degraded  = reports.filter(r => r.status === "degraded").length;
  const unhealthy = reports.filter(r => r.status === "unhealthy").length;

  return {
    reports,
    summary: {
      total:      agents.length,
      healthy,
      degraded,
      unhealthy,
      health_pct: agents.length > 0 ? Math.round((healthy / agents.length) * 100) : 0,
      checked_at: new Date().toISOString(),
    },
  };
}