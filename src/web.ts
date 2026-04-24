// src/web.ts
// Express HTTP server that serves index.html and exposes REST endpoints
// so the frontend can talk directly to the registry + executor logic.
//
// Start with:  npm run web
// Then open:   http://localhost:3000
//
// Env vars:
//   PORT        – HTTP port (default 3000)
//   AGENTS_DIR  – path to your Agents folder (default ../../Agents relative to src/)
//   NVIDIA_API_KEY – required for invoke_agent
//   JUDGE0_API_KEY – optional, raises Judge0 rate limit

import express, { type Request, type Response } from "express";
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

// Serve index.html from the project root (one level up from src/)
const PUBLIC_DIR = path.join(__dirname, "..");
app.use(express.static(PUBLIC_DIR));

// ── Helper ────────────────────────────────────────────────────────────────────

function getAgents() {
  return loadAgents(AGENTS_DIR);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/agents  — list / filter agents
// Query params mirror ListAgentsInput fields:
//   specialization, technology, org, status, grade, search,
//   sort_by, sort_order, page, page_size
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

// GET /api/agents/:id  — single agent details
app.get("/api/agents/:id", (req: Request, res: Response) => {
  try {
    const agent = getAgent(getAgents(), req.params["id"]!);
    if (!agent) return void res.status(404).json({ error: `Agent not found: ${req.params["id"]}` });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/stats  — registry-wide aggregate stats
app.get("/api/stats", (_req: Request, res: Response) => {
  try {
    res.json(getRegistryStats(getAgents()));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/filters  — valid filter dropdown values
app.get("/api/filters", (_req: Request, res: Response) => {
  try {
    res.json(getFilterOptions(getAgents()));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/match  — keyword capability match
// Body: { capability: string, max_results?: number }
app.post("/api/match", (req: Request, res: Response) => {
  try {
    const { capability, max_results } = req.body as MatchAgentsInput;
    if (!capability) return void res.status(400).json({ error: "capability is required" });
    res.json(matchAgentsByCapability(getAgents(), capability, max_results));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/invoke  — run an agent
// Body mirrors InvokeAgentInput (agent_id, message, conversation?, mode?, execute_code?, max_retries?)
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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅ Agent Registry web server running`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Agents dir: ${AGENTS_DIR}`);
  console.log(`   → API base:   http://localhost:${PORT}/api\n`);
});