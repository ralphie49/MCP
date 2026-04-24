// src/web.ts
// Express HTTP server — serves index.html and REST endpoints.
//
// New endpoints added:
//   GET  /api/agents/:id/mcp-profile   — MCP capability profile for one agent
//   GET  /api/mcp-profiles             — profiles for all (or filtered) agents
//   GET  /api/agents/:id/health        — health check for one agent
//   GET  /api/health                   — registry-wide health summary + reports

import express, { type Request, type Response } from "express";
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
  InvokeAgentInput,
  ListAgentsInput,
  MatchAgentsInput,
} from "./types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = process.env["AGENTS_DIR"] ?? path.join(__dirname, "../../Agents");
const PORT       = parseInt(process.env["PORT"] ?? "3000", 10);

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, "..");
app.use(express.static(PUBLIC_DIR));

function getAgents() {
  return loadAgents(AGENTS_DIR);
}

// ── Original routes ───────────────────────────────────────────────────────────

app.get("/api/agents", (req: Request, res: Response) => {
  try {
    const input: ListAgentsInput = {
      specialization: req.query["specialization"] as string | undefined,
      technology:     req.query["technology"]     as string | undefined,
      org:            req.query["org"]            as string | undefined,
      status:         req.query["status"]         as ListAgentsInput["status"],
      grade:          req.query["grade"]          as ListAgentsInput["grade"],
      search:         req.query["search"]         as string | undefined,
      sort_by:        (req.query["sort_by"]       as ListAgentsInput["sort_by"]) ?? "score",
      sort_order:     (req.query["sort_order"]    as ListAgentsInput["sort_order"]) ?? "desc",
      page:           req.query["page"]      ? parseInt(req.query["page"] as string)      : 1,
      page_size:      req.query["page_size"] ? parseInt(req.query["page_size"] as string) : 200,
    };
    res.json(listAgents(getAgents(), input));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/agents/:id", (req: Request, res: Response) => {
  try {
    const agent = getAgent(getAgents(), req.params["id"]!);
    if (!agent) return void res.status(404).json({ error: `Agent not found: ${req.params["id"]}` });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/stats", (_req: Request, res: Response) => {
  try {
    res.json(getRegistryStats(getAgents()));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/filters", (_req: Request, res: Response) => {
  try {
    res.json(getFilterOptions(getAgents()));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/match", (req: Request, res: Response) => {
  try {
    const { capability, max_results } = req.body as MatchAgentsInput;
    if (!capability) return void res.status(400).json({ error: "capability is required" });
    res.json(matchAgentsByCapability(getAgents(), capability, max_results));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/invoke", async (req: Request, res: Response) => {
  try {
    const input = req.body as InvokeAgentInput;
    if (!input.agent_id) return void res.status(400).json({ error: "agent_id is required" });
    if (!input.message)  return void res.status(400).json({ error: "message is required" });

    const agent = getAgent(getAgents(), input.agent_id);
    if (!agent) return void res.status(404).json({ error: `Agent not found: ${input.agent_id}` });

    const result = await invokeAgent(agent, input);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── MCP Capability mapping routes ─────────────────────────────────────────────

// GET /api/agents/:id/mcp-profile
// Returns the MCP capability profile for a single agent.
// Example: GET /api/agents/org.sel.f07b4618.v1/mcp-profile
app.get("/api/agents/:id/mcp-profile", (req: Request, res: Response) => {
  try {
    const agent = getAgent(getAgents(), req.params["id"]!);
    if (!agent) return void res.status(404).json({ error: `Agent not found: ${req.params["id"]}` });
    res.json(computeMcpProfile(agent));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/mcp-profiles
// Returns profiles for all agents, with optional filters:
//   ?specialization=Code+Generation
//   ?technology=Terraform
//   ?capability=run_code          ← only agents whose profile includes this MCP tool
app.get("/api/mcp-profiles", (req: Request, res: Response) => {
  try {
    let agents = getAgents();

    const spec = req.query["specialization"] as string | undefined;
    const tech = req.query["technology"]     as string | undefined;
    const cap  = req.query["capability"]     as string | undefined;

    if (spec) agents = agents.filter(a => a.specialization.toLowerCase().includes(spec.toLowerCase()));
    if (tech) agents = agents.filter(a => a.technologies.some(t => t.toLowerCase().includes(tech.toLowerCase())));

    let profiles = computeMcpProfiles(agents);

    if (cap) {
      profiles = profiles.filter(p =>
        p.capabilities.some(c => c.tool.toLowerCase().includes(cap.toLowerCase()))
      );
    }

    res.json({ profiles, total: profiles.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Health check routes ───────────────────────────────────────────────────────

// GET /api/agents/:id/health
// Health check for a single agent.
// Example: GET /api/agents/org.sel.f07b4618.v1/health
app.get("/api/agents/:id/health", (req: Request, res: Response) => {
  try {
    const agent = getAgent(getAgents(), req.params["id"]!);
    if (!agent) return void res.status(404).json({ error: `Agent not found: ${req.params["id"]}` });
    res.json(checkAgentHealth(agent));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/health
// Registry-wide health check.
// Optional filter: ?status=degraded  (healthy | degraded | unhealthy | all)
app.get("/api/health", (_req: Request, res: Response) => {
  try {
    const agents               = getAgents();
    const { reports, summary } = checkRegistryHealth(agents);
    const filter               = (_req.query["status"] as string) ?? "all";
    const filtered             = filter === "all" ? reports : reports.filter(r => r.status === filter);
    res.json({ summary, reports: filtered });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅ Agent Registry web server running`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Agents dir: ${AGENTS_DIR}`);
  console.log(`   → API base:   http://localhost:${PORT}/api\n`);
  console.log(`   New endpoints:`);
  console.log(`   → GET  /api/agents/:id/mcp-profile`);
  console.log(`   → GET  /api/mcp-profiles`);
  console.log(`   → GET  /api/agents/:id/health`);
  console.log(`   → GET  /api/health\n`);
});