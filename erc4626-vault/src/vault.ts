import {Bytes, ethereum} from "@graphprotocol/graph-ts";
import {Deposit as DepositEvent, Transfer, Withdraw as WithdrawEvent} from "./bindings";
import {Deposit, ShareTransfer, Token, Vault, Withdraw} from "../generated/schema";
import {BIGINT_ZERO, DEFAULT_DECIMALS, ZERO_ADDRESS} from "./constants";
import {sharePriceOf} from "./decimals";
import {
  applyShareDelta,
  getOrCreateAccount,
  getOrCreatePosition,
  getOrCreateVault,
  refreshVault,
} from "./entities";
import {updateSnapshots} from "./snapshots";

/// Event ids are the transaction hash followed by the log index. Two deposits in one transaction
/// are ordinary — a router, or a multicall — so the hash alone does not identify a log.
function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

function assetDecimalsOf(vault: Vault): i32 {
  const asset = Token.load(vault.asset);
  return asset == null ? DEFAULT_DECIMALS : asset.decimals;
}

export function handleDeposit(event: DepositEvent): void {
  const vault = getOrCreateVault(event.address, event.block);
  const sender = getOrCreateAccount(event.params.sender);
  // The shares are minted to `owner`, so the stake — and everything counted against it — is theirs,
  // not the caller's. `sender` is recorded on the event so a router's deposits stay traceable.
  const owner = getOrCreateAccount(event.params.owner);
  const position = getOrCreatePosition(vault, owner, event.block);

  const deposit = new Deposit(eventId(event));
  deposit.hash = event.transaction.hash;
  deposit.logIndex = event.logIndex.toI32();
  deposit.blockNumber = event.block.number;
  deposit.timestamp = event.block.timestamp;
  deposit.vault = vault.id;
  deposit.sender = sender.id;
  deposit.owner = owner.id;
  deposit.assets = event.params.assets;
  deposit.shares = event.params.shares;
  deposit.sharePrice = sharePriceOf(
    event.params.assets,
    assetDecimalsOf(vault),
    event.params.shares,
    vault.decimals,
  );
  deposit.save();

  position.cumulativeDepositedAssets = position.cumulativeDepositedAssets.plus(event.params.assets);
  position.depositCount = position.depositCount + 1;
  position.save();

  owner.depositCount = owner.depositCount + 1;
  owner.save();

  vault.cumulativeDepositedAssets = vault.cumulativeDepositedAssets.plus(event.params.assets);
  vault.depositCount = vault.depositCount + 1;
  vault.save();

  refreshVault(vault, event.block);
  updateSnapshots(vault, event.block, event.params.assets, BIGINT_ZERO, 1, 0);
}

export function handleWithdraw(event: WithdrawEvent): void {
  const vault = getOrCreateVault(event.address, event.block);
  const sender = getOrCreateAccount(event.params.sender);
  const receiver = getOrCreateAccount(event.params.receiver);
  // The burned shares are `owner`'s. `receiver` may be anyone — ERC-4626 allows withdrawing to a
  // third party — so the assets leaving the position are counted against the owner.
  const owner = getOrCreateAccount(event.params.owner);
  const position = getOrCreatePosition(vault, owner, event.block);

  const withdraw = new Withdraw(eventId(event));
  withdraw.hash = event.transaction.hash;
  withdraw.logIndex = event.logIndex.toI32();
  withdraw.blockNumber = event.block.number;
  withdraw.timestamp = event.block.timestamp;
  withdraw.vault = vault.id;
  withdraw.sender = sender.id;
  withdraw.receiver = receiver.id;
  withdraw.owner = owner.id;
  withdraw.assets = event.params.assets;
  withdraw.shares = event.params.shares;
  withdraw.sharePrice = sharePriceOf(
    event.params.assets,
    assetDecimalsOf(vault),
    event.params.shares,
    vault.decimals,
  );
  withdraw.save();

  position.cumulativeWithdrawnAssets = position.cumulativeWithdrawnAssets.plus(event.params.assets);
  position.withdrawCount = position.withdrawCount + 1;
  position.save();

  owner.withdrawCount = owner.withdrawCount + 1;
  owner.save();

  vault.cumulativeWithdrawnAssets = vault.cumulativeWithdrawnAssets.plus(event.params.assets);
  vault.withdrawCount = vault.withdrawCount + 1;
  vault.save();

  refreshVault(vault, event.block);
  updateSnapshots(vault, event.block, BIGINT_ZERO, event.params.assets, 0, 1);
}

/// Share balances are maintained here and nowhere else.
///
/// A deposit emits both a `Transfer` from the zero address and a `Deposit` describing the same
/// share movement. Applying the delta in both handlers would double every balance. Deriving it from
/// `Transfer` alone is also the more complete of the two: it catches shares that move without a
/// deposit or a withdrawal, which is the only way a secondary sale appears on chain.
export function handleTransfer(event: Transfer): void {
  const vault = getOrCreateVault(event.address, event.block);
  const shares = event.params.value;

  const isMint = event.params.from.equals(ZERO_ADDRESS);
  const isBurn = event.params.to.equals(ZERO_ADDRESS);

  const from = getOrCreateAccount(event.params.from);
  const to = getOrCreateAccount(event.params.to);

  const transfer = new ShareTransfer(eventId(event));
  transfer.hash = event.transaction.hash;
  transfer.logIndex = event.logIndex.toI32();
  transfer.blockNumber = event.block.number;
  transfer.timestamp = event.block.timestamp;
  transfer.vault = vault.id;
  transfer.from = from.id;
  transfer.to = to.id;
  transfer.shares = shares;
  transfer.isMint = isMint;
  transfer.isBurn = isBurn;
  transfer.save();

  // A mint or a burn is the share half of a deposit or a withdrawal. Only movement between two
  // real holders is a transfer in the sense anyone means when they ask how often shares changed
  // hands, so that is what the counters and the per-position totals record.
  const isSecondary = !isMint && !isBurn;

  if (!isMint) {
    const position = getOrCreatePosition(vault, from, event.block);
    if (isSecondary) {
      position.sharesSent = position.sharesSent.plus(shares);
      position.save();
    }
    applyShareDelta(vault, position, BIGINT_ZERO.minus(shares), event.block);
  }

  if (!isBurn) {
    const position = getOrCreatePosition(vault, to, event.block);
    if (isSecondary) {
      position.sharesReceived = position.sharesReceived.plus(shares);
      position.save();
    }
    applyShareDelta(vault, position, shares, event.block);
  }

  if (isSecondary) {
    vault.shareTransferCount = vault.shareTransferCount + 1;
    vault.save();
  }

  refreshVault(vault, event.block);
  updateSnapshots(vault, event.block, BIGINT_ZERO, BIGINT_ZERO, 0, 0);
}
