#!/usr/bin/env node
// Fails when a mapping exports a handler the manifest never wires up.
//
// This exists because that failure is completely silent. `graph build` compiles an unreferenced
// export without complaint, `graph deploy` accepts it, and the subgraph indexes cleanly with
// hasIndexingErrors false — it simply never sees the event. Cope Market's PositionClosed handler
// shipped that way: five positions showed as open, two of which the chain had already burned.
//
// The specific cause was an edit that matched nothing because the manifest had been reformatted,
// but the class is wider than that, so the guard checks the result rather than the edit.
import {readFileSync, readdirSync, statSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaces = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces;

let failed = false;

for (const workspace of workspaces) {
  const manifestPath = join(root, workspace, "subgraph.yaml");
  let manifest;
  try {
    manifest = readFileSync(manifestPath, "utf8");
  } catch {
    console.error(`${workspace}: no subgraph.yaml. Run codegen first.`);
    failed = true;
    continue;
  }

  // Deliberately a regex rather than a YAML parser: the guard must not gain a dependency that
  // could itself go stale, and `handler:` is unambiguous in this file.
  const wired = new Set([...manifest.matchAll(/^\s*handler:\s*(\S+)\s*$/gm)].map((m) => m[1]));

  const srcDir = join(root, workspace, "src");
  const exported = new Set();
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith(".ts") || !statSync(join(srcDir, file)).isFile()) continue;
    const source = readFileSync(join(srcDir, file), "utf8");
    for (const match of source.matchAll(/^export function (handle\w+)\s*\(/gm)) {
      exported.add(match[1]);
    }
  }

  const unwired = [...exported].filter((name) => !wired.has(name)).sort();
  const missing = [...wired].filter((name) => !exported.has(name)).sort();

  if (unwired.length > 0) {
    console.error(
      `${workspace}: exported but never wired in subgraph.yaml: ${unwired.join(", ")}\n` +
        `  These compile and deploy fine and index nothing at all.`,
    );
    failed = true;
  }
  if (missing.length > 0) {
    console.error(`${workspace}: wired in subgraph.yaml but not exported: ${missing.join(", ")}`);
    failed = true;
  }
  if (unwired.length === 0 && missing.length === 0) {
    console.log(`${workspace}: ${wired.size} handlers wired and exported`);
  }
}

process.exit(failed ? 1 : 0);
