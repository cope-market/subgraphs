# Cope Market subgraphs

Two subgraphs live here, and keeping them apart is the point.

| Workspace        | Subgraph            | What it indexes                                                                                         |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `erc4626-vault/` | `erc4626-vault-arc` | Only what the ERC-4626 standard defines. Reusable against any tokenized vault on any supported network. |
| `cope-market/`   | `cope-market-arc`   | Cope Market's positions, copy lineage, author fees and realised P&L.                                    |

`erc4626-vault` is a **standardized** subgraph, not a subgraph for our vault that happens to be
ERC-4626. Nothing Cope-specific may enter its schema or its mappings: no feed ids, no theses, no
positions. If a field would not make sense on a Yearn or a Morpho vault, it does not belong. The
vault under index is chosen by `networks.json`, never by code, so pointing it at a different vault
is a configuration change and a redeploy.

The product data that would break that rule lives in the second workspace instead.

## Layout

```
erc4626-vault/
  abis/ERC4626.json     the standard's events and views, hand-written — not our vault's ABI
  networks.json         address and startBlock per network; the only vault-specific file
  schema.graphql
  src/vault.ts
  tests/
cope-market/
  abis/SyntheticVault.json
  ...
scripts/matchstick.sh   test runner; see "Running the tests" below
```

## Commands

Run from the repository root. Both workspaces are covered.

```bash
npm install
npm run codegen        # generate AssemblyScript types from the ABIs and the schema
npm run build          # compile to wasm, resolving addresses through networks.json
npm run test           # matchstick unit tests
npm run check          # format check, codegen, build and test, in that order
```

Per workspace, add `-w erc4626-vault` or `-w cope-market`.

## Running the tests

`npm run test` calls `scripts/matchstick.sh` rather than `graph test`.

`graph test` decides which matchstick binary to download by reading `/etc/*-release` for a
`VERSION=` line and matching it to an Ubuntu release. Distributions that publish no such line —
Arch among them — fall through to the kernel version, which matches nothing:

```
Error: Failed to get matchstick binary: Unsupported platform: Linux x64 7
```

The binary runs fine; only the host detection does not. The script fetches the release asset
directly and caches it under `.bin/`. `npx graph test -d` is the other documented way round it, at
the cost of a Docker image build on every clean checkout.

Matchstick also expects `./node_modules` inside the workspace, which npm workspaces hoists to the
root. `libsFolder: ../node_modules` in each `matchstick.yaml` points it back.

## Deploying

Subgraph Studio, network `arc-testnet` (Arc testnet, chain 5042002). One deploy key covers every
subgraph on the account:

```bash
cp .env.example .env      # then paste GRAPH_DEPLOY_KEY
npx graph auth "$GRAPH_DEPLOY_KEY"
npm run deploy -w erc4626-vault
```

Arc mainnet (`arc`, chain 5042) is also a registered network, so the same manifests deploy there
once `networks.json` gains an `arc` entry.

## A note on `npm audit`

`npm audit --omit=dev` reports **zero** production vulnerabilities: nothing here ships a runtime.
The plain `npm audit` count is entirely `@graphprotocol/graph-cli`'s dependency tree — `decompress`,
`gluegun`, `ejs`, `jayson`, `undici` and friends. graph-cli is a local build tool that we point only
at our own ABIs and at Subgraph Studio, and the advisories are not reachable from that use. An
`overrides` entry lifts `axios` off 0.21.4, which was the one worth moving; the rest have no fixed
version that graph-cli accepts.
