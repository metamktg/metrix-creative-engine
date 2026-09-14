import { describe, expect, it } from "vitest";

import { DEFAULT_WAIT_SECONDS, loadConfig } from "../config.js";

describe("loadConfig", () => {
  it("requires an API key and says where to get one", () => {
    expect(() => loadConfig({})).toThrow(/kie.ai\/api-key/);
    expect(() => loadConfig({ KIE_AI_API_KEY: "   " })).toThrow(/KIE_AI_API_KEY is not set/);
  });

  it("defaults everything optional", () => {
    const config = loadConfig({ KIE_AI_API_KEY: "k" });
    expect(config).toEqual({
      apiKey: "k",
      baseUrl: undefined,
      requestTimeoutMs: undefined,
      defaultWaitSeconds: DEFAULT_WAIT_SECONDS,
      downloadDir: null,
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
