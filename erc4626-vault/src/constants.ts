import {Address, BigDecimal, BigInt} from "@graphprotocol/graph-ts";

export const ZERO_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000000");

export const INT_ZERO = 0 as i32;
export const INT_ONE = 1 as i32;

export const BIGINT_ZERO = BigInt.zero();
export const BIGDECIMAL_ZERO = BigDecimal.zero();
export const BIGDECIMAL_ONE = BigDecimal.fromString("1");

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;

/// Read when a token's own `decimals()` reverts. Eighteen is the ERC-20 default the standard
/// suggests, and guessing it is better than refusing to index the vault at all.
export const DEFAULT_DECIMALS = 18 as i32;

export const UNKNOWN_TOKEN_NAME = "unknown";
export const UNKNOWN_TOKEN_SYMBOL = "???";
