/**
 * The engine's release version. It must equal `version` in package.json and in
 * .claude-plugin/plugin.json; `npm run check:plugin` fails verify when they
 * differ. Claude Code compares the plugin version to decide whether an
 * installed copy is current, so a release that changes what users run bumps it.
 */
export const ENGINE_VERSION = "0.3.0";
