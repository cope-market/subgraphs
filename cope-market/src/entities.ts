import {Address, BigInt, Bytes} from "@graphprotocol/graph-ts";
import {Asset, Protocol, Trader} from "../generated/schema";

export const BIGINT_ZERO = BigInt.zero();
export const INT_ZERO = 0 as i32;

export function getOrCreateProtocol(address: Address): Protocol {
  let protocol = Protocol.load(address);
  if (protocol != null) {
    return protocol;
  }
  protocol = new Protocol(address);
  protocol.positionCount = INT_ZERO;
  protocol.openPositionCount = INT_ZERO;
  protocol.closedCount = INT_ZERO;
  protocol.liquidatedCount = INT_ZERO;
  protocol.copyCount = INT_ZERO;
  protocol.cumulativeCollateral = BIGINT_ZERO;
  protocol.realizedPnlWad = BIGINT_ZERO;
  protocol.cumulativeAuthorFees = BIGINT_ZERO;
  protocol.save();
  return protocol;
}

export function getOrCreateAsset(feedId: Bytes): Asset {
  let asset = Asset.load(feedId);
  if (asset != null) {
    return asset;
  }
  asset = new Asset(feedId);
  asset.positionCount = INT_ZERO;
  asset.openPositionCount = INT_ZERO;
  asset.longCount = INT_ZERO;
  asset.shortCount = INT_ZERO;
  asset.cumulativeCollateral = BIGINT_ZERO;
  asset.realizedPnlWad = BIGINT_ZERO;
  asset.save();
  return asset;
}

export function getOrCreateTrader(address: Address): Trader {
  let trader = Trader.load(address);
  if (trader != null) {
    return trader;
  }
  trader = new Trader(address);
  trader.positionsOpened = INT_ZERO;
  trader.positionsClosed = INT_ZERO;
  trader.positionsLiquidated = INT_ZERO;
  trader.liquidationsPerformed = INT_ZERO;
  trader.liquidationRewardsEarned = BIGINT_ZERO;
  trader.realizedPnlWad = BIGINT_ZERO;
  trader.wins = INT_ZERO;
  trader.losses = INT_ZERO;
  trader.cumulativeCollateral = BIGINT_ZERO;
  trader.copiesMade = INT_ZERO;
  trader.copiesReceived = INT_ZERO;
  trader.authorFeesEarned = BIGINT_ZERO;
  trader.save();
  return trader;
}
