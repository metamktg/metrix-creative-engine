import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_WAIT_SECONDS, loadConfig } from "../config.js";
import { ROUTING, serverInstructions } from "../instructions.js";
import { resolveLedgerPath } from "../ledger.js";

describe("loadConfig", () => {
  it("requires an API key and says where to get one", () => {
    expect(() => loadConfig({})).toThrow(/kie.ai\/api-key/);
    expect(() => loadConfig({ KIE_AI_API_KEY: "   " })).toThrow(/KIE_AI_API_KEY is not set/);
    expect(() => loadConfig({})).toThrow(/plugin's Kie.ai API key option/);
  });

  it("defaults everything optional", () => {
    const config = loadConfig({ KIE_AI_API_KEY: "k" });
    expect(config).toEqual({
      apiKey: "k",
      baseUrl: undefined,
      requestTimeoutMs: undefined,
      defaultWaitSeconds: DEFAULT_WAIT_SECONDS,
      downloadDir: null,
      ledgerPath: resolveLedgerPath({}, null),
      assetsDir: null,
      ignored: [],
    });
  });

  it("reads the optional overrides", () => {
    const config = loadConfig({
      KIE_AI_API_KEY: " k ",
      KIE_AI_BASE_URL: "https://proxy.internal",
      KIE_AI_REQUEST_TIMEOUT_MS: "9000",
      KIE_AI_DEFAULT_WAIT_SECONDS: "60",
      KIE_AI_DOWNLOAD_DIR: "/tmp/kie",
    });
    expect(config.apiKey).toBe("k");
    expect(config.baseUrl).toBe("https://proxy.internal");
    expect(config.requestTimeoutMs).toBe(9000);
    expect(config.defaultWaitSeconds).toBe(60);
    expect(config.downloadDir).toBe("/tmp/kie");
  });

  // A typo'd number silently becoming NaN would make every request time out
  // instantly with no explanation.
  it("rejects a non-numeric or non-positive override", () => {
    expect(() => loadConfig({ KIE_AI_API_KEY: "k", KIE_AI_REQUEST_TIMEOUT_MS: "soon" })).toThrow(
      /must be a positive number/,
    );
    expect(() => loadConfig({ KIE_AI_API_KEY: "k", KIE_AI_DEFAULT_WAIT_SECONDS: "0" })).toThrow(
      /must be a positive number/,
    );
  });
});

// The plugin passes its options as METRIX_OPTION_*; the user's environment or a
// standalone client config sets KIE_AI_* and METRIX_ASSETS_DIR.
describe("loadConfig under the plugin", () => {
  it("prefers the plugin's options over the environment", () => {
    const config = loadConfig({
      METRIX_OPTION_KIE_API_KEY: "from-plugin",
      KIE_AI_API_KEY: "from-env",
      METRIX_OPTION_RUNS_DIR: "/runs/plugin",
      KIE_AI_DOWNLOAD_DIR: "./out",
      METRIX_OPTION_ASSETS_DIR: "/assets/plugin",
      METRIX_ASSETS_DIR: "/assets/env",
    });
    expect(config.apiKey).toBe("from-plugin");
    expect(config.downloadDir).toBe("/runs/plugin");
    expect(config.ledgerPath).toBe(path.resolve("/runs/plugin", "kie-ledger.jsonl"));
    expect(config.assetsDir).toBe("/assets/plugin");
  });

  // Claude Code passes an unset option as "", so the environment still answers,
  // the assets folder included: the user's METRIX_ASSETS_DIR is not overwritten.
  it("falls back to the environment when an option is empty", () => {
    const config = loadConfig({
      METRIX_OPTION_KIE_API_KEY: "",
      KIE_AI_API_KEY: "from-env",
      METRIX_OPTION_RUNS_DIR: "  ",
      KIE_AI_DOWNLOAD_DIR: "./out",
      METRIX_OPTION_ASSETS_DIR: "",
      METRIX_ASSETS_DIR: "/assets/env",
    });
    expect(config.apiKey).toBe("from-env");
    expect(config.downloadDir).toBe("./out");
    expect(config.assetsDir).toBe("/assets/env");
    expect(config.ignored).toEqual([]);
    expect(loadConfig({ KIE_AI_API_KEY: "k", METRIX_OPTION_ASSETS_DIR: "" }).assetsDir).toBeNull();
  });

  // Claude Code leaves `${KIE_AI_API_KEY}` literal when the variable is unset.
  // Taken as a key it would turn "not set" into a 401; as a folder it would
  // create a directory named after the placeholder.
  it("reads an unexpanded reference as unset and reports it", () => {
    expect(() => loadConfig({ KIE_AI_API_KEY: "${KIE_AI_API_KEY}" })).toThrow(/KIE_AI_API_KEY is not set/);
    const config = loadConfig({
      METRIX_OPTION_KIE_API_KEY: "${user_config.kie_api_key}",
      KIE_AI_API_KEY: "k",
      METRIX_OPTION_RUNS_DIR: "${user_config.runs_dir}",
      KIE_AI_DOWNLOAD_DIR: "${CLAUDE_PLUGIN_DATA}/out",
      KIE_AI_LEDGER_PATH: "${KIE_AI_LEDGER_PATH}",
    });
    expect(config.apiKey).toBe("k");
    expect(config.downloadDir).toBeNull();
    expect(config.ledgerPath).toBe(resolveLedgerPath({}, null));
    expect(config.ignored).toEqual(["METRIX_OPTION_KIE_API_KEY", "METRIX_OPTION_RUNS_DIR", "KIE_AI_DOWNLOAD_DIR", "KIE_AI_LEDGER_PATH"]);
  });

  it("still switches the ledger off on request", () => {
    expect(loadConfig({ KIE_AI_API_KEY: "k", METRIX_OPTION_RUNS_DIR: "/runs", KIE_AI_LEDGER_PATH: "off" }).ledgerPath).toBeNull();
  });
});

describe("serverInstructions", () => {
  it("keeps the routing text and states both folders, resolved", () => {
    const text = serverInstructions({ downloadDir: "./out", assetsDir: "brand" });
    expect(text.startsWith(ROUTING)).toBe(true);
    expect(text).toContain(`Runs folder: ${path.resolve("./out")}.`);
    expect(text).toContain(`Assets folder: ${path.resolve("brand")}.`);
  });

  it("says plainly when a folder is not set", () => {
    const text = serverInstructions({ downloadDir: null, assetsDir: null });
    expect(text).toContain("Runs folder: not set, so downloads are off.");
    expect(text).toContain("Assets folder: not set.");
  });
});
