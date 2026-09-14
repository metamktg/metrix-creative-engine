/**
 * The MCP tool surface over `KieClient`.
 *
 * Kie.ai's Market API is one generic job endpoint: `model` picks the model and
 * `input` is whatever THAT model documents. Each model's parameters differ
 * (https://docs.kie.ai/market/quickstart says so explicitly), so `input` is a
 * pass-through object rather than a per-model schema invented here — a schema
 * we made up would reject valid calls the day Kie adds a model or a field.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { KieClient } from "./client.js";
import { RESULT_RETENTION_NOTE, summarizeTask, type TaskRecord } from "./protocol.js";

export interface ToolDeps {
  client: KieClient;
  defaultWaitSeconds: number;
  /** Download tool is registered only when the operator configured a directory. */
  downloadDir: string | null;
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function text(...blocks: string[]): ToolResult {
  return { content: blocks.map((block) => ({ type: "text" as const, text: block })) };
}

function failure(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Turn a thrown error into a tool error result. An MCP tool that throws gives
 * the model a protocol-level failure with no detail; an `isError` result keeps
 * the reason readable so it can correct the call itself.
 */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

function taskResult(record: TaskRecord, prefix?: string): ToolResult {
  const summary = prefix ? `${prefix}\n${summarizeTask(record)}` : summarizeTask(record);
  return text(summary, JSON.stringify(record, null, 2));
}

const modelArg = z
  .string()
  .min(1)
  .describe(
    'Kie.ai model identifier, exactly as its page on docs.kie.ai spells it (for example "google/nano-banana").',
  );

const inputArg = z
  .record(z.unknown())
  .describe(
    "Model-specific input object, passed through to Kie.ai unchanged. The accepted fields differ per model — check that model's page on docs.kie.ai.",
  );

export function registerKieTools(server: McpServer, deps: ToolDeps): void {
  const { client, defaultWaitSeconds, downloadDir } = deps;

  const waitArg = z
    .number()
    .int()
    .min(5)
    .max(1800)
    .optional()
    .describe(`How long to wait before giving up, in seconds (default ${defaultWaitSeconds}).`);

  server.registerTool(
    "kie_get_credits",
    {
      title: "Get Kie.ai credit balance",
      description:
        "Read the remaining credit balance on the configured Kie.ai account. Use before a large batch to confirm there is headroom.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      guarded(async () => {
        const credits = await client.getCredits();
        return text(`Remaining Kie.ai credits: ${credits}`);
      }),
  );

  server.registerTool(
    "kie_create_task",
    {
      title: "Create a Kie.ai generation task",
      description:
        "Start a generation task and return its taskId immediately, without waiting. Use this for long jobs you want to poll separately, or when you pass callBackUrl. For a single job you intend to wait on anyway, kie_run_task is one call instead of two.",
      inputSchema: {
        model: modelArg,
        input: inputArg,
        callBackUrl: z
          .string()
          .url()
          .optional()
          .describe("Optional webhook URL Kie.ai calls when the task completes."),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ model, input, callBackUrl }) =>
      guarded(async () => {
        const taskId = await client.createTask({ model, input, callBackUrl });
        return text(
          `Task created: ${taskId}\nModel: ${model}\nThe task is queued, not finished. Poll it with kie_get_task or kie_wait_for_task.`,
        );
      }),
  );

  server.registerTool(
    "kie_get_task",
    {
      title: "Get a Kie.ai task's status",
      description:
        "Read a task's current state in one call, without waiting. States are waiting, queuing, generating, success and fail; result URLs appear only on success.",
      inputSchema: { taskId: z.string().min(1).describe("Task id returned by kie_create_task.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ taskId }) =>
      guarded(async () => taskResult(await client.getTask(taskId))),
  );

  server.registerTool(
    "kie_wait_for_task",
    {
      title: "Wait for a Kie.ai task to finish",
      description:
        "Poll an existing task until it succeeds, fails, or the timeout passes. A timeout is not a failure: the task keeps running on Kie.ai and can be waited on again with the same taskId.",
      inputSchema: {
        taskId: z.string().min(1).describe("Task id returned by kie_create_task."),
        timeoutSeconds: waitArg,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ taskId, timeoutSeconds }) =>
      guarded(async () => {
        const { record, timedOut, polls } = await client.waitForTask(taskId, {
          timeoutMs: (timeoutSeconds ?? defaultWaitSeconds) * 1000,
        });
        const prefix = timedOut
          ? `Still running after ${polls} polls — the timeout passed, not the task. Wait again with the same taskId.`
          : `Settled after ${polls} polls.`;
        return taskResult(record, prefix);
      }),
  );

  server.registerTool(
    "kie_run_task",
    {
      title: "Run a Kie.ai generation and wait for the result",
      description:
        "Create a generation task and poll it to completion in one call. The usual entry point. Returns the result URLs on success; on timeout returns the taskId so the wait can be resumed.",
      inputSchema: {
        model: modelArg,
        input: inputArg,
        timeoutSeconds: waitArg,
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ model, input, timeoutSeconds }) =>
      guarded(async () => {
        const taskId = await client.createTask({ model, input });
        const { record, timedOut, polls } = await client.waitForTask(taskId, {
          timeoutMs: (timeoutSeconds ?? defaultWaitSeconds) * 1000,
        });
        const prefix = timedOut
          ? `Created ${taskId} but it was still running after ${polls} polls. Resume with kie_wait_for_task on that taskId.`
          : `Created ${taskId} and it settled after ${polls} polls.`;
        return taskResult(record, prefix);
      }),
  );

  if (downloadDir) {
    server.registerTool(
      "kie_download_result",
      {
        title: "Download a Kie.ai result to disk",
        description: `Download one result URL into the configured directory (${downloadDir}). ${RESULT_RETENTION_NOTE}`,
        inputSchema: {
          url: z.string().url().describe("A result URL taken from a completed task."),
          filename: z
            .string()
            .optional()
            .describe("Optional name to save under. Sanitized; the directory is fixed by configuration."),
        },
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      async ({ url, filename }) =>
        guarded(async () => {
          const { filePath, bytes } = await client.downloadResult(url, downloadDir, {
            preferredName: filename?.trim(),
            fallbackName: `kie-result-${Date.now()}`,
          });
          return text(`Saved ${bytes} bytes to ${filePath}`);
        }),
    );
  }
}
