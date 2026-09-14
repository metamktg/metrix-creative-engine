/**
 * kie-ai-mcp-server — an MCP server over the Kie.ai Market job API.
 *
 * Transport is stdio, which means STDOUT BELONGS TO THE PROTOCOL. Every
 * diagnostic in this process goes to stderr; one stray console.log would
 * corrupt the JSON-RPC stream and break the connection.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { KieClient } from "./client.js";
import { loadConfig } from "./config.js";
import { registerKieTools } from "./tools.js";

export async function main(): Promise<void> {
  const config = loadConfig(process.env);

  const client = new KieClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const server = new McpServer({
    name: "kie-ai-mcp-server",
    version: "0.1.0",
  });

  registerKieTools(server, {
    client,
    defaultWaitSeconds: config.defaultWaitSeconds,
    downloadDir: config.downloadDir,
  });

  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `kie-ai-mcp-server ready (downloads ${config.downloadDir ? `-> ${config.downloadDir}` : "disabled"})\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`kie-ai-mcp-server failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
