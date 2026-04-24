// src/server.ts
// Agent Registry MCP Server — entry point

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { fileURLToPath } from "url";

import { invokeAgent } from "./executor.js";
import { checkAgentHealth, checkRegistryHealth } from "./health.js";
import { computeMcpProfile, computeMcpProfiles } from "./mcp-mapper.js";
import {
  getAgent,
  getFilterOptions,
  getRegistryStats,
  listAgents,
  loadAgents,
  matchAgentsByCapability,
} from "./registry.js";
import type {
  GetAgentHealthInput,
  GetAgentInput,
  GetMcpProfileInput,
  GetMcpProfilesInput,
  InvokeAgentInput,
  ListAgentsInput,
  MatchAgentsInput,
} from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = process.env["AGENTS_DIR"] ?? path.join(__dirname, "../../Agents");

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "agent-registry", version: "1.2.0" },
  { capabilities: { tools: {} } }
);

// ── Tool Definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Discovery tools ──────────────────────────────────────────────────────
    {
      name: "list_agents",
      description:
        "List agents with optional filtering by specialization, technology, organization, status, or grade. Returns paginated results.",
      inputSchema: {
        type: "object",
        properties: {
          specialization: { type: "string",  description: "Filter by specialization (e.g. 'Code Generation')" },
          technology:     { type: "string",  description: "Filter by technology (e.g. 'React')" },
          org:            { type: "string",  description: "Filter by organization name" },
          status:         { type: "string",  enum: ["alpha", "beta", "rc", "stable", "deprecated"] },
          grade:          { type: "string",  enum: ["A+", "A", "B", "C", "D", "F"] },
          search:         { type: "string",  description: "Full-text search across name, spec, technologies, org" },
          sort_by:        { type: "string",  enum: ["score", "stars", "downloads", "name"], default: "score" },
          sort_order:     { type: "string",  enum: ["asc", "desc"], default: "desc" },
          page:           { type: "number",  default: 1 },
          page_size:      { type: "number",  default: 20 },
        },
      },
    },
    {
      name: "get_agent",
      description: "Get full details of a single agent by its folder ID.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Agent folder ID (e.g. org.sel.f07b4618.v1)" },
        },
      },
    },
    {
      name: "get_registry_stats",
      description: "Get aggregate statistics for the entire agent registry.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_filter_options",
      description: "Get all valid values for filter dropdowns (specializations, technologies, orgs, statuses, grades).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "match_agents_to_capability",
      description:
        "Given a desired capability description, find the best matching agents using keyword + quality scoring.",
      inputSchema: {
        type: "object",
        required: ["capability"],
        properties: {
          capability:  { type: "string", description: "Describe what you need (e.g. 'infrastructure automation with Terraform and AWS')" },
          max_results: { type: "number", default: 10 },
        },
      },
    },

    // ── MCP Capability mapping tools ─────────────────────────────────────────
    {
      name: "get_agent_mcp_profile",
      description:
        "Get the MCP capability profile for a single agent. " +
        "Returns the list of MCP tools this agent can serve (e.g. run_code, write_file, query_db), " +
        "inferred dynamically from its tasks, technologies, and domains. " +
        "Use this to understand what MCP server capabilities an agent maps to before integrating it.",
      inputSchema: {
        type: "object",
        required: ["agent_id"],
        properties: {
          agent_id: { type: "string", description: "Agent folder ID" },
        },
      },
    },
    {
      name: "get_all_mcp_profiles",
      description:
        "Get MCP capability profiles for all agents (or a filtered subset). " +
        "Useful for building a capability matrix — which agents cover which MCP tools.",
      inputSchema: {
        type: "object",
        properties: {
          specialization: { type: "string", description: "Filter by agent specialization" },
          technology:     { type: "string", description: "Filter by agent technology" },
          capability:     { type: "string", description: "Filter to agents whose MCP profile includes this tool name (e.g. 'run_code')" },
        },
      },
    },

    // ── Health check tools ────────────────────────────────────────────────────
    {
      name: "get_agent_health",
      description:
        "Run a health check on a single agent. " +
        "Validates completeness (required fields, tasks, technologies), " +
        "quality (score, grade), and lifecycle status. " +
        "Returns healthy / degraded / unhealthy with per-check details.",
      inputSchema: {
        type: "object",
        required: ["agent_id"],
        properties: {
          agent_id: { type: "string", description: "Agent folder ID" },
        },
      },
    },
    {
      name: "get_registry_health",
      description:
        "Run health checks across the entire registry. " +
        "Returns a summary (healthy/degraded/unhealthy counts) plus per-agent reports. " +
        "Use this to identify agents that need attention before MCP server registration.",
      inputSchema: {
        type: "object",
        properties: {
          status_filter: {
            type: "string",
            enum: ["healthy", "degraded", "unhealthy", "all"],
            default: "all",
            description: "Return only agents matching this health status",
          },
        },
      },
    },

    // ── Execution tool ────────────────────────────────────────────────────────
    {
      name: "invoke_agent",
      description:
        "Run an agent against a user task. The agent's agent.md defines its persona, rules, " +
        "and execution mode. Pass back the returned `conversation` array to continue a multi-turn session. " +
        "Set execute_code=true to automatically run any code the agent generates in a sandbox " +
        "and let the agent self-correct on errors.",
      inputSchema: {
        type: "object",
        required: ["agent_id", "message"],
        properties: {
          agent_id: {
            type: "string",
            description: "Agent folder ID — same value returned by list_agents / get_agent.",
          },
          message: {
            type: "string",
            description: "The task or question you want the agent to work on.",
          },
          conversation: {
            type: "array",
            description:
              "Optional. Prior conversation turns from a previous invoke_agent call. " +
              "Pass the `conversation` field from the last response to continue the session.",
            items: {
              type: "object",
              required: ["role", "content"],
              properties: {
                role:    { type: "string", enum: ["user", "assistant"] },
                content: { type: "string" },
              },
            },
          },
          mode: {
            type: "string",
            enum: ["analysis", "generation", "full"],
            description:
              "'analysis' = recommendations only, " +
              "'generation' = produce artifacts, " +
              "'full' = analyse then generate (default).",
          },
          execute_code: {
            type: "boolean",
            default: false,
            description:
              "If true, any code block in the agent response is automatically executed " +
              "in a local Docker sandbox.",
          },
          max_retries: {
            type: "number",
            default: 2,
            description: "How many times the agent may attempt to fix its own code after errors.",
          },
        },
      },
    },
  ],
}));

// ── Tool Handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  const agents = loadAgents(AGENTS_DIR);

  try {
    let result: unknown;

    switch (name) {
      case "list_agents":
        result = listAgents(agents, (args ?? {}) as ListAgentsInput);
        break;

      case "get_agent": {
        const input = args as unknown as GetAgentInput;
        const agent = getAgent(agents, input.id);
        result = agent ?? { error: `Agent not found: ${input.id}` };
        break;
      }

      case "get_registry_stats":
        result = getRegistryStats(agents);
        break;

      case "get_filter_options":
        result = getFilterOptions(agents);
        break;

      case "match_agents_to_capability": {
        const input = args as unknown as MatchAgentsInput;
        result = matchAgentsByCapability(agents, input.capability, input.max_results);
        break;
      }

      // ── MCP capability mapping ──────────────────────────────────────────────

      case "get_agent_mcp_profile": {
        const input = args as unknown as GetMcpProfileInput;
        const agent = getAgent(agents, input.agent_id);
        if (!agent) {
          result = { error: `Agent not found: ${input.agent_id}` };
          break;
        }
        result = computeMcpProfile(agent);
        break;
      }

      case "get_all_mcp_profiles": {
        const input  = (args ?? {}) as GetMcpProfilesInput;
        let filtered = [...agents];

        if (input.specialization) {
          const s = input.specialization.toLowerCase();
          filtered = filtered.filter(a => a.specialization.toLowerCase().includes(s));
        }
        if (input.technology) {
          const t = input.technology.toLowerCase();
          filtered = filtered.filter(a =>
            a.technologies.some(tech => tech.toLowerCase().includes(t))
          );
        }

        let profiles = computeMcpProfiles(filtered);

        if (input.capability) {
          const cap = input.capability.toLowerCase();
          profiles = profiles.filter(p =>
            p.capabilities.some(c => c.tool.toLowerCase().includes(cap))
          );
        }

        result = { profiles, total: profiles.length };
        break;
      }

      // ── Health checks ───────────────────────────────────────────────────────

      case "get_agent_health": {
        const input = args as unknown as GetAgentHealthInput;
        const agent = getAgent(agents, input.agent_id);
        if (!agent) {
          result = { error: `Agent not found: ${input.agent_id}` };
          break;
        }
        result = checkAgentHealth(agent);
        break;
      }

      case "get_registry_health": {
        const input        = (args ?? {}) as { status_filter?: string };
        const { reports, summary } = checkRegistryHealth(agents);
        const filter       = input.status_filter ?? "all";
        const filtered     = filter === "all" ? reports : reports.filter(r => r.status === filter);
        result = { summary, reports: filtered };
        break;
      }

      // ── Execution ───────────────────────────────────────────────────────────

      case "invoke_agent": {
        const input = args as unknown as InvokeAgentInput;
        const agent = getAgent(agents, input.agent_id);
        if (!agent) {
          result = { error: `Agent not found: ${input.agent_id}` };
          break;
        }
        result = await invokeAgent(agent, input);
        break;
      }

      default:
        result = { error: `Unknown tool: ${name}` };
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: JSON.stringify({ error: msg }) }] };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[MCP] Agent Registry server running on stdio");