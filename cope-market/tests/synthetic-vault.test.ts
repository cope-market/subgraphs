import {Address, BigInt, Bytes, ethereum} from "@graphprotocol/graph-ts";
import {
  afterEach,
  assert,
  clearStore,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import {PositionOpened} from "../generated/SyntheticVault/SyntheticVault";
import {handlePositionOpened, tokenIdToBytes} from "../src/synthetic-vault";

const BTC = Bytes.fromHexString(
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
);
const ALICE = Address.fromString("0x1111111111111111111111111111111111111111");

function openedEvent(tokenId: i32, isLong: boolean): PositionOpened {
  const event = changetype<PositionOpened>(newMockEvent());
  event.parameters = [
    new ethereum.EventParam("tokenId", ethereum.Value.fromI32(tokenId)),
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(ALICE)),
    new ethereum.EventParam("feedId", ethereum.Value.fromFixedBytes(BTC)),
    new ethereum.EventParam("isLong", ethereum.Value.fromBoolean(isLong)),
    new ethereum.EventParam("collateral", ethereum.Value.fromI32(2_000_000)),
    new ethereum.EventParam("units", ethereum.Value.fromI32(1000)),
    new ethereum.EventParam(
      "entryPrice",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(77_325)),
    ),
    new ethereum.EventParam("copiedFromId", ethereum.Value.fromI32(0)),
  ];
  return event;
}

describe("positions", () => {
  afterEach(() => {
    clearStore();
  });

  test("an opened position is recorded under its token id", () => {
    handlePositionOpened(openedEvent(1, true));

    const id = tokenIdToBytes(BigInt.fromI32(1)).toHexString();
    assert.entityCount("Position", 1);
    assert.fieldEquals("Position", id, "isLong", "true");
    assert.fieldEquals("Position", id, "feedId", BTC.toHexString());
  });

  /// Ids must be fixed-width and big-endian, or `orderBy: id` walks token ids in an order that has
  /// nothing to do with the order they were minted in.
  test("token ids are 32-byte big-endian, so they sort in mint order", () => {
    const first = tokenIdToBytes(BigInt.fromI32(1)).toHexString();
    const later = tokenIdToBytes(BigInt.fromI32(256)).toHexString();

    assert.stringEquals(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      first,
    );
    assert.stringEquals(
      "0x0000000000000000000000000000000000000000000000000000000000000100",
      later,
    );
    assert.booleanEquals(true, first < later);
  });
});
