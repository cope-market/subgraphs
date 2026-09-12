import {Address, BigInt} from "@graphprotocol/graph-ts";
import {afterEach, assert, clearStore, describe, test} from "matchstick-as/assembly/index";
import {handleDeposit, handleTransfer, handleWithdraw} from "../src/vault";
import {
  ALICE,
  BOB,
  VAULT,
  ZERO,
  atTime,
  depositEvent,
  mockTotals,
  mockVault,
  pow10,
  transferEvent,
  withdrawEvent,
} from "./helpers";

const ONE_USDC = pow10(6);
const ONE_SHARE = pow10(18);

const HOUR: i64 = 3600;
const DAY: i64 = 86400;

/// A Tuesday, so that the day boundary does not coincide with the hour boundary under test.
const T0: i64 = 1757660400;

function usdc(n: i32): BigInt {
  return ONE_USDC.times(BigInt.fromI32(n));
}

function shares(n: i32): BigInt {
  return ONE_SHARE.times(BigInt.fromI32(n));
}

function hourId(timestamp: i64): string {
  const hour = (timestamp / HOUR) as i32;
  return VAULT.concatI32(hour).toHexString();
}

function dayId(timestamp: i64): string {
  const day = (timestamp / DAY) as i32;
  return VAULT.concatI32(day).toHexString();
}

function depositAt(who: Address, assets: BigInt, minted: BigInt, timestamp: i64): void {
  handleTransfer(atTime(transferEvent(ZERO, who, minted), timestamp, timestamp));
  handleDeposit(atTime(depositEvent(who, who, assets, minted), timestamp, timestamp));
}

describe("snapshots", () => {
  afterEach(() => {
    clearStore();
  });

  test("the first event of a period opens its snapshot", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);

    assert.entityCount("VaultHourlySnapshot", 1);
    assert.entityCount("VaultDailySnapshot", 1);
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "totalAssets", "20000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "sharePrice", "1");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyDepositedAssets", "20000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyDepositCount", "1");
  });

  test("flows accumulate within the period", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    mockTotals(usdc(50), shares(50));
    depositAt(BOB, usdc(30), shares(30), T0 + 600);

    assert.entityCount("VaultHourlySnapshot", 1);
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyDepositedAssets", "50000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyDepositCount", "2");
  });

  /// State fields describe the vault at the last event of the period, not the sum of the period.
  test("state fields are overwritten rather than accumulated", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    mockTotals(usdc(50), shares(50));
    depositAt(BOB, usdc(30), shares(30), T0 + 600);

    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "totalAssets", "50000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "totalShares", shares(50).toString());
  });

  test("a new hour opens a new snapshot and leaves the old one alone", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    mockTotals(usdc(50), shares(50));
    depositAt(BOB, usdc(30), shares(30), T0 + HOUR);

    assert.entityCount("VaultHourlySnapshot", 2);
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyDepositedAssets", "20000000");
    assert.fieldEquals(
      "VaultHourlySnapshot",
      hourId(T0 + HOUR),
      "hourlyDepositedAssets",
      "30000000",
    );
  });

  /// The hour rolls over twenty-three times inside a day, so the two windows must be independent.
  test("a new hour does not open a new day", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    mockTotals(usdc(50), shares(50));
    depositAt(BOB, usdc(30), shares(30), T0 + HOUR);

    assert.entityCount("VaultDailySnapshot", 1);
    assert.fieldEquals("VaultDailySnapshot", dayId(T0), "dailyDepositedAssets", "50000000");
    assert.fieldEquals("VaultDailySnapshot", dayId(T0), "dailyDepositCount", "2");
  });

  test("a new day opens a new daily snapshot", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    mockTotals(usdc(50), shares(50));
    depositAt(BOB, usdc(30), shares(30), T0 + DAY);

    assert.entityCount("VaultDailySnapshot", 2);
    assert.fieldEquals("VaultDailySnapshot", dayId(T0 + DAY), "dailyDepositedAssets", "30000000");
  });

  test("withdrawals are recorded separately from deposits", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);

    mockTotals(usdc(15), shares(15));
    handleTransfer(atTime(transferEvent(ALICE, ZERO, shares(5)), T0 + 60, T0 + 60));
    handleWithdraw(
      atTime(withdrawEvent(ALICE, ALICE, ALICE, usdc(5), shares(5)), T0 + 60, T0 + 60),
    );

    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyDepositedAssets", "20000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyWithdrawnAssets", "5000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0), "hourlyWithdrawCount", "1");
  });

  /// A vault's assets move with no deposit and no withdrawal — yield, or here a trader's loss. The
  /// snapshot has to show that even though the period's flows are zero, or a share-price chart
  /// stops moving between deposits.
  test("a period with no flows still records the state", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);

    mockTotals(usdc(25), shares(20));
    handleTransfer(atTime(transferEvent(ALICE, BOB, shares(5)), T0 + HOUR, T0 + HOUR));

    assert.fieldEquals("VaultHourlySnapshot", hourId(T0 + HOUR), "totalAssets", "25000000");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0 + HOUR), "sharePrice", "1.25");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0 + HOUR), "hourlyDepositedAssets", "0");
    assert.fieldEquals("VaultHourlySnapshot", hourId(T0 + HOUR), "hourlyWithdrawCount", "0");
  });
});

describe("share transfers", () => {
  afterEach(() => {
    clearStore();
  });

  test("a mint is recorded and flagged", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);

    assert.entityCount("ShareTransfer", 1);
    assert.fieldEquals("Vault", VAULT.toHexString(), "shareTransferCount", "0");
  });

  /// Mints and burns are the share half of a deposit and a withdrawal. Counting them as transfers
  /// would report every LP who ever entered as having traded their shares.
  test("only movement between holders counts as a transfer", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    handleTransfer(atTime(transferEvent(ALICE, BOB, shares(5)), T0 + 60, T0 + 60));

    assert.entityCount("ShareTransfer", 2);
    assert.fieldEquals("Vault", VAULT.toHexString(), "shareTransferCount", "1");
  });

  test("secondary movement is recorded on both positions", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);
    handleTransfer(atTime(transferEvent(ALICE, BOB, shares(5)), T0 + 60, T0 + 60));

    const alice = VAULT.toHexString() + ALICE.toHexString().slice(2);
    const bob = VAULT.toHexString() + BOB.toHexString().slice(2);
    assert.fieldEquals("VaultPosition", alice, "sharesSent", shares(5).toString());
    assert.fieldEquals("VaultPosition", alice, "sharesReceived", "0");
    assert.fieldEquals("VaultPosition", bob, "sharesReceived", shares(5).toString());
    assert.fieldEquals("VaultPosition", bob, "sharesSent", "0");
  });

  /// Minting leaves no position for the zero address, or every vault would report a permanent
  /// holder that cannot exist.
  test("a mint opens no position for the zero address", () => {
    mockVault(usdc(20), shares(20));
    depositAt(ALICE, usdc(20), shares(20), T0);

    assert.entityCount("VaultPosition", 1);
    assert.fieldEquals("Vault", VAULT.toHexString(), "cumulativeAccountCount", "1");
  });
});
