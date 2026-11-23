/**
 * kie-ai-mcp-server · an MCP server over the Kie.ai Market job API.
 *
 * Transport is stdio, which means STDOUT BELONGS TO THE PROTOCOL. Every
 * diagnostic in this process goes to stderr; one stray console.log would
 * corrupt the JSON-RPC stream and break the connection.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { KieClient } from "./client.js";
import { loadConfig } from "./config.js";
import { serverInstructions } from "./instructions.js";
import { registerKiePrompts } from "./prompts.js";
import { registerKieResources } from "./resources.js";
import { registerKieTools } from "./tools.js";
import { ENGINE_VERSION } from "./version.js";

export async function main(): Promise<void> {
  const config = loadConfig(process.env);

  const client = new KieClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const server = new McpServer({
    name: "kie-ai-mcp-server",
    version: ENGINE_VERSION,
  }, {
    instructions: serverInstructions(config),
  });

  registerKieTools(server, {
    client,
    defaultWaitSeconds: config.defaultWaitSeconds,
    downloadDir: config.downloadDir,
    ledgerPath: config.ledgerPath,
  });
  // Capabilities are inferred from what is registered, so a server that only
  // registered tools advertised only tools. Reference documents and the render
  // workflow are what the other two primitives are for.
  registerKieResources(server);
  registerKiePrompts(server);

  await server.connect(new StdioServerTransport());
  for (const name of config.ignored) {
    process.stderr.write(`kie-ai-mcp-server: ${name} held an unexpanded \${...} reference and was read as unset\n`);
  }
  process.stderr.write(
    `kie-ai-mcp-server ${ENGINE_VERSION} ready (downloads ${config.downloadDir ? `-> ${config.downloadDir}` : "disabled"}, ledger ${config.ledgerPath ? `-> ${config.ledgerPath}` : "off"}, assets ${config.assetsDir ? `-> ${config.assetsDir}` : "not set"})\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`kie-ai-mcp-server failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
