import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { KieClient } from "../client.js";

/**
 * The download path touches the real filesystem and a real socket, so it is
 * exercised against a live loopback server rather than a fetch double: the
 * stream pipeline and the byte count are the things that can break.
 */
const DIR = path.join(process.cwd(), ".vitest-downloads");
let baseUrl = "";
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith("/missing")) {
      res.statusCode = 404;
      res.end("nope");
      return;
    }
    res.setHeader("content-type", "image/png");
    res.end(Buffer.from("PNGBYTES"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rmSync(DIR, { recursive: true, force: true });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(DIR, { recursive: true, force: true });
});

const client = new KieClient({ apiKey: "k" });

describe("downloadResult", () => {
  it("writes the bytes under the URL's filename and creates the directory", async () => {
    const result = await client.downloadResult(`${baseUrl}/renders/out.png?sig=abc`, DIR, {
      fallbackName: "fb",
    });

    expect(path.dirname(result.filePath)).toBe(DIR);
    expect(path.basename(result.filePath)).toBe("out.png");
    expect(result.bytes).toBe(8);
    expect(readFileSync(result.filePath, "utf8")).toBe("PNGBYTES");
  });

  // The configured directory is the boundary. A caller-supplied name full of
  // traversal must land inside it, not one level up.
  it("keeps a hostile filename inside the configured directory", async () => {
    const result = await client.downloadResult(`${baseUrl}/renders/out.png`, DIR, {
      preferredName: "../../escape.png",
      fallbackName: "fb",
    });

    expect(path.dirname(result.filePath)).toBe(DIR);
    expect(path.basename(result.filePath)).toBe("escape.png");
  });

  it("refuses a non-HTTP URL", async () => {
    await expect(
      client.downloadResult("ftp://example.com/x.png", DIR, { fallbackName: "fb" }),
    ).rejects.toThrow(/non-HTTP/);
  });

  it("refuses a malformed URL", async () => {
    await expect(client.downloadResult("not a url", DIR, { fallbackName: "fb" })).rejects.toThrow(
      /not a valid URL/i,
    );
  });

  it("reports a failed download instead of writing an empty file", async () => {
    await expect(
      client.downloadResult(`${baseUrl}/missing.png`, DIR, { fallbackName: "fb" }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
