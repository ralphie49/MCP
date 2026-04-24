// src/mcp-mapper.ts
// Dynamically computes MCP capabilities for an agent from its existing fields:
// tasks, technologies, domains, and specialization.
//
// No changes to agent.md format needed — everything is inferred.

import type { Agent } from "./types.js";

// ── MCP Capability definition ─────────────────────────────────────────────────

export interface McpCapability {
  tool:        string;   // MCP tool name, e.g. "run_code"
  description: string;   // Human-readable description
  category:    string;   // Grouping: "execution", "file", "data", "search", etc.
  confidence:  "high" | "medium" | "low";
}

export interface AgentMcpProfile {
  agent_id:        string;
  agent_name:      string;
  capabilities:    McpCapability[];
  suggested_tools: string[];   // flat list of tool names for quick use
  mcp_server_hint: string;     // what kind of MCP server this agent best fits
}

// ── Capability inference rules ────────────────────────────────────────────────
//
// Each rule matches on agent fields and emits one or more McpCapability entries.
// Rules are evaluated in order; multiple rules can fire for the same agent.

interface Rule {
  match: (agent: Agent) => boolean;
  capabilities: McpCapability[];
}

// Helper — case-insensitive "any of these words appear in text"
function hasAny(text: string, words: string[]): boolean {
  const t = text.toLowerCase();
  return words.some(w => t.includes(w.toLowerCase()));
}

// Helper — check across all agent text fields at once
function agentHasAny(agent: Agent, words: string[]): boolean {
  const haystack = [
    agent.specialization,
    agent.name,
    agent.description,
    ...agent.technologies,
    ...agent.domains,
    ...agent.tasks.map(t => t.name + " " + t.description),
  ].join(" ");
  return hasAny(haystack, words);
}

const RULES: Rule[] = [
  // ── Code execution ────────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["code", "script", "execute", "run", "compile", "sandbox"]),
    capabilities: [
      { tool: "run_code",      description: "Execute code in a sandboxed environment", category: "execution", confidence: "high" },
      { tool: "lint_code",     description: "Lint and static-analyse source code",      category: "execution", confidence: "medium" },
    ],
  },

  // ── File operations ───────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["file", "document", "write", "read", "generate", "artifact", "output"]),
    capabilities: [
      { tool: "write_file",    description: "Write content to a file on disk",          category: "file", confidence: "high" },
      { tool: "read_file",     description: "Read content from a file",                 category: "file", confidence: "high" },
      { tool: "list_files",    description: "List files in a directory",                category: "file", confidence: "medium" },
    ],
  },

  // ── Git / version control ─────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["git", "github", "gitlab", "version control", "commit", "pull request", "pr", "branch"]),
    capabilities: [
      { tool: "git_commit",    description: "Stage and commit changes to a git repo",   category: "vcs", confidence: "high" },
      { tool: "git_diff",      description: "Show diff of uncommitted changes",         category: "vcs", confidence: "high" },
      { tool: "create_pr",     description: "Open a pull request on GitHub/GitLab",    category: "vcs", confidence: "medium" },
    ],
  },

  // ── CI/CD ─────────────────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["ci", "cd", "pipeline", "deploy", "jenkins", "github actions", "circleci", "build"]),
    capabilities: [
      { tool: "trigger_pipeline", description: "Trigger a CI/CD pipeline run",         category: "cicd", confidence: "high" },
      { tool: "get_build_status", description: "Poll build/pipeline status",           category: "cicd", confidence: "high" },
      { tool: "deploy_artifact",  description: "Deploy a built artifact to an env",    category: "cicd", confidence: "medium" },
    ],
  },

  // ── Infrastructure / cloud ────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["terraform", "aws", "azure", "gcp", "kubernetes", "k8s", "infrastructure", "cloud", "iac"]),
    capabilities: [
      { tool: "provision_resource", description: "Provision cloud infrastructure",     category: "infrastructure", confidence: "high" },
      { tool: "get_resource_state", description: "Read state of cloud resources",      category: "infrastructure", confidence: "high" },
      { tool: "destroy_resource",   description: "Tear down provisioned resources",    category: "infrastructure", confidence: "medium" },
    ],
  },

  // ── Database / data ───────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["database", "sql", "postgres", "mysql", "mongo", "redis", "query", "data", "etl"]),
    capabilities: [
      { tool: "query_db",      description: "Run a SQL / NoSQL query",                 category: "data", confidence: "high" },
      { tool: "write_db",      description: "Insert or update records in a database",  category: "data", confidence: "medium" },
      { tool: "get_schema",    description: "Introspect database schema",              category: "data", confidence: "medium" },
    ],
  },

  // ── Web / HTTP ────────────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["api", "rest", "http", "web", "scrape", "fetch", "request", "endpoint"]),
    capabilities: [
      { tool: "http_request",  description: "Make an outbound HTTP request",           category: "web", confidence: "high" },
      { tool: "parse_html",    description: "Parse and extract data from HTML",        category: "web", confidence: "medium" },
    ],
  },

  // ── Search / embeddings ───────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["search", "embedding", "semantic", "vector", "rag", "retrieval", "index"]),
    capabilities: [
      { tool: "semantic_search", description: "Run a semantic / vector similarity search", category: "search", confidence: "high" },
      { tool: "embed_text",      description: "Generate embeddings for a text input",      category: "search", confidence: "high" },
      { tool: "index_document",  description: "Add a document to the vector index",        category: "search", confidence: "medium" },
    ],
  },

  // ── Testing / QA ─────────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["test", "qa", "quality", "unit test", "e2e", "selenium", "pytest", "jest"]),
    capabilities: [
      { tool: "run_tests",     description: "Execute a test suite and return results",  category: "testing", confidence: "high" },
      { tool: "get_coverage",  description: "Report code coverage metrics",             category: "testing", confidence: "medium" },
    ],
  },

  // ── Monitoring / observability ────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["monitor", "log", "metric", "alert", "observability", "grafana", "datadog", "prometheus"]),
    capabilities: [
      { tool: "query_logs",    description: "Search and retrieve log entries",          category: "observability", confidence: "high" },
      { tool: "get_metrics",   description: "Fetch time-series metrics",                category: "observability", confidence: "high" },
      { tool: "create_alert",  description: "Create or update a monitoring alert rule", category: "observability", confidence: "medium" },
    ],
  },

  // ── Security / compliance ─────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["security", "vulnerability", "scan", "compliance", "pentest", "sast", "dast", "soc"]),
    capabilities: [
      { tool: "run_security_scan", description: "Scan code or infra for vulnerabilities", category: "security", confidence: "high" },
      { tool: "get_cve_info",      description: "Look up CVE details",                    category: "security", confidence: "medium" },
    ],
  },

  // ── Notification / communication ──────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["slack", "email", "notify", "alert", "message", "webhook", "teams"]),
    capabilities: [
      { tool: "send_notification", description: "Send a message via Slack / email / webhook", category: "communication", confidence: "high" },
    ],
  },

  // ── Documentation ─────────────────────────────────────────────────────────
  {
    match: a => agentHasAny(a, ["documentation", "readme", "wiki", "docs", "confluence", "markdown"]),
    capabilities: [
      { tool: "write_file",      description: "Write documentation to a file",         category: "file",  confidence: "high" },
      { tool: "publish_docs",    description: "Publish docs to a docs platform",       category: "docs",  confidence: "medium" },
    ],
  },
];

// ── MCP server category hint ──────────────────────────────────────────────────

function inferServerHint(capabilities: McpCapability[]): string {
  const categories = [...new Set(capabilities.map(c => c.category))];
  if (categories.includes("execution"))      return "code-execution-mcp-server";
  if (categories.includes("infrastructure")) return "infra-automation-mcp-server";
  if (categories.includes("data"))           return "database-mcp-server";
  if (categories.includes("cicd"))           return "devops-mcp-server";
  if (categories.includes("search"))         return "semantic-search-mcp-server";
  if (categories.includes("security"))       return "security-mcp-server";
  if (categories.includes("observability"))  return "monitoring-mcp-server";
  if (categories.includes("vcs"))            return "git-mcp-server";
  if (categories.includes("web"))            return "http-mcp-server";
  return "general-purpose-mcp-server";
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeMcpProfile(agent: Agent): AgentMcpProfile {
  const seen  = new Set<string>();
  const capabilities: McpCapability[] = [];

  for (const rule of RULES) {
    if (!rule.match(agent)) continue;
    for (const cap of rule.capabilities) {
      if (seen.has(cap.tool)) continue;   // deduplicate
      seen.add(cap.tool);
      capabilities.push(cap);
    }
  }

  // Sort: high confidence first, then alphabetical within group
  capabilities.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    const diff  = order[a.confidence] - order[b.confidence];
    return diff !== 0 ? diff : a.tool.localeCompare(b.tool);
  });

  return {
    agent_id:        agent.id,
    agent_name:      agent.name,
    capabilities,
    suggested_tools: capabilities.filter(c => c.confidence === "high").map(c => c.tool),
    mcp_server_hint: inferServerHint(capabilities),
  };
}

// ── Batch: map many agents at once ───────────────────────────────────────────

export function computeMcpProfiles(agents: Agent[]): AgentMcpProfile[] {
  return agents.map(computeMcpProfile);
}