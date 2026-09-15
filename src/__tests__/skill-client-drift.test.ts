/**
 * The three skills each ship their own copy of `kie.mjs` so a skill is a single
 * self-contained upload with no install step. Three copies is a drift hazard:
 * a fix applied to one leaves the other two wrong, and nothing in a skill
 * upload would ever reveal it.
 *
 * This is the same guard `metrix-iap` puts on its duplicated ad-name matcher
 * (`scripts/src/adname-match-drift.test.ts`): the copies must be byte-identical
 * or the build fails naming them.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillsDir = path.join(repoRoot, "skills");

function skillClients(): Array<{ skill: string; file: string; source: string }> {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ skill: entry.name, file: path.join(skillsDir, entry.name, "scripts", "kie.mjs") }))
    .filter(({ file }) => {
      try {
        readFileSync(file);
        return true;
      } catch {
        return false;
      }
    })
    .map(({ skill, file }) => ({ skill, file, source: readFileSync(file, "utf8") }));
}

describe("skill-bundled kie.mjs copies", () => {
  it("ships one in every skill that generates", () => {
    // Not every skill talks to Kie. `brand-kit-builder` audits a public site and
    // spends nothing, so requiring a client of it was the guard over-reaching.
    // What must hold is that a skill with a scripts/ directory either bundles the
    // client or deliberately does not, and the ones that do never drift apart.
    const generating = ["kie-generate", "kie-tasks", "metrix-ad-creative"];
    const shipped = skillClients().map((c) => c.skill).sort();
    expect(shipped).toEqual([...generating].sort());
  });

  it("are byte-identical across skills", () => {
    const clients = skillClients();
    expect(clients.length).toBeGreaterThan(1);
    const [first, ...rest] = clients;
    for (const other of rest) {
      expect(
        other.source === first.source,
        `${other.skill}/scripts/kie.mjs has drifted from ${first.skill}/scripts/kie.mjs. ` +
          `Edit one copy, then copy it over the others.`,
      ).toBe(true);
    }
  });

  it("state no rate-limit figure Kie does not publish", () => {
    // Kie documents that 429 means the limit was exceeded and publishes no
    // number. An error hint that invents one sends the reader to pace a batch
    // against a limit that may not exist.
    for (const { skill, source } of skillClients()) {
      expect(source, `${skill} quotes an unpublished rate limit`).not.toMatch(/\d+\s+new generations per/i);
    }
  });

  it("quote the documented 24-hour result expiry, not the retired 14-day figure", () => {
    for (const { skill, source } of skillClients()) {
      expect(source, `${skill} still claims 14-day retention`).not.toMatch(/14 days/i);
      expect(source, `${skill} does not warn about result expiry`).toMatch(/24 hours/i);
    }
  });
});
