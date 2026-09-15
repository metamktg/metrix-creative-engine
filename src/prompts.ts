/**
 * The render workflow, exposed as MCP prompts.
 *
 * The prompt suite already existed as files. A file is only useful to whoever
 * remembers to open it, and the rule that decides a render is the one a reader
 * skips: the live test that produced a generic unbranded bottle failed because
 * the brand-intake step was never run, not because a model was wrong.
 *
 * A prompt is the primitive for exactly this. Selecting "render a static"
 * assembles the governing rules, the render bridge, that format's module and
 * the final pass into one message, in the order they have to be applied, with
 * nothing left to remember.
 *
 * One prompt per format, because the format is the brief's to declare and the
 * engine's to obey: there is no "render anything" prompt that would let the
 * medium be chosen at render time.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import core from "../prompts/00-core.md";
import brandIntake from "../prompts/01-brand-intake.md";
import renderBridge from "../prompts/02-render-bridge.md";
import selfValidation from "../prompts/04-self-validation.md";
import mst from "../prompts/05-mst.md";
import carousel from "../prompts/formats/carousel.md";
import claymation from "../prompts/formats/claymation.md";
import motionGraphic from "../prompts/formats/motion-graphic.md";
import staticFormat from "../prompts/formats/static.md";
import ugc from "../prompts/formats/ugc.md";
import video from "../prompts/formats/video.md";

/** Keyed by the brief `asset_type` each one serves, so the two cannot drift. */
const FORMAT_MODULES: Record<string, { title: string; module: string }> = {
  static: { title: "static image", module: staticFormat },
  carousel: { title: "carousel", module: carousel },
  video: { title: "video", module: video },
  ugc: { title: "UGC", module: ugc },
  motion_graphic: { title: "motion graphic", module: motionGraphic },
  claymation: { title: "claymation", module: claymation },
};

const briefArg = {
  brief: z
    .string()
    .optional()
    .describe("The creative brief as JSON. Optional: without it the prompt still loads the rules, and the brief is supplied in conversation."),
} as const;

function joined(...sections: string[]): string {
  return sections.join("\n\n---\n\n");
}

function withBrief(body: string, brief?: string): string {
  return brief ? joined(body, `## The brief to render\n\n\`\`\`json\n${brief}\n\`\`\``) : body;
}

function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerKiePrompts(server: McpServer): void {
  for (const [assetType, { title, module }] of Object.entries(FORMAT_MODULES)) {
    server.registerPrompt(
      `kie_render_${assetType}`,
      {
        title: `Render a ${title}`,
        description: `The full render workflow for a brief whose asset_type is "${assetType}": the core rules, the render bridge, the ${title} format module, and the final pass. Use the prompt that matches the brief's declared format; the brief decides the medium, not the renderer.`,
        argsSchema: briefArg,
      },
      ({ brief }) => userMessage(withBrief(joined(core, renderBridge, module, selfValidation), brief)),
    );
  }

  server.registerPrompt(
    "kie_brand_intake",
    {
      title: "Collect the brand kit before rendering",
      description:
        "Establish the product references, brand marks and colours a render needs, and upload them so a model can consume them. Run this BEFORE generating: without it the model invents a plausible generic product, which is what happened on the first live render.",
      argsSchema: briefArg,
    },
    ({ brief }) => userMessage(withBrief(joined(core, brandIntake), brief)),
  );

  server.registerPrompt(
    "kie_mst_sprint",
    {
      title: "Run a Matrix Sprint Test (optional)",
      description:
        "Build and render an MST, a sprint test for validating a hypothesis. OPTIONAL and not a stage every run passes through: a freshly loaded account has no matrix, and creative is never named by its coordinate. Use only when a sprint is actually being run.",
      argsSchema: briefArg,
    },
    ({ brief }) => userMessage(withBrief(joined(core, mst, selfValidation), brief)),
  );
}

export const PROMPT_FORMAT_KEYS = Object.keys(FORMAT_MODULES);
