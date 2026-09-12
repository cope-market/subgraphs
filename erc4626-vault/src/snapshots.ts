import {BigInt, ethereum} from "@graphprotocol/graph-ts";
import {Vault, VaultDailySnapshot, VaultHourlySnapshot} from "../generated/schema";
import {BIGINT_ZERO, INT_ZERO, SECONDS_PER_DAY, SECONDS_PER_HOUR} from "./constants";

/// Snapshots are written only in periods that had an event.
///
/// A subgraph has no clock: handlers run on logs, so an hour in which the vault saw no activity
/// produces no row. A chart must therefore carry the last known value forward across the gap rather
/// than read a missing hour as zero. Filling every empty hour would mean a block handler running on
/// every block of the chain, which costs far more than it tells anyone.
export function updateSnapshots(
  vault: Vault,
  block: ethereum.Block,
  depositedAssets: BigInt,
  withdrawnAssets: BigInt,
  deposits: i32,
  withdraws: i32,
): void {
  updateHourly(vault, block, depositedAssets, withdrawnAssets, deposits, withdraws);
  updateDaily(vault, block, depositedAssets, withdrawnAssets, deposits, withdraws);
}

function updateHourly(
  vault: Vault,
  block: ethereum.Block,
  depositedAssets: BigInt,
  withdrawnAssets: BigInt,
  deposits: i32,
  withdraws: i32,
): void {
  const hour = (block.timestamp.toI64() / SECONDS_PER_HOUR) as i32;
  const id = vault.id.concatI32(hour);

  let snapshot = VaultHourlySnapshot.load(id);
  if (snapshot == null) {
    snapshot = new VaultHourlySnapshot(id);
    snapshot.vault = vault.id;
    snapshot.hour = hour;
    snapshot.hourlyDepositedAssets = BIGINT_ZERO;
    snapshot.hourlyWithdrawnAssets = BIGINT_ZERO;
    snapshot.hourlyDepositCount = INT_ZERO;
    snapshot.hourlyWithdrawCount = INT_ZERO;
  }

  // State fields are overwritten, not accumulated: the row is the vault as it stood at the last
  // event of the hour.
  snapshot.timestamp = block.timestamp;
  snapshot.blockNumber = block.number;
  snapshot.totalAssets = vault.totalAssets;
  snapshot.totalShares = vault.totalShares;
  snapshot.sharePrice = vault.sharePrice;

  snapshot.hourlyDepositedAssets = snapshot.hourlyDepositedAssets.plus(depositedAssets);
  snapshot.hourlyWithdrawnAssets = snapshot.hourlyWithdrawnAssets.plus(withdrawnAssets);
  snapshot.hourlyDepositCount = snapshot.hourlyDepositCount + deposits;
  snapshot.hourlyWithdrawCount = snapshot.hourlyWithdrawCount + withdraws;

  snapshot.save();
}

function updateDaily(
  vault: Vault,
  block: ethereum.Block,
  depositedAssets: BigInt,
  withdrawnAssets: BigInt,
  deposits: i32,
  withdraws: i32,
): void {
  const day = (block.timestamp.toI64() / SECONDS_PER_DAY) as i32;
  const id = vault.id.concatI32(day);

  let snapshot = VaultDailySnapshot.load(id);
  if (snapshot == null) {
    snapshot = new VaultDailySnapshot(id);
    snapshot.vault = vault.id;
    snapshot.day = day;
    snapshot.dailyDepositedAssets = BIGINT_ZERO;
    snapshot.dailyWithdrawnAssets = BIGINT_ZERO;
    snapshot.dailyDepositCount = INT_ZERO;
    snapshot.dailyWithdrawCount = INT_ZERO;
  }

  snapshot.timestamp = block.timestamp;
  snapshot.blockNumber = block.number;
  snapshot.totalAssets = vault.totalAssets;
  snapshot.totalShares = vault.totalShares;
  snapshot.sharePrice = vault.sharePrice;

  snapshot.dailyDepositedAssets = snapshot.dailyDepositedAssets.plus(depositedAssets);
  snapshot.dailyWithdrawnAssets = snapshot.dailyWithdrawnAssets.plus(withdrawnAssets);
  snapshot.dailyDepositCount = snapshot.dailyDepositCount + deposits;
  snapshot.dailyWithdrawCount = snapshot.dailyWithdrawCount + withdraws;

  snapshot.save();
}
