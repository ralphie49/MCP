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
import {
  getAgent,
  getFilterOptions,
  getRegistryStats,
  listAgents,
  loadAgents,
  matchAgentsByCapability,
} from "./registry.js";
import type {
  GetAgentInput,
  InvokeAgentInput,
  ListAgentsInput,
  MatchAgentsInput,
} from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = process.env["AGENTS_DIR"] ?? path.join(__dirname, "../../Agents");

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "agent-registry", version: "1.1.0" },
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
              "in a Judge0 sandbox. Real stdout/stderr is returned and fed back to the " +
              "agent so it can self-correct errors. Supports Python, Java, JavaScript, " +
              "TypeScript, Go, Rust, C, C++, Bash, SQL.",
          },
          max_retries: {
            type: "number",
            default: 2,
            description:
              "How many times the agent may attempt to fix its own code after errors. " +
              "Only used when execute_code is true. Default: 2.",
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