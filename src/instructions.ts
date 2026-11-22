/**
 * The handshake instructions. Kept apart from index.ts, which starts the server
 * the moment it is imported, so the text can be tested without a transport.
 */
import path from "node:path";

import type { ServerConfig } from "./config.js";

export const ROUTING =
  "For finished creator-led UGC, AI-UGC or video, load the matching kie_render_ugc, kie_render_ai_ugc or kie_render_video prompt before creative work. Read kie://ugc-creative-playbook and kie://production-review-standard only for the needed stage; do not send full manuals to providers. Before approved-voice creator lip sync, use kie_validate_ugc_preproduction then kie_create_ugc_lipsync with the current private packet. Keep completed client profiles and media in ignored/private run directories. Raw task tools remain unguarded generation primitives, not evidence of creative approval.";

/**
 * The configured folders, stated once at the handshake so a client with no
 * session hook (Claude Desktop, another MCP host) still knows where runs are
 * written and where the user's inputs live.
 */
export function serverInstructions(config: Pick<ServerConfig, "downloadDir" | "assetsDir">): string {
  const runs = config.downloadDir ? path.resolve(config.downloadDir) : "not set, so downloads are off";
  const assets = config.assetsDir ? path.resolve(config.assetsDir) : "not set";
  return `${ROUTING} Runs folder: ${runs}. Assets folder: ${assets}.`;
}
