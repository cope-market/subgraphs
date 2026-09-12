#!/usr/bin/env node
// Fails when anything specific to this protocol reaches the standardized subgraph.
//
// The Track 1 claim is that erc4626-vault indexes any ERC-4626 vault, and that claim is only worth
// as much as it is true. It is also the kind of thing that decays: a field added in a hurry to
// unblock one screen, a comment explaining a behaviour by naming our own vault, an ABI swapped for
// the one already on disk. None of that breaks a build or fails a test, which is why it is checked
// here rather than remembered.
//
// config/ is exempt by design. Naming the vaults under index is exactly what those files are for,
// and a configuration that could not name a vault would not be configuration.
import {readFileSync, readdirSync, statSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "erc4626-vault");

const FORBIDDEN = [
  "cope",
  "synthetic",
  "thesis",
  "theses",
  "feedid",
  "leaderboard",
  "copyauthor",
  "copiedfrom",
  "pyth",
  "arcscan",
];

const CHECKED = ["schema.graphql", "subgraph.template.yaml", "src", "abis"];

function filesUnder(path) {
  const stats = statSync(path, {throwIfNoEntry: false});
  if (!stats) return [];
  if (stats.isFile()) return [path];
  return readdirSync(path).flatMap((entry) => filesUnder(join(path, entry)));
}

let failed = false;

for (const target of CHECKED) {
  for (const file of filesUnder(join(root, target))) {
    // Generated, and named after whichever data source the configuration put first.
    if (file.endsWith("bindings.ts")) continue;

    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      // The repository URL is the one legitimate mention of the project's own name.
      if (line.includes("github.com/cope-market")) return;
      const lower = line.toLowerCase();
      for (const term of FORBIDDEN) {
        if (lower.includes(term)) {
          console.error(
            `${relative(root, file)}:${index + 1}: "${term}" does not belong in a schema that ` +
              `claims to index any ERC-4626 vault.\n    ${line.trim()}`,
          );
          failed = true;
        }
      }
    });
  }
}

if (failed) {
  console.error("\nThe standardized subgraph must describe the standard, not this protocol.");
  process.exit(1);
}

console.log("erc4626-vault: nothing protocol-specific in the schema, mappings or ABIs");
