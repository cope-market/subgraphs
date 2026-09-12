import {BigDecimal, BigInt} from "@graphprotocol/graph-ts";
import {BIGDECIMAL_ONE, BIGDECIMAL_ZERO} from "./constants";

/// 10^`decimals` as a BigDecimal. AssemblyScript has no exponent operator on BigDecimal, and
/// `BigInt.pow` takes a u8, so anything past 255 decimals is not representable anyway.
export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let result = BigInt.fromI32(1);
  const ten = BigInt.fromI32(10);
  for (let i = 0; i < decimals; i++) {
    result = result.times(ten);
  }
  return result.toBigDecimal();
}

/// Converts a raw token amount to its human-readable value.
export function toDecimal(amount: BigInt, decimals: i32): BigDecimal {
  return amount.toBigDecimal().div(exponentToBigDecimal(decimals));
}

/// Assets per share, with both sides' decimals removed first.
///
/// A vault may hold an asset with different decimals from its own shares — ERC-4626 explicitly
/// allows an offset, and offsetting is the usual defence against the empty-vault inflation attack.
/// Dividing the raw integers would report a vault with 6-decimal assets and 18-decimal shares at a
/// share price of roughly 1e-12 rather than 1.
///
/// An empty vault has no share price. One is the honest answer there: it is what the next
/// depositor will pay, and it keeps a chart from opening at zero.
export function sharePriceOf(
  totalAssets: BigInt,
  assetDecimals: i32,
  totalShares: BigInt,
  shareDecimals: i32,
): BigDecimal {
  if (totalShares.isZero()) {
    return BIGDECIMAL_ONE;
  }
  const shares = toDecimal(totalShares, shareDecimals);
  if (shares.equals(BIGDECIMAL_ZERO)) {
    return BIGDECIMAL_ONE;
  }
  return toDecimal(totalAssets, assetDecimals).div(shares);
}
