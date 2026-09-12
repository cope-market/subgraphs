import {Address, BigInt, ethereum} from "@graphprotocol/graph-ts";
import {
  afterEach,
  assert,
  clearStore,
  createMockedFunction,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import {Deposit} from "../generated/Vault/ERC4626";
import {handleDeposit} from "../src/vault";

const VAULT = Address.fromString("0x0ffabc4e80125c5742d5ed04cc1fd1b634bc3c5d");
const ASSET = Address.fromString("0x3600000000000000000000000000000000000000");
const ALICE = Address.fromString("0x1111111111111111111111111111111111111111");

/// Builds a Deposit log against `VAULT`. Matchstick has no manifest-driven event factory, so every
/// test that needs an event assembles one by hand.
function depositEvent(assets: BigInt, shares: BigInt): Deposit {
  const event = changetype<Deposit>(newMockEvent());
  event.address = VAULT;
  event.parameters = [
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(ALICE)),
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(ALICE)),
    new ethereum.EventParam("assets", ethereum.Value.fromUnsignedBigInt(assets)),
    new ethereum.EventParam("shares", ethereum.Value.fromUnsignedBigInt(shares)),
  ];
  return event;
}

function mockAsset(): void {
  createMockedFunction(VAULT, "asset", "asset():(address)").returns([
    ethereum.Value.fromAddress(ASSET),
  ]);
}

describe("vault bootstrapping", () => {
  afterEach(() => {
    clearStore();
  });

  test("the first event creates the vault and records its asset", () => {
    mockAsset();
    handleDeposit(depositEvent(BigInt.fromI32(1000), BigInt.fromI32(1000)));

    assert.entityCount("Vault", 1);
    assert.fieldEquals("Vault", VAULT.toHexString(), "asset", ASSET.toHexString());
  });

  /// `asset()` is read once and cached. A second event must not re-enter the bind, because on a
  /// vault whose call reverts that would rewrite the field on every log.
  test("a second event reuses the existing vault", () => {
    mockAsset();
    handleDeposit(depositEvent(BigInt.fromI32(1000), BigInt.fromI32(1000)));
    handleDeposit(depositEvent(BigInt.fromI32(2000), BigInt.fromI32(2000)));

    assert.entityCount("Vault", 1);
  });
});
