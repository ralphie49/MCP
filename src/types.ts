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
  // Raw agent.md content — used by executor to build the system prompt
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

// ── Execution types ────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role:    "user" | "assistant";
  content: string;
}

export interface InvokeAgentInput {
  /** Agent folder ID — same as used in get_agent */
  agent_id:    string;
  /** The user's task / prompt for this agent */
  message:     string;
  /**
   * Optional prior conversation turns for multi-turn sessions.
   * Pass the previous `conversation` array from the last response to continue.
   */
  conversation?: ConversationMessage[];
  /**
   * Override the execution mode defined in agent.md.
   * "analysis"  → recommendations only
   * "generation"→ generate artifacts
   * "full"      → analyse then generate  (default)
   */
  mode?:       "analysis" | "generation" | "full";
}

export interface InvokeAgentResult {
  agent_id:     string;
  agent_name:   string;
  mode:         string;
  response:     string;
  /** Full conversation so far — pass back as `conversation` for the next turn */
  conversation: ConversationMessage[];
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
  total:              number;
  by_specialization:  Record<string, number>;
  by_org:             Record<string, number>;
  by_status:          Record<string, number>;
  by_grade:           Record<string, number>;
  top_technologies:   Record<string, number>;
  avg_score:          number;
  total_downloads:    number;
  total_stars:        number;
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