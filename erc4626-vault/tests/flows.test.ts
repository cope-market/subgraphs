import {Address, BigInt} from "@graphprotocol/graph-ts";
import {afterEach, assert, clearStore, describe, test} from "matchstick-as/assembly/index";
import {handleDeposit, handleTransfer, handleWithdraw} from "../src/vault";
import {
  ALICE,
  BOB,
  VAULT,
  ZERO,
  depositEvent,
  mockTotals,
  mockVault,
  pow10,
  transferEvent,
  withdrawEvent,
} from "./helpers";

const ONE_USDC = pow10(6);
const ONE_SHARE = pow10(18);

function usdc(n: i32): BigInt {
  return ONE_USDC.times(BigInt.fromI32(n));
}

function shares(n: i32): BigInt {
  return ONE_SHARE.times(BigInt.fromI32(n));
}

function positionId(account: string): string {
  return VAULT.toHexString() + account.slice(2);
}

const ALICE_POSITION = positionId(ALICE.toHexString());
const BOB_POSITION = positionId(BOB.toHexString());

/// A deposit as the chain actually emits it: OpenZeppelin mints first, so the `Transfer` from the
/// zero address precedes the `Deposit` describing the same shares.
function deposit(account: Uint8Array, assets: BigInt, mintedShares: BigInt): void {
  const who = changetype<Address>(account);
  handleTransfer(transferEvent(ZERO, who, mintedShares));
  handleDeposit(depositEvent(who, who, assets, mintedShares));
}

describe("deposits", () => {
  afterEach(() => {
    clearStore();
  });

  test("records the event, the flow and the counters", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    assert.entityCount("Deposit", 1);
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeDepositedAssets", "20000000");
    assert.fieldEquals("Vault", VAULT.toHexString(), "depositCount", "1");
    assert.fieldEquals("Account", ALICE.toHexString(), "depositCount", "1");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "cumulativeDepositedAssets", "20000000");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "depositCount", "1");
  });

  /// Both the mint and the `Deposit` describe the same shares. Counting both would double every
  /// balance in the subgraph.
  test("the mint and the deposit do not both move the balance", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", shares(20).toString());
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "1");
  });

  test("the position opens and the account is counted once", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));
    mockTotals(usdc(40), shares(40));
    deposit(ALICE, usdc(20), shares(20));

    assert.fieldEquals("VaultPosition", ALICE_POSITION, "isOpen", "true");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "depositCount", "2");
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeAccountCount", "1");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "1");
  });

  /// A live deployment of this vault minted zero shares for deposits under 0.0044 USDC, because the
  /// share decimals were not offset. The subgraph has to survive indexing that, not abort on it.
  test("a deposit that mints no shares is recorded and opens nothing", () => {
    mockVault(usdc(1), BigInt.zero());
    handleDeposit(depositEvent(ALICE, ALICE, BigInt.fromI32(1000), BigInt.zero()));

    assert.entityCount("Deposit", 1);
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", "0");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "isOpen", "false");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "0");
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeDepositedAssets", "1000");
  });

  /// ERC-4626 lets a router deposit on someone else's behalf. The stake is the owner's.
  test("a deposit for someone else counts against the owner", () => {
    mockVault(usdc(20), shares(20));
    handleTransfer(transferEvent(ZERO, BOB, shares(20)));
    handleDeposit(depositEvent(ALICE, BOB, usdc(20), shares(20)));

    assert.fieldEquals("Account", BOB.toHexString(), "depositCount", "1");
    assert.fieldEquals("Account", ALICE.toHexString(), "depositCount", "0");
    assert.fieldEquals("VaultPosition", BOB_POSITION, "cumulativeDepositedAssets", "20000000");
    assert.fieldEquals("VaultPosition", BOB_POSITION, "shares", shares(20).toString());
  });
});

describe("withdrawals", () => {
  afterEach(() => {
    clearStore();
  });

  test("a full exit closes the position but keeps its history", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    mockTotals(BigInt.zero(), BigInt.zero());
    handleTransfer(transferEvent(ALICE, ZERO, shares(20)));
    handleWithdraw(withdrawEvent(ALICE, ALICE, ALICE, usdc(20), shares(20)));

    assert.entityCount("VaultPosition", 1);
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", "0");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "isOpen", "false");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "cumulativeDepositedAssets", "20000000");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "cumulativeWithdrawnAssets", "20000000");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "0");
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeAccountCount", "1");
  });

  test("a partial exit leaves the position open", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    mockTotals(usdc(15), shares(15));
    handleTransfer(transferEvent(ALICE, ZERO, shares(5)));
    handleWithdraw(withdrawEvent(ALICE, ALICE, ALICE, usdc(5), shares(5)));

    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", shares(15).toString());
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "isOpen", "true");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "1");
  });

  /// ERC-4626 allows withdrawing to a third party. The shares burned are still the owner's.
  test("withdrawing to a third party counts against the owner", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    mockTotals(BigInt.zero(), BigInt.zero());
    handleTransfer(transferEvent(ALICE, ZERO, shares(20)));
    handleWithdraw(withdrawEvent(ALICE, BOB, ALICE, usdc(20), shares(20)));

    assert.fieldEquals("Account", ALICE.toHexString(), "withdrawCount", "1");
    assert.fieldEquals("Account", BOB.toHexString(), "withdrawCount", "0");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "cumulativeWithdrawnAssets", "20000000");
  });

  /// Cumulative flows are lifetime totals. Netting a withdrawal out of the deposited figure would
  /// make "how much has ever gone in" unanswerable.
  test("cumulative flows never decrease", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    mockTotals(BigInt.zero(), BigInt.zero());
    handleTransfer(transferEvent(ALICE, ZERO, shares(20)));
    handleWithdraw(withdrawEvent(ALICE, ALICE, ALICE, usdc(20), shares(20)));

    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeDepositedAssets", "20000000");
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeWithdrawnAssets", "20000000");
  });
});

describe("secondary share movement", () => {
  afterEach(() => {
    clearStore();
  });

  /// Shares are ERC-20. Selling them moves the stake with no deposit or withdrawal anywhere.
  test("a transfer moves the stake without touching the flows", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    handleTransfer(transferEvent(ALICE, BOB, shares(20)));

    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", "0");
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "isOpen", "false");
    assert.fieldEquals("VaultPosition", BOB_POSITION, "shares", shares(20).toString());
    assert.fieldEquals("VaultPosition", BOB_POSITION, "isOpen", "true");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "1");
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeAccountCount", "2");
    assert.fieldEquals("Vault", VAULT.toHexString(), "depositCount", "1");
  });

  test("a partial transfer leaves both sides open", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    handleTransfer(transferEvent(ALICE, BOB, shares(5)));

    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", shares(15).toString());
    assert.fieldEquals("VaultPosition", BOB_POSITION, "shares", shares(5).toString());
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "2");
  });

  /// ERC-20 permits a zero-value transfer, and some routers emit one. It must not open a position
  /// or move the holder count.
  test("a zero-value transfer opens nothing", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    handleTransfer(transferEvent(ALICE, BOB, BigInt.zero()));

    assert.fieldEquals("VaultPosition", BOB_POSITION, "shares", "0");
    assert.fieldEquals("VaultPosition", BOB_POSITION, "isOpen", "false");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "1");
  });

  /// A self-transfer nets to nothing. Applying the two deltas in the wrong order would briefly show
  /// a closed position and leave the holder count one short.
  test("a self-transfer changes nothing", () => {
    mockVault(usdc(20), shares(20));
    deposit(ALICE, usdc(20), shares(20));

    handleTransfer(transferEvent(ALICE, ALICE, shares(20)));

    assert.fieldEquals("VaultPosition", ALICE_POSITION, "shares", shares(20).toString());
    assert.fieldEquals("VaultPosition", ALICE_POSITION, "isOpen", "true");
    assert.fieldEquals("Vault", VAULT.toHexString(), "openPositionCount", "1");
  });
});
