// src/test-servers.ts
// Tests for all MCP tool logic — run with: npm test
//
// Set GEMINI_API_KEY in your environment before running invoke_agent tests.
// Pass --skip-invoke to skip the live API calls.

import path from "path";
import { fileURLToPath } from "url";
import {
  clearCache,
  getAgent,
  getFilterOptions,
  getRegistryStats,
  listAgents,
  loadAgents,
  matchAgentsByCapability,
} from "./registry.js";
import { invokeAgent } from "./executor.js";
import type { Agent } from "./types.js";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR  = process.env["AGENTS_DIR"] ?? path.join(__dirname, "../../Agents");
const SKIP_INVOKE = process.argv.includes("--skip-invoke");

// ── Mini test runner ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`  ✅ ${name}`); passed++; })
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${name}: ${msg}`);
      failed++;
    });
}

function assert(condition: boolean, msg?: string): void {
  if (!condition) throw new Error(msg ?? "Assertion failed");
}

function assertEqual<T>(a: T, b: T, msg?: string): void {
  if (a !== b) throw new Error(msg ?? `Expected ${String(b)}, got ${String(a)}`);
}

function assertGte(a: number, b: number, msg?: string): void {
  if (a < b) throw new Error(msg ?? `Expected ${a} >= ${b}`);
}



// ── Load ──────────────────────────────────────────────────────────────────────

console.log("\n🧪 Agent Registry MCP Server — TypeScript Tests\n");
console.log(`📂 Loading agents from: ${AGENTS_DIR}`);
clearCache();
const agents: Agent[] = loadAgents(AGENTS_DIR);
console.log(`   Loaded ${agents.length} agents\n`);

// ── 1. Parser ─────────────────────────────────────────────────────────────────
console.log("1️⃣  Parser / Schema Tests");

const a = agents[0]!;

await test("Agent has id",             () => assert(a.id.length > 0, "empty id"));
await test("Agent has name",           () => assert(a.name.length > 0, "empty name"));
await test("Agent has specialization", () => assert(a.specialization.length > 0));
await test("Agent has version",        () => assert(a.version.length > 0));
await test("Agent has rawContent",     () => assert(a.rawContent.length > 0, "rawContent empty"));
await test("Status is valid enum",     () => {
  const valid = ["alpha","beta","rc","stable","deprecated"];
  assert(valid.includes(a.status), `invalid status: ${a.status}`);
});
await test("Grade is valid enum", () => {
  const valid = ["A+","A","B","C","D","F"];
  assert(valid.includes(a.grade), `invalid grade: ${a.grade}`);
});
await test("Score in 0–100",         () => assert(a.score >= 0 && a.score <= 100, `score: ${a.score}`));
await test("Technologies is array",  () => assert(Array.isArray(a.technologies)));
await test("Technologies non-empty", () => assertGte(a.technologies.length, 1));
await test("Tasks is array",         () => assert(Array.isArray(a.tasks)));
await test("Tasks non-empty",        () => assertGte(a.tasks.length, 1));
await test("Task has name+desc+async", () => {
  const t = a.tasks[0]!;
  assert(typeof t.name        === "string");
  assert(typeof t.description === "string");
  assert(typeof t.async       === "boolean");
});

// ── 2. listAgents ─────────────────────────────────────────────────────────────
console.log("\n2️⃣  listAgents Tests");

await test("Returns all agents by default", () => {
  const r = listAgents(agents, {});
  assertEqual(r.pagination.total, agents.length);
});
await test("Filter by specialization", () => {
  const r = listAgents(agents, { specialization: "Code Generation" });
  assert(r.agents.every(a => a.specialization === "Code Generation"));
  assertGte(r.agents.length, 1, "no results");
});
await test("Filter by technology", () => {
  const r = listAgents(agents, { technology: "React" });
  assert(r.agents.every(a => a.technologies.some(t => t.toLowerCase() === "react")));
});
await test("Filter by status stable", () => {
  const r = listAgents(agents, { status: "stable" });
  assert(r.agents.every(a => a.status === "stable"));
});
await test("Filter by grade A+", () => {
  const r = listAgents(agents, { grade: "A+" });
  assert(r.agents.every(a => a.grade === "A+"));
});
await test("Full-text search works", () => {
  const r = listAgents(agents, { search: "security" });
  assertGte(r.agents.length, 1);
  assert(r.agents.every(a =>
    a.name.toLowerCase().includes("security") ||
    a.specialization.toLowerCase().includes("security") ||
    a.technologies.some(t => t.toLowerCase().includes("security")) ||
    a.org.toLowerCase().includes("security")
  ));
});
await test("Sort by score desc (default)", () => {
  const r = listAgents(agents, { sort_by: "score", sort_order: "desc", page_size: 50 });
  for (let i = 1; i < r.agents.length; i++) {
    assert(r.agents[i-1]!.score >= r.agents[i]!.score, "not sorted desc by score");
  }
});
await test("Sort by name asc", () => {
  const r = listAgents(agents, { sort_by: "name", sort_order: "asc", page_size: 50 });
  for (let i = 1; i < r.agents.length; i++) {
    assert(r.agents[i-1]!.name.localeCompare(r.agents[i]!.name) <= 0, "not sorted asc by name");
  }
});
await test("Sort by downloads desc", () => {
  const r = listAgents(agents, { sort_by: "downloads", sort_order: "desc", page_size: 50 });
  for (let i = 1; i < r.agents.length; i++) {
    assert(r.agents[i-1]!.downloads >= r.agents[i]!.downloads, "not sorted desc by downloads");
  }
});
await test("Pagination page 1 and page 2 don't overlap", () => {
  const p1 = listAgents(agents, { page: 1, page_size: 20 });
  const p2 = listAgents(agents, { page: 2, page_size: 20 });
  const ids1 = new Set(p1.agents.map(a => a.id));
  assert(p2.agents.every(a => !ids1.has(a.id)), "pages overlap");
});
await test("Pagination total_pages correct", () => {
  const r = listAgents(agents, { page_size: 10 });
  assertEqual(r.pagination.total_pages, Math.ceil(agents.length / 10));
});
await test("page_size capped at 100", () => {
  const r = listAgents(agents, { page_size: 999 });
  assert(r.agents.length <= 100);
});

// ── 3. getAgent ───────────────────────────────────────────────────────────────
console.log("\n3️⃣  getAgent Tests");

await test("Returns agent for valid ID", () => {
  const found = getAgent(agents, agents[0]!.id);
  assert(found !== null, "not found");
  assertEqual(found!.id, agents[0]!.id);
});
await test("Returns null for unknown ID", () => {
  const found = getAgent(agents, "nonexistent-id-xyz");
  assertEqual(found, null);
});
await test("Returned agent has all fields", () => {
  const found = getAgent(agents, agents[5]!.id);
  assert(found !== null);
  assert(Array.isArray(found!.technologies));
  assert(Array.isArray(found!.tasks));
  assert(typeof found!.score === "number");
  assert(found!.rawContent.length > 0, "rawContent missing");
});

// ── 4. getRegistryStats ───────────────────────────────────────────────────────
console.log("\n4️⃣  getRegistryStats Tests");

const stats = getRegistryStats(agents);

await test("Total equals agent count",           () => assertEqual(stats.total, agents.length));
await test("by_specialization has ≥23 entries",  () => assertGte(Object.keys(stats.by_specialization).length, 23));
await test("by_org has ≥9 entries",              () => assertGte(Object.keys(stats.by_org).length, 9));
await test("by_status covers all 5 statuses",    () => assertGte(Object.keys(stats.by_status).length, 4));
await test("by_grade populated",                 () => assertGte(Object.keys(stats.by_grade).length, 3));
await test("avg_score in 0–100",                 () => assert(stats.avg_score >= 0 && stats.avg_score <= 100));
await test("total_downloads > 0",                () => assertGte(stats.total_downloads, 1));
await test("total_stars > 0",                    () => assertGte(stats.total_stars, 1));
await test("top_technologies capped at 15",      () => assert(Object.keys(stats.top_technologies).length <= 15));
await test("Specialization counts sum to total", () => {
  const sum = Object.values(stats.by_specialization).reduce((a, b) => a + b, 0);
  assertEqual(sum, agents.length);
});

// ── 5. getFilterOptions ───────────────────────────────────────────────────────
console.log("\n5️⃣  getFilterOptions Tests");

const opts = getFilterOptions(agents);

await test("Exactly 23 specializations", () => assertEqual(opts.specializations.length, 23));
await test("Specializations are sorted", () => {
  const sorted = [...opts.specializations].sort();
  assert(JSON.stringify(opts.specializations) === JSON.stringify(sorted), "not sorted");
});
await test("≥36 technologies",           () => assertGte(opts.technologies.length, 36));
await test("Technologies are sorted",    () => {
  const sorted = [...opts.technologies].sort();
  assert(JSON.stringify(opts.technologies) === JSON.stringify(sorted), "not sorted");
});
await test("Exactly 9 orgs",            () => assertEqual(opts.orgs.length, 9));
await test("All 5 statuses included",   () => {
  const required = ["alpha","beta","rc","stable","deprecated"];
  assert(required.every(s => opts.statuses.includes(s as any)), "missing a status");
});
await test("All 6 grades included",     () => {
  const required = ["A+","A","B","C","D","F"];
  assert(required.every(g => opts.grades.includes(g as any)), "missing a grade");
});

// ── 6. matchAgentsByCapability ────────────────────────────────────────────────
console.log("\n6️⃣  matchAgentsByCapability Tests");

await test("Returns matches for 'code generation python'", () => {
  const r = matchAgentsByCapability(agents, "code generation python");
  assertGte(r.matches.length, 1, "no matches");
  assert(r.matches.every(m => m.matchScore > 0));
});
await test("Top match is most relevant for 'security review'", () => {
  const r = matchAgentsByCapability(agents, "security review");
  assertGte(r.matches.length, 1);
  const top = r.matches[0]!;
  assert(
    top.specialization.toLowerCase().includes("security") ||
    top.name.toLowerCase().includes("security"),
    `top match not security-related: ${top.name}`
  );
});
await test("Results are sorted by matchScore desc", () => {
  const r = matchAgentsByCapability(agents, "kubernetes terraform aws devops");
  for (let i = 1; i < r.matches.length; i++) {
    assert(r.matches[i-1]!.matchScore >= r.matches[i]!.matchScore, "not sorted by matchScore");
  }
});
await test("Returns empty array for nonsense query", () => {
  const r = matchAgentsByCapability(agents, "xyzzy_nonexistent_term_12345");
  assertEqual(r.matches.length, 0, `expected 0, got ${r.matches.length}`);
});
await test("Respects max_results", () => {
  const r = matchAgentsByCapability(agents, "code", 5);
  assert(r.matches.length <= 5, `got ${r.matches.length} > 5`);
});
await test("Query is echoed in result", () => {
  const q = "test data generation";
  const r = matchAgentsByCapability(agents, q);
  assertEqual(r.query, q);
});

// ── 7. invokeAgent (live Gemini API) ─────────────────────────────────────────
console.log("\n7️⃣  invokeAgent Tests" + (SKIP_INVOKE ? " (SKIPPED — run without --skip-invoke to enable)" : ""));
if (!SKIP_INVOKE) {
}

if (!SKIP_INVOKE) {
  const testAgent = agents[0]!;

  await test("invoke_agent returns a response string", async () => {
    const result = await invokeAgent(testAgent, {
      agent_id: testAgent.id,
      message:  "Briefly describe what you can do for me in 2 sentences.",
      mode:     "analysis",
    });
    assert(typeof result.response === "string", "response not a string");
    assertGte(result.response.length, 10,       "response too short");
    assertEqual(result.agent_id, testAgent.id,  "agent_id mismatch");
    assertEqual(result.mode,     "analysis",    "mode mismatch");
  });


  await test("invoke_agent conversation history grows correctly", async () => {
    const r1 = await invokeAgent(testAgent, {
      agent_id: testAgent.id,
      message:  "What technologies do you specialise in?",
    });
    assert(r1.conversation.length === 2, `expected 2 turns, got ${r1.conversation.length}`);
    assertEqual(r1.conversation[0]!.role, "user");
    assertEqual(r1.conversation[1]!.role, "assistant");


    const r2 = await invokeAgent(testAgent, {
      agent_id:     testAgent.id,
      message:      "Give me a one-line example using the first technology you mentioned.",
      conversation: r1.conversation,
    });
    assert(r2.conversation.length === 4, `expected 4 turns, got ${r2.conversation.length}`);
  });


  await test("invoke_agent mode override works", async () => {
    const r = await invokeAgent(testAgent, {
      agent_id: testAgent.id,
      message:  "Generate a hello world snippet.",
      mode:     "generation",
    });
    assertEqual(r.mode, "generation");
    assert(r.response.length > 0);
  });


  await test("invoke_agent returns usage stats", async () => {
    const r = await invokeAgent(testAgent, {
      agent_id: testAgent.id,
      message:  "One sentence summary of your purpose.",
    });
    assert(r.usage !== undefined,        "usage missing");
    assertGte(r.usage!.input_tokens, 1,  "no input tokens");
    assertGte(r.usage!.output_tokens, 1, "no output tokens");
  });

  // No API call — just a registry null-check
  await test("invoke_agent returns null for unknown agent id", () => {
    const nullAgent = getAgent(agents, "this-does-not-exist");
    assert(nullAgent === null, "expected null for unknown id");
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("✅ All tests passed!\n");
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} test(s) failed.\n`);
  process.exit(1);
}