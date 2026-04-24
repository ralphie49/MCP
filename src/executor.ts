// src/executor.ts
// Executes an agent using the NVIDIA NIM API (free tier, OpenAI-compatible).
//
// Code execution via LOCAL DOCKER — 100% free, no API key, no network needed.
// Requires: Docker Desktop (or Docker Engine) running on your machine.
// Install dockerode:  npm install dockerode @types/dockerode
//
// How it works:
//   1. For each code execution, a throwaway Docker container is spun up.
//   2. The agent's code is written into the container via stdin (tar stream).
//   3. The container runs the code, stdout/stderr are captured.
//   4. The container is killed and removed — nothing persists between runs.
//
// First run: Docker will auto-pull the required image (e.g. python:3.11-slim).
// Subsequent runs use the cached image — very fast.
//
// Get your free NVIDIA key at: https://build.nvidia.com

import Docker from "dockerode";
import { Readable } from "stream";
import * as tar from "tar-stream";
import type {
  Agent,
  ConversationMessage,
  InvokeAgentInput,
  InvokeAgentResult,
} from "./types.js";

// ── NVIDIA config ─────────────────────────────────────────────────────────────

const NVIDIA_API_KEY  = process.env["NVIDIA_API_KEY"] ?? "";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL    = "meta/llama-3.3-70b-instruct";

if (!NVIDIA_API_KEY) {
  console.error("[Executor] WARNING: NVIDIA_API_KEY is not set. invoke_agent will fail.");
}

// ── Docker config ─────────────────────────────────────────────────────────────

// Connects to your local Docker daemon automatically.
// On Mac/Windows: Docker Desktop must be running.
// On Linux:       /var/run/docker.sock must be accessible.
const docker = new Docker();

// Hard limits per container — protects your machine from runaway code
const CONTAINER_TIMEOUT_MS = 15_000;  // kill after 15 seconds
const MEMORY_LIMIT_BYTES   = 128 * 1024 * 1024;  // 128 MB RAM cap
const OUTPUT_MAX_BYTES     = 100_000; // truncate output if agent writes too much

// ── Language → Docker image + run command ─────────────────────────────────────
//
// Each entry defines:
//   image   — the Docker image to pull/use (all are official, small "slim" variants)
//   ext     — file extension for the source file written into the container
//   cmd     — the command array Docker runs inside the container
//
// Images are pulled on first use and cached locally — no re-download after that.

interface LangConfig {
  image: string;
  ext:   string;
  cmd:   (filename: string) => string[];
}

const DOCKER_LANGS: Record<string, LangConfig> = {
  python: {
    image: "python:3.11-slim",
    ext:   "py",
    cmd:   f => ["python3", f],
  },
  javascript: {
    image: "node:20-slim",
    ext:   "js",
    cmd:   f => ["node", f],
  },
  typescript: {
    image: "node:20-slim",
    ext:   "ts",
    // npx tsx is available in node:20-slim after a first-run install
    // We use a small wrapper so no global install is needed
    cmd:   f => ["node", "--input-type=module", "--eval",
      // Inline-transpile TS → JS via a regex strip of type annotations, good enough for simple scripts.
      // For real TS, agents should generate JS instead; this handles basic cases.
      `import{readFileSync}from'fs';const c=readFileSync('${f}','utf8').replace(/:\\s*[\\w<>|&,\\[\\]]+/g,'').replace(/^\\s*export\\s+/gm,'');eval(c);`
    ],
  },
  java: {
    image: "eclipse-temurin:21-jdk-alpine",
    ext:   "java",
    // javac needs the public class name to match the filename.
    // We always write the file as Main.java and wrap if needed.
    cmd:   _f => ["sh", "-c", "javac Main.java && java Main"],
  },
  cpp: {
    image: "gcc:13-bookworm",
    ext:   "cpp",
    cmd:   f => ["sh", "-c", `g++ -O2 -o /tmp/out ${f} && /tmp/out`],
  },
  c: {
    image: "gcc:13-bookworm",
    ext:   "c",
    cmd:   f => ["sh", "-c", `gcc -O2 -o /tmp/out ${f} && /tmp/out`],
  },
  go: {
    image: "golang:1.22-alpine",
    ext:   "go",
    cmd:   f => ["go", "run", f],
  },
  rust: {
    image: "rust:1.77-slim",
    ext:   "rs",
    cmd:   f => ["sh", "-c", `rustc -o /tmp/out ${f} && /tmp/out`],
  },
  bash: {
    image: "bash:5.2",
    ext:   "sh",
    cmd:   f => ["bash", f],
  },
  sql: {
    image: "alpine:3.19",
    ext:   "sql",
    cmd:   f => ["sh", "-c", `apk add -q sqlite && sqlite3 :memory: < ${f}`],
  },
};

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

function buildSystemPrompt(agent: Agent, mode: string, enableExecution: boolean): string {
  const cleaned = agent.rawContent
    .replace(/## 📊 Agent Metrics[\s\S]*?(?=\n## |\n---|\n#[^#]|$)/, "")
    .replace(/## 🔗 Integration Information[\s\S]*?(?=\n## |\n---|\n#[^#]|$)/, "")
    .replace(/## 📝 Reference Information[\s\S]*?(?=\n## |\n---|\n#[^#]|$)/, "")
    .trim();

  const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS["full"]!;

  const executionNote = enableExecution
    ? "\n\nIMPORTANT: Your code will be automatically executed in a Docker sandbox. " +
      "Write complete, runnable code only. Do not use placeholder values. " +
      "If execution results are provided below, use them to fix any errors."
    : "";

  return [
    cleaned,
    "",
    "---",
    "",
    "## 🚀 Active Execution Context",
    "",
    modeInstruction + executionNote,
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

// ── Code extraction ───────────────────────────────────────────────────────────

interface ExtractedCode {
  language: string;
  code:     string;
}

/**
 * Pulls the first fenced code block out of an LLM response.
 * Looks for ```python, ```java, ```javascript, etc.
 */
function extractCode(text: string): ExtractedCode | null {
  const fence = text.match(/```(\w+)?\n([\s\S]*?)```/);
  if (!fence) return null;

  const lang = (fence[1] ?? "python").toLowerCase();
  const code = fence[2]?.trim() ?? "";

  // Map common aliases
  const normalized =
    lang === "py"  ? "python"     :
    lang === "js"  ? "javascript" :
    lang === "ts"  ? "typescript" :
    lang === "sh"  ? "bash"       :
    lang;

  if (!DOCKER_LANGS[normalized]) return null;  // unsupported language
  return { language: normalized, code };
}

// ── Execution result type ────────────────────────────────────────────────────

interface ExecutionResult {
  stdout:      string;
  stderr:      string;
  compile_err: string;
  status:      string;
  time:        string;
  memory:      string;
  language:    string;
}

// ── Build a tar archive containing one file ───────────────────────────────────
// Docker's putArchive API requires a tar stream to write files into a container.

function buildTar(filename: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const buf  = content;

    pack.entry({ name: filename, size: Buffer.byteLength(buf) }, buf, err => {
      if (err) return reject(err);
      pack.finalize();
    });

    const chunks: Buffer[] = [];
    pack.on("data",  chunk => chunks.push(chunk as Buffer));
    pack.on("end",   ()    => resolve(Buffer.concat(chunks)));
    pack.on("error", reject);
  });
}

// ── Collect a Docker stream into a string ────────────────────────────────────
// Docker multiplexes stdout+stderr in a special framed format when TTY=false.
// This demuxes it and returns { stdout, stderr }.

async function collectStream(stream: NodeJS.ReadableStream): Promise<{ stdout: string; stderr: string }> {
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    docker.modem.demuxStream(
      stream as Readable,
      // stdout writable
      {
        write(chunk: Buffer) { stdoutChunks.push(chunk); },
        end() {},
      } as unknown as NodeJS.WritableStream,
      // stderr writable
      {
        write(chunk: Buffer) { stderrChunks.push(chunk); },
        end() {},
      } as unknown as NodeJS.WritableStream,
    );

    stream.on("end",   resolve);
    stream.on("error", reject);
  });

  const truncate = (b: Buffer[]): string => {
    const full = Buffer.concat(b).toString("utf8");
    if (full.length > OUTPUT_MAX_BYTES) {
      return full.slice(0, OUTPUT_MAX_BYTES) + "\n… (output truncated)";
    }
    return full;
  };

  return {
    stdout: truncate(stdoutChunks),
    stderr: truncate(stderrChunks),
  };
}

// ── Ensure the Docker image is available locally ──────────────────────────────
// Pulls only if the image isn't already cached. Logged to stderr so you can
// watch the first-time download progress without polluting MCP output.

const _pulledImages = new Set<string>();

async function ensureImage(image: string): Promise<void> {
  if (_pulledImages.has(image)) return;

  // Check if already present locally
  try {
    await docker.getImage(image).inspect();
    _pulledImages.add(image);
    return;
  } catch {
    // Not found locally — pull it
  }

  console.error(`[Docker] Pulling image: ${image} (first-time only, cached after this)...`);

  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2: Error | null) => {
        if (err2) reject(err2);
        else resolve();
      });
    });
  });

  _pulledImages.add(image);
  console.error(`[Docker] Image ready: ${image}`);
}

// ── Main Docker execution function ───────────────────────────────────────────

async function executeCode(extracted: ExtractedCode): Promise<ExecutionResult> {
  const lang   = DOCKER_LANGS[extracted.language]!;
  const isJava = extracted.language === "java";

  // Java: filename MUST match the public class name. We force it to Main.java
  // and require (or silently wrap) the agent's code to have `class Main { ... }`
  const filename = isJava ? "Main.java" : `main.${lang.ext}`;
  const workdir  = "/code";
  const filepath = `${workdir}/${filename}`;

  const startTime = Date.now();
  let container: Docker.Container | null = null;

  try {
    // 1. Make sure the image exists locally (pulls once, then cached)
    await ensureImage(lang.image);

    // 2. Create a container — no network, read-only root, memory capped
    container = await docker.createContainer({
      Image:      lang.image,
      Cmd:        lang.cmd(filepath),
      WorkingDir: workdir,
      NetworkDisabled: true,          // no internet access from inside the sandbox
      HostConfig: {
        Memory:     MEMORY_LIMIT_BYTES,
        MemorySwap: MEMORY_LIMIT_BYTES, // no swap
        AutoRemove: false,              // we remove manually after reading output
        ReadonlyRootfs: false,          // needs to be writable for compile steps
        CapDrop: ["ALL"],               // drop all Linux capabilities
        SecurityOpt: ["no-new-privileges"],
      },
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    // 3. Write the source file into the container via tar archive
    const archive = await buildTar(filename, extracted.code);
    await container.putArchive(archive, { path: workdir });

    // 4. Attach to output streams BEFORE starting (avoids race conditions)
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    // 5. Start the container
    await container.start();

    // 6. Collect stdout/stderr with a hard timeout
    const outputPromise = collectStream(stream);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Execution timed out")), CONTAINER_TIMEOUT_MS)
    );

    const { stdout, stderr } = await Promise.race([outputPromise, timeoutPromise]);

    // 7. Wait for exit and capture the exit code
    const { StatusCode: exitCode } = await container.wait();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Determine status
    let status = "Accepted";
    if (exitCode !== 0) {
      // Heuristic: if stderr mentions a compile-phase tool, treat as compile error
      const isCompileError =
        /error:|undefined reference|cannot find symbol|SyntaxError|rustc/i.test(stderr) &&
        !stdout;
      status = isCompileError ? "Compilation Error" : "Runtime Error";
    }

    return {
      stdout,
      stderr,
      compile_err: "",   // Docker doesn't separate compile/run — stderr covers both
      status,
      time:    elapsed,
      memory:  "N/A",    // would require docker stats stream; not worth the overhead
      language: extracted.language,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Timeout: the container might still be running — kill it
    if (msg.includes("timed out") && container) {
      try { await container.kill(); } catch { /* already dead */ }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    return {
      stdout:      "",
      stderr:      msg,
      compile_err: "",
      status:      msg.includes("timed out") ? "Time Limit Exceeded" : "System Error",
      time:        elapsed,
      memory:      "N/A",
      language:    extracted.language,
    };

  } finally {
    // 8. Always clean up the container — even on error or timeout
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // Container may already be gone — that's fine
      }
    }
  }
}

// ── Format execution result for the LLM ──────────────────────────────────────

function formatExecutionResult(exec: ExecutionResult): string {
  const lines = [
    `\n\n---`,
    `## ⚙️ Code Execution Result`,
    `- **Language:** ${exec.language}`,
    `- **Status:** ${exec.status}`,
    `- **Time:** ${exec.time}s  |  **Memory:** ${exec.memory}`,
  ];

  if (exec.compile_err) {
    lines.push(`\n**Compile error:**\n\`\`\`\n${exec.compile_err}\n\`\`\``);
  }
  if (exec.stdout) {
    lines.push(`\n**Output:**\n\`\`\`\n${exec.stdout}\n\`\`\``);
  }
  if (exec.stderr) {
    lines.push(`\n**Runtime error / stderr:**\n\`\`\`\n${exec.stderr}\n\`\`\``);
  }
  if (!exec.stdout && !exec.stderr && !exec.compile_err) {
    lines.push(`\n*(no output)*`);
  }

  return lines.join("\n");
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

// ── Single LLM call ───────────────────────────────────────────────────────────

async function callNvidia(messages: ChatMessage[]): Promise<{ text: string; usage: { input: number; output: number } }> {
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
  return {
    text:  data.choices?.[0]?.message?.content ?? "(no response)",
    usage: {
      input:  data.usage?.prompt_tokens     ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function invokeAgent(
  agent: Agent,
  input: InvokeAgentInput
): Promise<InvokeAgentResult> {
  const mode           = resolveMode(agent, input);
  const enableExec     = input.execute_code ?? false;
  const maxRetries     = input.max_retries  ?? 2;
  const systemPrompt   = buildSystemPrompt(agent, mode, enableExec);

  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  // ── Round 1: get the agent response ──────────────────────────────────────

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(input.conversation ?? []).map(m => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: input.message },
  ];

  let { text: responseText, usage } = await callNvidia(messages);
  totalInputTokens  += usage.input;
  totalOutputTokens += usage.output;

  // ── Optional: execute code and retry if there are errors ─────────────────

  let executionResult: ExecutionResult | null = null;

  if (enableExec) {
    const extracted = extractCode(responseText);

    if (extracted) {
      console.error(`[Executor] Running ${extracted.language} code in Docker sandbox...`);

      try {
        executionResult = await executeCode(extracted);
        console.error(`[Executor] Execution status: ${executionResult.status}`);

        const hasError =
          executionResult.compile_err.length > 0 ||
          executionResult.stderr.length > 0 ||
          executionResult.status.toLowerCase().includes("error") ||
          executionResult.status.toLowerCase().includes("exception") ||
          executionResult.status.toLowerCase().includes("exceeded");

        // If there are errors, let the agent fix them (up to maxRetries times)
        let attempt = 0;
        while (hasError && attempt < maxRetries) {
          attempt++;
          console.error(`[Executor] Errors found — asking agent to fix (attempt ${attempt}/${maxRetries})...`);

          const fixPrompt =
            `Your code was executed in a Docker sandbox. Here are the results:` +
            formatExecutionResult(executionResult) +
            `\n\nPlease fix the errors and provide corrected, complete code.`;

          const fixMessages: ChatMessage[] = [
            ...messages,
            { role: "assistant", content: responseText },
            { role: "user",      content: fixPrompt    },
          ];

          const fixed = await callNvidia(fixMessages);
          totalInputTokens  += fixed.usage.input;
          totalOutputTokens += fixed.usage.output;
          responseText = fixed.text;

          // Re-run the fixed code
          const fixedCode = extractCode(responseText);
          if (fixedCode) {
            executionResult = await executeCode(fixedCode);
            console.error(`[Executor] Fixed code status: ${executionResult.status}`);

            const stillHasError =
              executionResult.compile_err.length > 0 ||
              executionResult.stderr.length > 0 ||
              executionResult.status.toLowerCase().includes("error");

            if (!stillHasError) break;  // fixed!
          } else {
            break;  // no code block in fix response
          }
        }

      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        console.error(`[Executor] Code execution failed: ${msg}`);
        // Non-fatal — still return the LLM response, just without execution results
        executionResult = null;
      }
    }
  }

  // ── Build final response ──────────────────────────────────────────────────

  const finalResponse = executionResult
    ? responseText + formatExecutionResult(executionResult)
    : responseText;

  const updatedConversation: ConversationMessage[] = [
    ...(input.conversation ?? []),
    { role: "user",      content: input.message },
    { role: "assistant", content: finalResponse  },
  ];

  return {
    agent_id:         agent.id,
    agent_name:       agent.name,
    mode,
    response:         finalResponse,
    execution_result: executionResult ?? undefined,
    conversation:     updatedConversation,
    usage: {
      input_tokens:  totalInputTokens,
      output_tokens: totalOutputTokens,
    },
  };
}