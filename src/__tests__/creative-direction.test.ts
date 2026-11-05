import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import creativeDirection from "../../prompts/07-ugc-creative-direction.md";
import creativePlaybook from "../../docs/UGC_CREATIVE_PLAYBOOK.md";
import productionReview from "../../prompts/06-production-review.md";
import { registerKiePrompts } from "../prompts.js";
import { registerKieResources } from "../resources.js";

describe("UGC creative direction over MCP", () => {
  const server = new McpServer({ name: "creative-direction-test", version: "1" });
  const client = new Client({ name: "creative-direction-test", version: "1" });

  beforeAll(async () => {
    registerKiePrompts(server);
    registerKieResources(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it.each(["ugc", "ai_ugc", "video"])("%s loads the short module and preserves the review gates and supplied brief", async (format) => {
    const brief = JSON.stringify({ asset_type: format, brief_id: "direction-test" });
    const result = await client.getPrompt({ name: `kie_render_${format}`, arguments: { brief } });
    const text = result.messages[0]?.content.type === "text" ? result.messages[0].content.text : "";
    expect(creativeDirection.trim().length).toBeGreaterThan(100);
    expect(text).toContain(creativeDirection);
    expect(text).toContain(productionReview);
    expect(text).toContain(brief);
    expect(text).toContain("kie://ugc-creative-playbook");
    expect(text).not.toContain(creativePlaybook);
  });

  it.each(["static", "carousel", "motion_graphic", "claymation", "brand_intake", "mst_sprint"])("%s does not load UGC-specific direction or the full playbook", async (format) => {
    const name = format === "brand_intake" || format === "mst_sprint" ? `kie_${format}` : `kie_render_${format}`;
    const result = await client.getPrompt({ name, arguments: {} });
    const text = result.messages[0]?.content.type === "text" ? result.messages[0].content.text : "";
    expect(text).not.toContain(creativeDirection);
    expect(text).not.toContain(creativePlaybook);
    expect(text).not.toContain("kie://ugc-creative-playbook");
  });

  it("lists and serves the complete playbook as an independent markdown resource", async () => {
    const uri = "kie://ugc-creative-playbook";
    expect((await client.listResources()).resources.map((resource) => resource.uri)).toContain(uri);
    const result = await client.readResource({ uri });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({ uri, mimeType: "text/markdown", text: creativePlaybook });
    expect(creativePlaybook.trim().length).toBeGreaterThan(1000);
  });
});
