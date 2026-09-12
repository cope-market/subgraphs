import {Address, BigInt, ethereum} from "@graphprotocol/graph-ts";
import {createMockedFunction, newMockEvent} from "matchstick-as/assembly/index";
import {Deposit, Transfer, Withdraw} from "../generated/Vault/ERC4626";

export const VAULT = Address.fromString("0x0ffabc4e80125c5742d5ed04cc1fd1b634bc3c5d");
export const ASSET = Address.fromString("0x3600000000000000000000000000000000000000");
export const ALICE = Address.fromString("0x1111111111111111111111111111111111111111");
export const BOB = Address.fromString("0x2222222222222222222222222222222222222222");
export const ZERO = Address.fromString("0x0000000000000000000000000000000000000000");

/// Cope Market's LiquidityVault shape: a 6-decimal asset under 18-decimal shares. The mismatch is
/// the case a naive share price gets wrong, so it is the default the tests are written against.
export function mockVault(totalAssets: BigInt, totalShares: BigInt): void {
  createMockedFunction(VAULT, "asset", "asset():(address)").returns([
    ethereum.Value.fromAddress(ASSET),
  ]);
  createMockedFunction(VAULT, "name", "name():(string)").returns([
    ethereum.Value.fromString("Cope Market LP"),
  ]);
  createMockedFunction(VAULT, "symbol", "symbol():(string)").returns([
    ethereum.Value.fromString("cmLP"),
  ]);
  createMockedFunction(VAULT, "decimals", "decimals():(uint8)").returns([
    ethereum.Value.fromI32(18),
  ]);
  createMockedFunction(ASSET, "name", "name():(string)").returns([
    ethereum.Value.fromString("USD Coin"),
  ]);
  createMockedFunction(ASSET, "symbol", "symbol():(string)").returns([
    ethereum.Value.fromString("USDC"),
  ]);
  createMockedFunction(ASSET, "decimals", "decimals():(uint8)").returns([
    ethereum.Value.fromI32(6),
  ]);
  mockTotals(totalAssets, totalShares);
}

export function mockTotals(totalAssets: BigInt, totalShares: BigInt): void {
  createMockedFunction(VAULT, "totalAssets", "totalAssets():(uint256)").returns([
    ethereum.Value.fromUnsignedBigInt(totalAssets),
  ]);
  createMockedFunction(VAULT, "totalSupply", "totalSupply():(uint256)").returns([
    ethereum.Value.fromUnsignedBigInt(totalShares),
  ]);
}

/// Every metadata and state call reverts. A vault that answers nothing must still index.
export function mockSilentVault(): void {
  createMockedFunction(VAULT, "asset", "asset():(address)").reverts();
  createMockedFunction(VAULT, "name", "name():(string)").reverts();
  createMockedFunction(VAULT, "symbol", "symbol():(string)").reverts();
  createMockedFunction(VAULT, "decimals", "decimals():(uint8)").reverts();
  createMockedFunction(VAULT, "totalAssets", "totalAssets():(uint256)").reverts();
  createMockedFunction(VAULT, "totalSupply", "totalSupply():(uint256)").reverts();
  createMockedFunction(ZERO, "name", "name():(string)").reverts();
  createMockedFunction(ZERO, "symbol", "symbol():(string)").reverts();
  createMockedFunction(ZERO, "decimals", "decimals():(uint8)").reverts();
}

export function depositEvent(
  sender: Address,
  owner: Address,
  assets: BigInt,
  shares: BigInt,
): Deposit {
  const event = changetype<Deposit>(newMockEvent());
  event.address = VAULT;
  event.parameters = [
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender)),
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner)),
    new ethereum.EventParam("assets", ethereum.Value.fromUnsignedBigInt(assets)),
    new ethereum.EventParam("shares", ethereum.Value.fromUnsignedBigInt(shares)),
  ];
  return event;
}

export function withdrawEvent(
  sender: Address,
  receiver: Address,
  owner: Address,
  assets: BigInt,
  shares: BigInt,
): Withdraw {
  const event = changetype<Withdraw>(newMockEvent());
  event.address = VAULT;
  event.parameters = [
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender)),
    new ethereum.EventParam("receiver", ethereum.Value.fromAddress(receiver)),
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner)),
    new ethereum.EventParam("assets", ethereum.Value.fromUnsignedBigInt(assets)),
    new ethereum.EventParam("shares", ethereum.Value.fromUnsignedBigInt(shares)),
  ];
  return event;
}

export function transferEvent(from: Address, to: Address, shares: BigInt): Transfer {
  const event = changetype<Transfer>(newMockEvent());
  event.address = VAULT;
  event.parameters = [
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from)),
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to)),
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(shares)),
  ];
  return event;
}

/// 10^`decimals` as a BigInt, for writing expected amounts without a row of zeros.
export function pow10(decimals: i32): BigInt {
  let result = BigInt.fromI32(1);
  const ten = BigInt.fromI32(10);
  for (let i = 0; i < decimals; i++) {
    result = result.times(ten);
  }
  return result;
}
