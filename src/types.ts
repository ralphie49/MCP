// src/types.ts
// All shared types for the Agent Registry MCP server

export type AgentStatus = "alpha" | "beta" | "rc" | "stable" | "deprecated";
export type AgentGrade  = "A+" | "A" | "B" | "C" | "D" | "F";
export type SortField   = "score" | "stars" | "downloads" | "name";
export type SortOrder   = "asc" | "desc";

export interface AgentTask {
  name:        string;
  description: string;
  async:       boolean;
}

export interface Agent {
  id:             string;
  name:           string;
  description:    string;
  specialization: string;
  version:        string;
  status:         AgentStatus;
  score:          number;
  grade:          AgentGrade;
  stars:          number;
  downloads:      number;
  org:            string;
  division:       string;
  creator:        string;
  technologies:   string[];
  domains:        string[];
  tasks:          AgentTask[];
  ciSystems:      string[];
  environments:   string[];
  generatedAt:    string;
  rawContent:     string;
}

// ── Tool input schemas ─────────────────────────────────────────────────────────

export interface ListAgentsInput {
  specialization?: string;
  technology?:     string;
  org?:            string;
  status?:         AgentStatus;
  grade?:          AgentGrade;
  search?:         string;
  sort_by?:        SortField;
  sort_order?:     SortOrder;
  page?:           number;
  page_size?:      number;
}

export interface GetAgentInput {
  id: string;
}

export interface MatchAgentsInput {
  capability:   string;
  max_results?: number;
}

// ── MCP Capability types ───────────────────────────────────────────────────────

export interface McpCapability {
  tool:        string;
  description: string;
  category:    string;
  confidence:  "high" | "medium" | "low";
}

export interface AgentMcpProfile {
  agent_id:        string;
  agent_name:      string;
  capabilities:    McpCapability[];
  suggested_tools: string[];
  mcp_server_hint: string;
}

export interface GetMcpProfileInput {
  agent_id: string;
}

export interface GetMcpProfilesInput {
  specialization?: string;
  technology?:     string;
  capability?:     string;   // filter profiles that include this MCP tool name
}

// ── Health check types ─────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheck {
  name:    string;
  passed:  boolean;
  message: string;
}

export interface AgentHealthReport {
  agent_id:   string;
  agent_name: string;
  status:     HealthStatus;
  score:      number;
  checks:     HealthCheck[];
  warnings:   string[];
  checked_at: string;
}

export interface RegistryHealthSummary {
  total:      number;
  healthy:    number;
  degraded:   number;
  unhealthy:  number;
  health_pct: number;
  checked_at: string;
}

export interface GetAgentHealthInput {
  agent_id: string;
}

// ── Execution types ────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role:    "user" | "assistant";
  content: string;
}

export interface CodeExecutionResult {
  stdout:      string;
  stderr:      string;
  compile_err: string;
  status:      string;
  time:        string;
  memory:      string;
  language:    string;
}

export interface InvokeAgentInput {
  agent_id:      string;
  message:       string;
  conversation?: ConversationMessage[];
  mode?:         "analysis" | "generation" | "full";
  execute_code?: boolean;
  max_retries?:  number;
}

export interface InvokeAgentResult {
  agent_id:          string;
  agent_name:        string;
  mode:              string;
  response:          string;
  execution_result?: CodeExecutionResult;
  conversation:      ConversationMessage[];
  usage?: {
    input_tokens:  number;
    output_tokens: number;
  };
}

// ── Tool output types ──────────────────────────────────────────────────────────

export interface Pagination {
  page:        number;
  page_size:   number;
  total:       number;
  total_pages: number;
}

export interface ListAgentsResult {
  agents:     Agent[];
  pagination: Pagination;
}

export interface RegistryStats {
  total:             number;
  by_specialization: Record<string, number>;
  by_org:            Record<string, number>;
  by_status:         Record<string, number>;
  by_grade:          Record<string, number>;
  top_technologies:  Record<string, number>;
  avg_score:         number;
  total_downloads:   number;
  total_stars:       number;
}

export interface FilterOptions {
  specializations: string[];
  technologies:    string[];
  orgs:            string[];
  statuses:        AgentStatus[];
  grades:          AgentGrade[];
}

export interface AgentWithMatchScore extends Agent {
  matchScore: number;
}

export interface MatchAgentsResult {
  matches: AgentWithMatchScore[];
  query:   string;
}