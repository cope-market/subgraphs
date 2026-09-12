import {BigInt} from "@graphprotocol/graph-ts";
import {afterEach, assert, clearStore, describe, test} from "matchstick-as/assembly/index";
import {sharePriceOf} from "../src/decimals";
import {handleDeposit} from "../src/vault";
import {
  ALICE,
  ASSET,
  VAULT,
  depositEvent,
  mockSilentVault,
  mockTotals,
  mockVault,
  pow10,
} from "./helpers";

const ONE_USDC = pow10(6);
const ONE_SHARE = pow10(18);

describe("share price", () => {
  /// The whole reason `sharePrice` is not `totalAssets / totalSupply`. Cope Market's vault offsets
  /// share decimals by twelve, so the raw ratio of a healthy vault is about 1e-12.
  test("removes both sides' decimals before dividing", () => {
    const price = sharePriceOf(
      ONE_USDC.times(BigInt.fromI32(20)),
      6,
      ONE_SHARE.times(BigInt.fromI32(20)),
      18,
    );
    assert.stringEquals("1", price.toString());
  });

  test("reports a vault in profit above one", () => {
    const price = sharePriceOf(
      ONE_USDC.times(BigInt.fromI32(22)),
      6,
      ONE_SHARE.times(BigInt.fromI32(20)),
      18,
    );
    assert.stringEquals("1.1", price.toString());
  });

  /// A vault that has taken losses must be able to report a price below one, or LPs cannot see
  /// that they are underwater.
  test("reports a vault in loss below one", () => {
    const price = sharePriceOf(
      ONE_USDC.times(BigInt.fromI32(18)),
      6,
      ONE_SHARE.times(BigInt.fromI32(20)),
      18,
    );
    assert.stringEquals("0.9", price.toString());
  });

  /// Division by a zero supply would abort the handler and stall the subgraph at the vault's first
  /// ever log, which is exactly when the supply is zero.
  test("an empty vault prices at one rather than aborting", () => {
    assert.stringEquals("1", sharePriceOf(BigInt.zero(), 6, BigInt.zero(), 18).toString());
  });

  /// Assets can arrive before any shares exist — a donation, or in Cope Market's case a trader's
  /// loss landing in a pool nobody has deposited into yet.
  test("assets with no shares still price at one", () => {
    assert.stringEquals("1", sharePriceOf(ONE_USDC, 6, BigInt.zero(), 18).toString());
  });

  test("equal decimals on both sides need no adjustment", () => {
    assert.stringEquals("1", sharePriceOf(ONE_SHARE, 18, ONE_SHARE, 18).toString());
  });
});

describe("vault bootstrapping", () => {
  afterEach(() => {
    clearStore();
  });

  test("the first event creates the vault, its asset and its metadata", () => {
    mockVault(ONE_USDC.times(BigInt.fromI32(20)), ONE_SHARE.times(BigInt.fromI32(20)));
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));

    assert.entityCount("Vault", 1);
    assert.entityCount("Token", 1);
    assert.fieldEquals("Vault", VAULT.toHexString(), "symbol", "cmLP");
    assert.fieldEquals("Vault", VAULT.toHexString(), "decimals", "18");
    assert.fieldEquals("Vault", VAULT.toHexString(), "asset", ASSET.toHexString());
    assert.fieldEquals("Token", ASSET.toHexString(), "symbol", "USDC");
    assert.fieldEquals("Token", ASSET.toHexString(), "decimals", "6");
  });

  test("state is read from the chain, not accumulated from the event", () => {
    mockVault(ONE_USDC.times(BigInt.fromI32(20)), ONE_SHARE.times(BigInt.fromI32(20)));
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));

    assert.fieldEquals("Vault", VAULT.toHexString(), "totalAssets", "20000000");
    assert.fieldEquals("Vault", VAULT.toHexString(), "sharePrice", "1");
  });

  /// A vault's assets move with no log at all: yield accrues, and here traders win and lose against
  /// the pool. A total summed from Deposit and Withdraw would drift and never recover.
  test("a refresh picks up assets that arrived without an event", () => {
    mockVault(ONE_USDC.times(BigInt.fromI32(20)), ONE_SHARE.times(BigInt.fromI32(20)));
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));

    mockTotals(ONE_USDC.times(BigInt.fromI32(25)), ONE_SHARE.times(BigInt.fromI32(20)));
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));

    assert.fieldEquals("Vault", VAULT.toHexString(), "totalAssets", "25000000");
    assert.fieldEquals("Vault", VAULT.toHexString(), "sharePrice", "1.25");
  });

  test("the second event reuses the vault rather than re-reading its metadata", () => {
    mockVault(ONE_USDC, ONE_SHARE);
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));

    assert.entityCount("Vault", 1);
    assert.entityCount("Token", 1);
  });

  /// `name`, `symbol` and `decimals` are all optional in ERC-20, and pre-final tokens return
  /// bytes32. A standardized subgraph has to index those vaults too.
  test("a vault that answers nothing still indexes", () => {
    mockSilentVault();
    handleDeposit(depositEvent(ALICE, ALICE, ONE_USDC, ONE_SHARE));

    assert.entityCount("Vault", 1);
    assert.fieldEquals("Vault", VAULT.toHexString(), "name", "unknown");
    assert.fieldEquals("Vault", VAULT.toHexString(), "symbol", "???");
    assert.fieldEquals("Vault", VAULT.toHexString(), "decimals", "18");
    assert.fieldEquals("Vault", VAULT.toHexString(), "totalAssets", "0");
    assert.fieldEquals(
      "Vault",
      VAULT.toHexString(),
      "asset",
      "0x0000000000000000000000000000000000000000",
    );
  });
});
