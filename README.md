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
  abis/ERC4626.json          the standard's events and views, hand-written — not our vault's ABI
  config/<network>.json      which vaults to index; the only vault-specific files in the repo
  subgraph.template.yaml     one data source, repeated per vault at build time
  scripts/build-manifest.mjs renders subgraph.yaml and src/bindings.ts from the config
  schema.graphql
  src/vault.ts
  tests/
cope-market/
  abis/SyntheticVault.json
  ...
scripts/matchstick.sh        test runner; see "Running the tests" below
```

`erc4626-vault/subgraph.yaml` and `erc4626-vault/src/bindings.ts` are generated and are not
committed. Edit the template and the config.

### Pointing it at another vault

Add a file to `config/`:

```json
{
  "network": "base",
  "vaults": [{"name": "MyVault", "address": "0x...", "startBlock": 51150000}]
}
```

```bash
NETWORK=base npm run build -w erc4626-vault
```

No mapping changes, and no schema changes. Several vaults in one config index side by side, because
every handler reads `event.address` and `Vault` is keyed by it. graph-cli's own `networks.json`
would not do: it rewrites data sources the manifest already declares, so the _number_ of vaults
would still be fixed in code.

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

## Deployed

| Subgraph        | Studio slug          | Network       | Query endpoint                                                              |
| --------------- | -------------------- | ------------- | --------------------------------------------------------------------------- |
| `erc4626-vault` | `erc-4626-vault-arc` | `arc-testnet` | `https://api.studio.thegraph.com/query/101383/erc-4626-vault-arc/<version>` |
| `cope-market`   | `cope-market-arc`    | `arc-testnet` | not yet deployed                                                            |

Studio inserts a hyphen into the numeral: the slug is `erc-4626-vault-arc`, not `erc4626-vault-arc`.
Deploying under the name you typed into the form returns `Subgraph not found`.

Indexing `LiquidityVault` at `0x0ffABC4e80125C5742D5ed04Cc1fD1b634Bc3C5d` from block 61720923.

### `totalAssets` is as of `lastUpdatedBlock`, not live

The subgraph agrees with the contract exactly at every block it indexed, and drifts from it in
between. Measured against the live deployment:

| Source                                                  | `totalAssets` |
| ------------------------------------------------------- | ------------- |
| Subgraph                                                | `30000000`    |
| `totalAssets()` at block 61720957, the vault's last log | `30000000`    |
| `totalAssets()` at chain head                           | `30016928`    |

The 16,928 is trading P&L that accrued into the pool without the vault emitting anything. Handlers
run on logs, so a subgraph cannot see it until the next deposit, withdrawal or transfer. Anything
that needs TVL to the block reads the contract; anything charting history reads the snapshots.
