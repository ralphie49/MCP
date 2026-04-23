// src/executor.ts
// Executes an agent using the NVIDIA NIM API (free tier, OpenAI-compatible).
//
// Get your free API key at: https://build.nvidia.com
// Set NVIDIA_API_KEY in your environment — it never expires and has generous free credits.

import type {
  Agent,
  ConversationMessage,
  InvokeAgentInput,
  InvokeAgentResult,
} from "./types.js";

const NVIDIA_API_KEY = process.env["NVIDIA_API_KEY"] ?? "";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// meta/llama-3.3-70b-instruct is free, capable, and follows system prompts well.
// Other free options: mistralai/mistral-7b-instruct, microsoft/phi-3-mini-128k-instruct
const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

if (!NVIDIA_API_KEY) {
  console.error("[Executor] WARNING: NVIDIA_API_KEY is not set. invoke_agent will fail.");
}

// ── Execution mode instructions ───────────────────────────────────────────────

const MODE_INSTRUCTIONS: Record<string, string> = {
  analysis:
    "You are operating in ANALYSIS MODE. " +
    "Analyse the user's request, identify requirements, risks, and gaps, " +
    "and provide clear recommendations. Do NOT generate implementation artifacts.",
  generation:
    "You are operating in GENERATION MODE. " +
    "Generate all required artifacts (code, configuration, documentation, tests) " +
    "for the user's request. Skip lengthy analysis — produce complete, working output.",
  full:
    "You are operating in FULL MODE. " +
    "First analyse the requirements briefly, then generate a complete, production-ready solution " +
    "including all artifacts, documentation, and examples.",
};

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(agent: Agent, mode: string): string {
  // Strip registry-only sections that are noise for the LLM
  const cleaned = agent.rawContent
    .replace(/## 📊 Agent Metrics[\s\S]*?(?=\n## |\n---|\n#[^#]|$)/, "")
    .replace(/## 🔗 Integration Information[\s\S]*?(?=\n## |\n---|\n#[^#]|$)/, "")
    .replace(/## 📝 Reference Information[\s\S]*?(?=\n## |\n---|\n#[^#]|$)/, "")
    .trim();

  const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS["full"]!;

  return [
    cleaned,
    "",
    "---",
    "",
    "## 🚀 Active Execution Context",
    "",
    modeInstruction,
    "",
    "Respond only with content relevant to your specialization and the user's request.",
    "Always be thorough, production-ready, and follow every rule defined above.",
  ].join("\n");
}

// ── Resolve execution mode ────────────────────────────────────────────────────

function resolveMode(agent: Agent, input: InvokeAgentInput): string {
  if (input.mode) return input.mode;
  const match = agent.rawContent.match(/mode:\s*"(analysis|generation|full)"/);
  if (match?.[1]) return match[1];
  return "full";
}

// ── NVIDIA / OpenAI-compatible API types ─────────────────────────────────────

interface ChatMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { content: string };
  }>;
  usage?: {
    prompt_tokens:     number;
    completion_tokens: number;
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function invokeAgent(
  agent: Agent,
  input: InvokeAgentInput
): Promise<InvokeAgentResult> {
  const mode         = resolveMode(agent, input);
  const systemPrompt = buildSystemPrompt(agent, mode);

  // Build messages array: system prompt + conversation history + new user message
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(input.conversation ?? []).map(m => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: input.message },
  ];

  const res = await fetch(NVIDIA_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model:       NVIDIA_MODEL,
      messages,
      max_tokens:  4096,
      temperature: 0.7,
      stream:      false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NVIDIA API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as ChatResponse;

  const responseText =
    data.choices?.[0]?.message?.content ?? "(no response)";

  // Build updated conversation history for multi-turn sessions
  const updatedConversation: ConversationMessage[] = [
    ...(input.conversation ?? []),
    { role: "user",      content: input.message  },
    { role: "assistant", content: responseText    },
  ];

  return {
    agent_id:     agent.id,
    agent_name:   agent.name,
    mode,
    response:     responseText,
    conversation: updatedConversation,
    usage: {
      input_tokens:  data.usage?.prompt_tokens     ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}