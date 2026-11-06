import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Committed fixtures must not carry client material. The deny list is stored as sha256 hashes so
// this file does not carry the terms either. It was derived from the v19 run's claims and
// evidence record (brand and domain, product and feature names, states, exam vendors, the authored
// lesson content, the script's distinctive words, presenter and scene details) and the brand name.
// To add a term: lowercase it, split it on anything that is not a-z or 0-9, join the parts with one
// space, and append the sha256 hex of that string. Kept out on purpose: words a TM key carries
// (the composition reads TM keys, so the anonymised v19 fixture keeps them).
const DENY = new Set([
  "6773b7dee359000fc0fec8681e62c1550027c3464b062de526f79d73f6394597",
  "ae7542ba225d55859265d24cc0b95cd230c8966090e06fe4804f91be13939ac4",
  "d4afa8e83637a08da6b3ba7d5e5e1bc601617240c2cacc9aa14761f8511788f3",
  "55fd2842c0fa77f18cbd98073ad8d7e8d5c7e85065e488d5ad9ccf99d1d3cb80",
  "258f47c93434994f92af3611668740650a9c3df5551af91d84060b62da85a4e7",
  "d7efa2f7a9e1b512fd646d3e89e22e529f2b1e852a2864d654d9a867ca4a4624",
  "e59b5bbdf74688ae7ac4ad15cc621c75a8be1392962eeefdeefc24d15891387a",
  "5e89e9d8544af15b204bcdff94f047b0c1b60ab8e9c70edbbdd42b3c83b4ad83",
  "d6bd4331946ce8fac2f0df73692714005873ab45cc9e4bf2c60b8c42b29531eb",
  "c4b2af4722ee54e317672875b2d8cf49aa884bf5820ec6091114fea5ec6560e4",
  "5704270a0e2ab2d5e1c7b5f0eb9346d78eeb4eeb220ce4fa3f5f18d6c2c5e8c6",
  "822610706f8a2bb77a96006b1ac0188da5846184c0909a9a6cc39d68e5368e5b",
  "ef2a43c885876e9dca0a56411ce126aa3b817eedd46d1284a0444f4f40cedd45",
  "788b0249b6ff07b0f87ef98bd076807689f1b5e07a3aaff8277fe931e5eed6e4",
  "d1fee3a146636cbf458f7e55323e52a1cd8b4531e737fb924da1395e48833326",
  "e067e8beb3a29632e1a9c1a074dac8b34b7fd3a6eb8851cf0111a3f409345f93",
  "1c18bc2214f67ae19bbaa640fc776f5a4a38c4021d421cdd8cd3d2bcad23da93",
  "e3a7e307523ee048d2b8fd53d559aefb17fb3f4252a8deb3fe4667e82745cda0",
  "aa015a5d79c625850a1fb9c8e31587001670d2868fafe649ca48f2dd71c5cb60",
  "c3aa9a8cc69dc3bfa65a91bcb75b8522e72ab10dfb700ddc626bdcd572214b78",
  "8b31ba615e98ac308b88b0b6267ff7037ac80690f177f1a3e9ef1785319ac411",
  "9ce5c1ad6b68ea0a1955bd54e2521ec303a4f379594f66a9c3b951a55cdb9527",
  "f2f8167faec1e8faab270b6525c2fc8e15fe8a9d1b57ee35cce173ca03143cfb",
  "624528dc168907c95e16a49fcc91d3ed057b4b58c5ac90b97dff7daf40594fc8",
  "72c1683ffaaaf618fc9efe3f038046b64ed9118ba9a9dfda6e1a3f8c8dba690f",
  "2337a51926e18467d0ada0d6e41ef77e53f159575734cb9ca06e869416aaa05c",
  "61903c8ad7ae29408fe662a50898663c7418d2426a6984725d3d2831f8e10c04",
  "92695d0d721e17e3bdfb6d5618809a5115e3c54f31525df6f11c9476554b30d6",
  "338bfdb776c2edbb1925a06ec32a62ab48283570e8fcac253ba403f568395839",
  "dea50a18cc80fa564a179178e2a6b43dc2faf7ab9c3723c90f0d0015382f5a08",
  "9f9fc11e1814bce64986ec27c932671ffc4359c243ac992fd91f4a0fa908425a",
  "3edf1379ed0cfacfae407c2e40e9bc51c90567a63fbb9f24f405d20793163cbe",
  "7f7bb28ee2c7948d624d7b58639b42e1c49e49c517d5fa5093583b885a8cd3e2",
  "038740ef981ab56f4e0529bec9101d1a1d1181886b0c8a917c98029636341360",
  "f380049acee81bdc056c8f9f00d8cad4fc676f136c60f04081ce3179048354fa",
  "5809519f480c5ee4f9149057d56d1376459b7badc6afbdb735f01db5672c7152",
  "2ec716e4dc4329cdd25b5714267892d55d4c035f82418b32226be31278cbef79",
  "968eb2351c9b2fae774e3ea5950770efe931e3f0651a762a89aeb1cac691357c",
  "ffea238fcb69d7cab05240f8d9ed01fe9325ba407f4ab8090c1fa4368ad9bb60",
  "23d611a6f6f8e3ef8775959efd61eee094c1e6b147ab978e7bf7ca452e51110b",
  "5257f5d1ea4d722c3cc6fd7cfaa4c97400da03a4e7bc25fa64a577064ce9d21c",
  "c798cb77f0549be1cfb86925188228557f72156bdb6a4cb8fbe79cf9ea45f503",
  "f1cfdcfa25f5b47701533703c1c5a93cf07bec361d2c9ee30ca50d94eb33326e",
  "b025286c7ab02542a33a83337528c640d7dc4c519c9e86bd1129c84da9ce9845",
  "c4993a8e538b524f9c4131c44d8cc31c8c48bcb1af81cd9cd70e2752e4284584",
  "3abeaded5e96ee8df3af256f73390a449c1ff8904b321464d6ffd7c539f7a54c",
  "43e26a97aa61e86dfc932e1effa6332ee18e94f8e5709aa1a82f5210f84ef833",
  "8a105898989c6e17a605bdf926376050dd431701f4240ea084fc1c1d342cc848",
  "41c4c2c8c1c0ed14214dda32ec6cddc96333b07cae17af46329e6ee69e55cdc5",
  "a05e6feb79c854166f6c73783754dc0111ee87edd58bca22a77c3a8721fa729c",
  "ceb04a698ebb3a69277481ad9d5946f30cb1bd6500d8daec3e11b10ece5985e6",
  "2534e2de1dec24fedab4c00266b55ba9ba60dde03a349c5b5662189dd561ba9e",
  "83b6a889a09a536018a7cd5f5a7cbc38ab5d5dbf4946f3e0d9c2adae5954057c",
  "abe2122cd1e942eb221719fa450a549bf2cd7ba015434963e8c51075f8bb2fd9",
]);

const root = fileURLToPath(new URL("./fixtures/", import.meta.url));
// The tests that inline fixture copy are scanned too.
const extra = ["timeline-v19.test.ts", "timeline-check.test.ts"].map((f) => fileURLToPath(new URL(`./${f}`, import.meta.url)));
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Every 1- to 3-token run of the text, tokens joined by a space and, for runs of 2 and 3, also run together. */
export function grams(text: string): string[] {
  const t = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= t.length; i++) {
    const run = t.slice(i, i + n);
    out.push(run.join(" "));
    if (n > 1) out.push(run.join(""));
  }
  return out;
}

function hits(file: string): string[] {
  const buf = fs.readFileSync(file);
  const name = path.relative(root, file);
  const found = new Set<string>();
  for (const g of grams(name)) if (DENY.has(sha(g))) found.add(`file name: ${sha(g).slice(0, 12)}`);
  if (buf.includes(0)) return [...found]; // binary (a font): name only
  const lines = buf.toString("utf8").split("\n");
  lines.forEach((line, i) => { for (const g of grams(line)) if (DENY.has(sha(g))) found.add(`line ${i + 1}: deny-list hash ${sha(g).slice(0, 12)}`); });
  return [...found];
}

describe("fixture hygiene", () => {
  const files = [...walk(root), ...extra];

  it("scans the anonymised v19 fixture and the synthetic fixture", () => {
    const rel = files.map((f) => path.relative(root, f).split(path.sep).join("/"));
    expect(rel).toEqual(expect.arrayContaining(["timeline-v19/cut.json", "timeline-v19/phrases.json", "timeline-v19/expected.json", "timeline-v19/timeline.json", "timeline-synthetic/cut.json"]));
    expect(DENY.size).toBe(54);
  });

  it("the tokenizer matches multi-word terms with any separator and run together", () => {
    expect(grams("Alpha-Beta gamma")).toEqual(expect.arrayContaining(["alpha", "alpha beta", "alphabeta", "alpha beta gamma", "alphabetagamma"]));
  });

  it.each(files.map((f) => [path.relative(root, f).split(path.sep).join("/"), f]))("%s carries no deny-listed term", (_name, file) => {
    expect(hits(file)).toEqual([]);
  });
});
