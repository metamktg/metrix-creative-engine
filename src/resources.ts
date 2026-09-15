/**
 * Reference documents the client can read directly.
 *
 * These were previously only files in the repository, which meant a model id or
 * a parameter name reached a generation by being copied into a prompt by hand,
 * and went stale in two places at once. As resources they are read from the one
 * source at the moment they are needed.
 *
 * Both are DATED reference, not truth: Kie adds and renames models often, and
 * each document says when it was read. A validation error on a model id means
 * check the live page, not that the call was malformed.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import modelCatalog from "../docs/MODEL_CATALOG.md";
import formatRouting from "../skills/metrix-ad-creative/references/format-routing.md";

interface KieResource {
  name: string;
  uri: string;
  title: string;
  description: string;
  body: string;
}

export const KIE_RESOURCES: readonly KieResource[] = [
  {
    name: "kie-model-catalog",
    uri: "kie://model-catalog",
    title: "Kie.ai model catalog",
    description:
      "Every model id read from the OpenAPI specs Kie embeds in its docs pages, with the per-model aspect-ratio and image-input field names, the known docs bugs, and what is not on the platform. Read this before choosing a model or naming a parameter.",
    body: modelCatalog,
  },
  {
    name: "kie-format-routing",
    uri: "kie://format-routing",
    title: "Brief asset_type to model routing",
    description:
      "The handoff contract: which format module and which eligible model set each brief asset_type routes to, the required parameters per format, and the rule that an unmapped asset_type stops rather than falling back to the nearest neighbour.",
    body: formatRouting,
  },
] as const;

export function registerKieResources(server: McpServer): void {
  for (const resource of KIE_RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: resource.body }],
      }),
    );
  }
}
