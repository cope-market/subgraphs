import {Address, BigInt, Bytes, ethereum} from "@graphprotocol/graph-ts";
import {newMockEvent} from "matchstick-as/assembly/index";
import {
  AuthorFeePaid,
  PositionClosed,
  PositionLiquidated,
  PositionOpened,
  Transfer,
} from "../generated/SyntheticVault/SyntheticVault";

export const VAULT = Address.fromString("0x2c720283a8bbb5cc5b13c0c4bcf2300826286c47");
export const ALICE = Address.fromString("0x1111111111111111111111111111111111111111");
export const BOB = Address.fromString("0x2222222222222222222222222222222222222222");
export const CAROL = Address.fromString("0x3333333333333333333333333333333333333333");
export const ZERO = Address.fromString("0x0000000000000000000000000000000000000000");

export const BTC = Bytes.fromHexString(
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
);
export const ETH = Bytes.fromHexString(
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
);

/// Matchstick stamps every mock event with the same transaction hash and log index, and event ids
/// are the hash followed by the index. Without a distinct index every event overwrites the last.
let logIndexCounter = 0;

function nextLogIndex(): BigInt {
  logIndexCounter += 1;
  return BigInt.fromI32(logIndexCounter);
}

export function positionId(tokenId: i32): string {
  let hex = BigInt.fromI32(tokenId).toHexString().slice(2);
  while (hex.length < 64) {
    hex = "0" + hex;
  }
  return "0x" + hex;
}

export function openedEvent(
  tokenId: i32,
  owner: Address,
  feedId: Bytes,
  isLong: boolean,
  collateral: BigInt,
  copiedFromId: i32,
): PositionOpened {
  const event = changetype<PositionOpened>(newMockEvent());
  event.address = VAULT;
  event.logIndex = nextLogIndex();
  event.parameters = [
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner)),
    new ethereum.EventParam("feedId", ethereum.Value.fromFixedBytes(feedId)),
    new ethereum.EventParam("isLong", ethereum.Value.fromBoolean(isLong)),
    new ethereum.EventParam("collateral", ethereum.Value.fromUnsignedBigInt(collateral)),
    new ethereum.EventParam(
      "units",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000")),
    ),
    new ethereum.EventParam(
      "entryPrice",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("77325700000000000000000")),
    ),
    new ethereum.EventParam(
      "copiedFromId",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(copiedFromId)),
    ),
  ];
  return event;
}

export function closedEvent(
  tokenId: i32,
  closedBy: Address,
  feedId: Bytes,
  pnlWad: BigInt,
  payout: BigInt,
): PositionClosed {
  const event = changetype<PositionClosed>(newMockEvent());
  event.address = VAULT;
  event.logIndex = nextLogIndex();
  event.parameters = [
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
    new ethereum.EventParam("closedBy", ethereum.Value.fromAddress(closedBy)),
    new ethereum.EventParam("feedId", ethereum.Value.fromFixedBytes(feedId)),
    new ethereum.EventParam(
      "exitPrice",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("78000000000000000000000")),
    ),
    new ethereum.EventParam("pnlWad", ethereum.Value.fromSignedBigInt(pnlWad)),
    new ethereum.EventParam("payout", ethereum.Value.fromUnsignedBigInt(payout)),
  ];
  return event;
}

export function liquidatedEvent(
  tokenId: i32,
  liquidator: Address,
  feedId: Bytes,
  pnlWad: BigInt,
  payout: BigInt,
  reward: BigInt,
): PositionLiquidated {
  const event = changetype<PositionLiquidated>(newMockEvent());
  event.address = VAULT;
  event.logIndex = nextLogIndex();
  event.parameters = [
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
    new ethereum.EventParam("liquidator", ethereum.Value.fromAddress(liquidator)),
    new ethereum.EventParam("feedId", ethereum.Value.fromFixedBytes(feedId)),
    new ethereum.EventParam(
      "exitPrice",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("70000000000000000000000")),
    ),
    new ethereum.EventParam("pnlWad", ethereum.Value.fromSignedBigInt(pnlWad)),
    new ethereum.EventParam("payout", ethereum.Value.fromUnsignedBigInt(payout)),
    new ethereum.EventParam("reward", ethereum.Value.fromUnsignedBigInt(reward)),
  ];
  return event;
}

export function authorFeeEvent(tokenId: i32, author: Address, amount: BigInt): AuthorFeePaid {
  const event = changetype<AuthorFeePaid>(newMockEvent());
  event.address = VAULT;
  event.logIndex = nextLogIndex();
  event.parameters = [
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
    new ethereum.EventParam("author", ethereum.Value.fromAddress(author)),
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount)),
  ];
  return event;
}

export function nftTransferEvent(from: Address, to: Address, tokenId: i32): Transfer {
  const event = changetype<Transfer>(newMockEvent());
  event.address = VAULT;
  event.logIndex = nextLogIndex();
  event.parameters = [
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from)),
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to)),
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
  ];
  return event;
}

/// 2 USDC, the size the live smoke test used.
export const TWO_USDC = BigInt.fromI32(2_000_000);
export const WAD = BigInt.fromString("1000000000000000000");
