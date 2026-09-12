import {Address, BigInt, Bytes, ethereum} from "@graphprotocol/graph-ts";
import {
  AuthorFeePaid,
  PositionClosed,
  PositionLiquidated,
  PositionOpened,
  Transfer,
} from "../generated/SyntheticVault/SyntheticVault";
import {AuthorFee, Position} from "../generated/schema";
import {BIGINT_ZERO, getOrCreateAsset, getOrCreateProtocol, getOrCreateTrader} from "./entities";
import {eventId, tokenIdToBytes} from "./ids";

const ZERO_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000000");

export function handlePositionOpened(event: PositionOpened): void {
  const protocol = getOrCreateProtocol(event.address);
  const asset = getOrCreateAsset(event.params.feedId);
  // The contract emits `msg.sender` as the owner, and stores the same address as the author. The
  // NFT can be sold later; the credit for the call cannot.
  const author = getOrCreateTrader(event.params.owner);

  const position = new Position(tokenIdToBytes(event.params.tokenId));
  position.tokenId = event.params.tokenId;
  position.asset = asset.id;
  position.author = author.id;
  position.owner = author.id;
  position.isLong = event.params.isLong;
  position.collateral = event.params.collateral;
  position.units = event.params.units;
  position.entryPrice = event.params.entryPrice;
  position.openedAt = event.block.timestamp;
  position.openedBlock = event.block.number;
  position.openedTx = event.transaction.hash;
  position.copyCount = 0;
  position.status = "OPEN";

  // A copiedFromId of zero means this is an original. Token ids start at one, so zero is free to
  // carry that meaning.
  if (event.params.copiedFromId.gt(BIGINT_ZERO)) {
    const originalId = tokenIdToBytes(event.params.copiedFromId);
    position.copiedFrom = originalId;

    const original = Position.load(originalId);
    if (original != null) {
      original.copyCount = original.copyCount + 1;
      original.save();

      // Credit goes to whoever authored the original, not to whoever holds it now.
      const originalAuthor = getOrCreateTrader(Address.fromBytes(original.author));
      originalAuthor.copiesReceived = originalAuthor.copiesReceived + 1;
      originalAuthor.save();
    }

    author.copiesMade = author.copiesMade + 1;
    protocol.copyCount = protocol.copyCount + 1;
  }

  position.save();

  author.positionsOpened = author.positionsOpened + 1;
  author.cumulativeCollateral = author.cumulativeCollateral.plus(event.params.collateral);
  author.save();

  asset.positionCount = asset.positionCount + 1;
  asset.openPositionCount = asset.openPositionCount + 1;
  if (event.params.isLong) {
    asset.longCount = asset.longCount + 1;
  } else {
    asset.shortCount = asset.shortCount + 1;
  }
  asset.cumulativeCollateral = asset.cumulativeCollateral.plus(event.params.collateral);
  asset.save();

  protocol.positionCount = protocol.positionCount + 1;
  protocol.openPositionCount = protocol.openPositionCount + 1;
  protocol.cumulativeCollateral = protocol.cumulativeCollateral.plus(event.params.collateral);
  protocol.save();
}

/// Shared by the close and the liquidation paths, which differ only in who pulled the trigger and
/// in the liquidator's reward.
function settle(
  event: ethereum.Event,
  tokenId: BigInt,
  closedBy: Address,
  exitPrice: BigInt,
  pnlWad: BigInt,
  payout: BigInt,
  liquidated: boolean,
): void {
  const position = Position.load(tokenIdToBytes(tokenId));
  if (position == null) {
    // A close with no matching open means the subgraph started after the position was created.
    // Counting the P&L would attribute it to nobody and skew every total it touched.
    return;
  }

  position.status = liquidated ? "LIQUIDATED" : "CLOSED";
  position.exitPrice = exitPrice;
  position.realizedPnlWad = pnlWad;
  position.payout = payout;
  position.closedAt = event.block.timestamp;
  position.closedBlock = event.block.number;
  position.closedBy = closedBy;
  position.save();

  // P&L is the author's result, not the current holder's. The author is who made the call, and the
  // leaderboard ranks calls.
  const author = getOrCreateTrader(Address.fromBytes(position.author));
  author.realizedPnlWad = author.realizedPnlWad.plus(pnlWad);
  author.positionsClosed = author.positionsClosed + 1;
  if (liquidated) {
    author.positionsLiquidated = author.positionsLiquidated + 1;
  }
  // A flat close is not a win. Rounding lands exactly on zero often enough that calling it one
  // would inflate every win rate on the board.
  if (pnlWad.gt(BIGINT_ZERO)) {
    author.wins = author.wins + 1;
  } else {
    author.losses = author.losses + 1;
  }
  author.save();

  const asset = getOrCreateAsset(position.asset);
  asset.openPositionCount = asset.openPositionCount - 1;
  asset.realizedPnlWad = asset.realizedPnlWad.plus(pnlWad);
  asset.save();

  const protocol = getOrCreateProtocol(event.address);
  protocol.openPositionCount = protocol.openPositionCount - 1;
  protocol.realizedPnlWad = protocol.realizedPnlWad.plus(pnlWad);
  if (liquidated) {
    protocol.liquidatedCount = protocol.liquidatedCount + 1;
  } else {
    protocol.closedCount = protocol.closedCount + 1;
  }
  protocol.save();
}

export function handlePositionClosed(event: PositionClosed): void {
  settle(
    event,
    event.params.tokenId,
    event.params.closedBy,
    event.params.exitPrice,
    event.params.pnlWad,
    event.params.payout,
    false,
  );
}

export function handlePositionLiquidated(event: PositionLiquidated): void {
  settle(
    event,
    event.params.tokenId,
    event.params.liquidator,
    event.params.exitPrice,
    event.params.pnlWad,
    event.params.payout,
    true,
  );

  const position = Position.load(tokenIdToBytes(event.params.tokenId));
  if (position == null) {
    return;
  }
  position.liquidationReward = event.params.reward;
  position.save();

  // The liquidator is a participant with income of their own, and `closedBy` should resolve to
  // somebody. Their reward is not P&L: they took no position and carried no risk.
  const liquidator = getOrCreateTrader(event.params.liquidator);
  liquidator.liquidationsPerformed = liquidator.liquidationsPerformed + 1;
  liquidator.liquidationRewardsEarned = liquidator.liquidationRewardsEarned.plus(
    event.params.reward,
  );
  liquidator.save();
}

export function handleAuthorFeePaid(event: AuthorFeePaid): void {
  const position = Position.load(tokenIdToBytes(event.params.tokenId));
  if (position == null) {
    return;
  }

  const author = getOrCreateTrader(event.params.author);

  const fee = new AuthorFee(eventId(event));
  fee.hash = event.transaction.hash;
  fee.logIndex = event.logIndex.toI32();
  fee.blockNumber = event.block.number;
  fee.timestamp = event.block.timestamp;
  fee.position = position.id;
  fee.author = author.id;
  fee.amount = event.params.amount;
  fee.save();

  position.authorFeePaid = event.params.amount;
  position.save();

  author.authorFeesEarned = author.authorFeesEarned.plus(event.params.amount);
  author.save();

  const protocol = getOrCreateProtocol(event.address);
  protocol.cumulativeAuthorFees = protocol.cumulativeAuthorFees.plus(event.params.amount);
  protocol.save();
}

/// Tracks who holds the NFT. Positions are transferable, so the holder and the author diverge.
export function handleTransfer(event: Transfer): void {
  // A mint is handled by `PositionOpened`, which knows the things a Transfer cannot carry.
  if (event.params.from.equals(ZERO_ADDRESS)) {
    return;
  }

  const position = Position.load(tokenIdToBytes(event.params.tokenId));
  if (position == null) {
    return;
  }

  // A close burns the NFT, and the burn is emitted before `PositionClosed`. Writing the zero
  // address as the owner would erase who actually held the position at the end.
  if (event.params.to.equals(ZERO_ADDRESS)) {
    return;
  }

  position.owner = getOrCreateTrader(event.params.to).id;
  position.save();
}
