/**
 * Reference documents the client can read directly.
 *
 * These were previously only files in the repository, which meant a model id or
 * a parameter name reached a generation by being copied into a prompt by hand,
 * and went stale in two places at once. As resources they are read from the one
 * source at the moment they are needed.
 *
 * Provider catalogs are dated reference, not live truth: a model validation
 * error means check the current provider page. The production standard is a
 * separate local release contract; it does not change provider API schemas.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import modelCatalog from "../docs/MODEL_CATALOG.md";
import formatRouting from "../skills/metrix-ad-creative/references/format-routing.md";
import productionStandard from "../docs/UGC_PRODUCTION_STANDARD.md";
import ugcCreativePlaybook from "../docs/UGC_CREATIVE_PLAYBOOK.md";
import ugcPreproduction from "../skills/ugc-creator-edit/references/preproduction-director.md";
import ugcPacketTemplate from "../examples/ugc-production/preproduction.example.json";

interface KieResource {
  name: string;
  uri: string;
  title: string;
  description: string;
  body: string;
}

export const KIE_RESOURCES: readonly KieResource[] = [
  {
    name: "kie-ugc-preproduction",
    uri: "kie://ugc-preproduction",
    title: "UGC preproduction contract and incomplete packet template",
    description: "The implemented local packet, exact dependency bindings, guarded submit/recovery semantics and anonymous incomplete JSON template. Read before preparing a creator lip-sync packet; not injected into unrelated prompts and never a claim of actual acceptance.",
    body: `${ugcPreproduction}\n\n## Anonymous incomplete packet template\n\nCopy into a private run and replace pending/null facts with actual evidence. Do not submit this template.\n\n\`\`\`json\n${JSON.stringify(ugcPacketTemplate, null, 2)}\n\`\`\`\n`,
  },
  {
    name: "kie-production-review-standard",
    uri: "kie://production-review-standard",
    title: "UGC and video production review standard",
    description:
      "The evergreen production and presentation gate: audio, music rights, pacing, B-roll quality, technical and IAP variables, messaging, plain-language sound check, editorial peer review and a separate blind review. Agent-side evidence, not provider-side enforcement.",
    body: productionStandard,
  },
  {
    name: "kie-ugc-creative-playbook",
    uri: "kie://ugc-creative-playbook",
    title: "UGC creative direction and feedback playbook",
    description:
      "The detailed UGC and video creative standard: performance, voice, music, captions, B-roll, editing, scoped negative prompts and evidence-based review. Read on demand alongside the short creative-direction prompt; this resource is not injected wholesale into every generation.",
    body: ugcCreativePlaybook,
  },
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
