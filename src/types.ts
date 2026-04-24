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

// ── Execution types ────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role:    "user" | "assistant";
  content: string;
}

/** Result from running code in the Judge0 sandbox */
export interface CodeExecutionResult {
  stdout:      string;
  stderr:      string;
  compile_err: string;
  status:      string;   // e.g. "Accepted", "Runtime Error", "Compilation Error"
  time:        string;   // seconds
  memory:      string;   // KB
  language:    string;   // e.g. "python", "java"
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
   * "full"      → analyse then generate (default)
   */
  mode?: "analysis" | "generation" | "full";
  /**
   * If true, any code block in the agent's response will be automatically
   * executed in the Judge0 sandbox. Errors are fed back to the agent
   * so it can self-correct (up to max_retries times).
   * Default: false
   */
  execute_code?: boolean;
  /**
   * How many times the agent may attempt to fix its own code after errors.
   * Only used when execute_code is true.
   * Default: 2
   */
  max_retries?: number;
}

export interface InvokeAgentResult {
  agent_id:          string;
  agent_name:        string;
  mode:              string;
  response:          string;
  /** Present only when execute_code was true and code was found in the response */
  execution_result?: CodeExecutionResult;
  /** Full conversation so far — pass back as `conversation` for the next turn */
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