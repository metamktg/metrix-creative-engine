/**
 * Markdown is imported as a string and inlined by esbuild's `text` loader
 * (see `build.mjs`). The server ships as one bundled file that an MCP client
 * launches directly, often with no repository beside it, so a resource or
 * prompt that read its document off disk at runtime would resolve against an
 * arbitrary working directory and find nothing. Inlining at build time is what
 * makes the content actually available where the server runs.
 */
declare module "*.md" {
  const content: string;
  export default content;
}
