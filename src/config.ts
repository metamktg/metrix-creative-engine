/**
 * Configuration comes from the environment, because that is what an MCP client
 * can set in its server definition (`env` in the client's JSON config).
 */
export interface ServerConfig {
  apiKey: string;
  baseUrl: string | undefined;
  requestTimeoutMs: number | undefined;
  defaultWaitSeconds: number;
  downloadDir: string | null;
}

export const DEFAULT_WAIT_SECONDS = 300;

function positiveInt(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number, got "${raw}".`);
  }
  return Math.floor(value);
}

/**
 * Read and validate configuration. Throws with an actionable message rather
 * than starting a server that will fail on its first tool call.
 */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const apiKey = env.KIE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "KIE_AI_API_KEY is not set. Create a key at https://kie.ai/api-key and pass it in the MCP client's server config under `env`.",
    );
  }

  const downloadDir = env.KIE_AI_DOWNLOAD_DIR?.trim();

  return {
    apiKey,
    baseUrl: env.KIE_AI_BASE_URL?.trim() || undefined,
    requestTimeoutMs: positiveInt(env.KIE_AI_REQUEST_TIMEOUT_MS, "KIE_AI_REQUEST_TIMEOUT_MS"),
    defaultWaitSeconds:
      positiveInt(env.KIE_AI_DEFAULT_WAIT_SECONDS, "KIE_AI_DEFAULT_WAIT_SECONDS") ??
      DEFAULT_WAIT_SECONDS,
    downloadDir: downloadDir ? downloadDir : null,
  };
}
