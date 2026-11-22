import { resolveLedgerPath } from "./ledger.js";

/**
 * Configuration comes from the environment, because that is what an MCP client
 * can set in its server definition (`env` in the client's JSON config).
 *
 * Each setting has up to two sources, and the first one that holds a real value
 * wins:
 *   METRIX_*  what the Claude Code plugin passes from its own options
 *   KIE_AI_*  what a standalone install sets in its environment or client config
 */
export interface ServerConfig {
  apiKey: string;
  baseUrl: string | undefined;
  requestTimeoutMs: number | undefined;
  defaultWaitSeconds: number;
  downloadDir: string | null;
  /** Where the task ledger is appended, or null when it is switched off. */
  ledgerPath: string | null;
  /** Where the user keeps brand kits, references and accepted media, or null when not configured. */
  assetsDir: string | null;
  /** Variables that held an unexpanded `${...}` reference and were read as unset. */
  ignored: string[];
}

export const DEFAULT_WAIT_SECONDS = 300;

/**
 * A client that cannot expand a reference passes it through as text. Claude
 * Code leaves `${KIE_AI_API_KEY}` literal when that variable is unset, and the
 * plugin's `${user_config.runs_dir}` arrives empty when the option is. Read as
 * a key, the literal turns a clear "not set" into a confusing 401; read as a
 * folder, it creates a directory named after the placeholder.
 */
const UNEXPANDED = /\$\{[^}]*\}/;

function reader(env: NodeJS.ProcessEnv, ignored: string[]) {
  return (...names: string[]): string | undefined => {
    for (const name of names) {
      const value = env[name]?.trim();
      if (!value) continue;
      if (UNEXPANDED.test(value)) {
        if (!ignored.includes(name)) ignored.push(name);
        continue;
      }
      return value;
    }
    return undefined;
  };
}

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
  const ignored: string[] = [];
  const read = reader(env, ignored);

  const apiKey = read("METRIX_KIE_API_KEY", "KIE_AI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "KIE_AI_API_KEY is not set, and neither is the plugin's Kie.ai API key option. Create a key at https://kie.ai/api-key, then set it in the plugin's options or pass KIE_AI_API_KEY in the MCP client's server config under `env`.",
    );
  }

  const downloadDir = read("METRIX_RUNS_DIR", "KIE_AI_DOWNLOAD_DIR") ?? null;
  const ledgerSetting = read("KIE_AI_LEDGER_PATH");

  return {
    apiKey,
    baseUrl: read("KIE_AI_BASE_URL"),
    requestTimeoutMs: positiveInt(read("KIE_AI_REQUEST_TIMEOUT_MS"), "KIE_AI_REQUEST_TIMEOUT_MS"),
    defaultWaitSeconds:
      positiveInt(read("KIE_AI_DEFAULT_WAIT_SECONDS"), "KIE_AI_DEFAULT_WAIT_SECONDS") ??
      DEFAULT_WAIT_SECONDS,
    downloadDir,
    ledgerPath: resolveLedgerPath({ KIE_AI_LEDGER_PATH: ledgerSetting }, downloadDir),
    assetsDir: read("METRIX_ASSETS_DIR") ?? null,
    ignored,
  };
}
