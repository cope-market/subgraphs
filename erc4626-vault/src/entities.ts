import {Address, BigInt, Bytes, ethereum} from "@graphprotocol/graph-ts";
import {ERC20, ERC4626} from "./bindings";
import {Account, Token, Vault, VaultPosition} from "../generated/schema";
import {
  BIGDECIMAL_ONE,
  BIGINT_ZERO,
  DEFAULT_DECIMALS,
  INT_ZERO,
  UNKNOWN_TOKEN_NAME,
  UNKNOWN_TOKEN_SYMBOL,
} from "./constants";
import {sharePriceOf} from "./decimals";

/// Reads a token's ERC-20 metadata once and stores it.
///
/// `name`, `symbol` and `decimals` are all optional in ERC-20, and tokens that predate the final
/// standard return `bytes32` rather than `string`, which reverts against a `string` ABI. A
/// standardized subgraph has to index those vaults too, so every call falls back rather than
/// aborting the handler.
export function getOrCreateToken(address: Address): Token {
  let token = Token.load(address);
  if (token != null) {
    return token;
  }
  token = new Token(address);

  const contract = ERC20.bind(address);

  const name = contract.try_name();
  token.name = name.reverted ? UNKNOWN_TOKEN_NAME : name.value;

  const symbol = contract.try_symbol();
  token.symbol = symbol.reverted ? UNKNOWN_TOKEN_SYMBOL : symbol.value;

  const decimals = contract.try_decimals();
  token.decimals = decimals.reverted ? DEFAULT_DECIMALS : decimals.value;

  token.save();
  return token;
}

/// ERC-4626 defines no creation event, so the vault row is seeded by whichever of its logs arrives
/// first rather than by a factory handler.
export function getOrCreateVault(address: Address, block: ethereum.Block): Vault {
  let vault = Vault.load(address);
  if (vault != null) {
    return vault;
  }
  vault = new Vault(address);

  const contract = ERC4626.bind(address);

  const name = contract.try_name();
  vault.name = name.reverted ? UNKNOWN_TOKEN_NAME : name.value;

  const symbol = contract.try_symbol();
  vault.symbol = symbol.reverted ? UNKNOWN_TOKEN_SYMBOL : symbol.value;

  const decimals = contract.try_decimals();
  vault.decimals = decimals.reverted ? DEFAULT_DECIMALS : decimals.value;

  const asset = contract.try_asset();
  // A vault whose `asset()` does not answer is not an ERC-4626 vault. Recording the zero address
  // keeps the row valid and makes the misconfiguration visible in a query rather than as a gap.
  const assetAddress = asset.reverted ? Address.zero() : asset.value;
  vault.asset = getOrCreateToken(assetAddress).id;

  vault.totalAssets = BIGINT_ZERO;
  vault.totalShares = BIGINT_ZERO;
  vault.sharePrice = BIGDECIMAL_ONE;
  vault.cumulativeDepositedAssets = BIGINT_ZERO;
  vault.cumulativeWithdrawnAssets = BIGINT_ZERO;
  vault.depositCount = INT_ZERO;
  vault.withdrawCount = INT_ZERO;
  vault.shareTransferCount = INT_ZERO;
  vault.cumulativeAccountCount = INT_ZERO;
  vault.openPositionCount = INT_ZERO;
  vault.firstSeenBlock = block.number;
  vault.firstSeenTimestamp = block.timestamp;
  vault.lastUpdatedBlock = block.number;
  vault.lastUpdatedTimestamp = block.timestamp;

  vault.save();
  return vault;
}

/// Re-reads `totalAssets()` and `totalSupply()` and recomputes the share price.
///
/// Both are read rather than accumulated from events. A vault's assets move without emitting
/// anything — yield accrues, and in Cope Market's case traders win and lose against the pool — so
/// a running total kept from `Deposit` and `Withdraw` alone would drift away from the truth and
/// never come back.
export function refreshVault(vault: Vault, block: ethereum.Block): void {
  const contract = ERC4626.bind(Address.fromBytes(vault.id));

  const totalAssets = contract.try_totalAssets();
  if (!totalAssets.reverted) {
    vault.totalAssets = totalAssets.value;
  }

  const totalSupply = contract.try_totalSupply();
  if (!totalSupply.reverted) {
    vault.totalShares = totalSupply.value;
  }

  const asset = Token.load(vault.asset);
  const assetDecimals = asset == null ? DEFAULT_DECIMALS : asset.decimals;
  vault.sharePrice = sharePriceOf(
    vault.totalAssets,
    assetDecimals,
    vault.totalShares,
    vault.decimals,
  );

  vault.lastUpdatedBlock = block.number;
  vault.lastUpdatedTimestamp = block.timestamp;
  vault.save();
}

export function getOrCreateAccount(address: Address): Account {
  let account = Account.load(address);
  if (account != null) {
    return account;
  }
  account = new Account(address);
  account.depositCount = INT_ZERO;
  account.withdrawCount = INT_ZERO;
  account.save();
  return account;
}

export function positionId(vault: Vault, account: Account): Bytes {
  return vault.id.concat(account.id);
}

/// Creating a position bumps the vault's lifetime account count. That counter is "accounts that
/// have ever held shares", so it is incremented here and never decremented on exit.
export function getOrCreatePosition(
  vault: Vault,
  account: Account,
  block: ethereum.Block,
): VaultPosition {
  const id = positionId(vault, account);
  let position = VaultPosition.load(id);
  if (position != null) {
    return position;
  }

  position = new VaultPosition(id);
  position.vault = vault.id;
  position.account = account.id;
  position.shares = BIGINT_ZERO;
  position.cumulativeDepositedAssets = BIGINT_ZERO;
  position.cumulativeWithdrawnAssets = BIGINT_ZERO;
  position.sharesReceived = BIGINT_ZERO;
  position.sharesSent = BIGINT_ZERO;
  position.depositCount = INT_ZERO;
  position.withdrawCount = INT_ZERO;
  position.isOpen = false;
  position.openedBlock = block.number;
  position.openedTimestamp = block.timestamp;
  position.lastUpdatedBlock = block.number;
  position.lastUpdatedTimestamp = block.timestamp;
  position.save();

  vault.cumulativeAccountCount = vault.cumulativeAccountCount + 1;
  vault.save();

  return position;
}

/// Applies a share balance change and keeps `isOpen` and the vault's open-position count in step.
///
/// The open-position count is maintained here rather than recomputed, because a subgraph cannot
/// count rows: there is no aggregate over the store, so any "how many holders" figure has to be
/// carried forward one event at a time.
export function applyShareDelta(
  vault: Vault,
  position: VaultPosition,
  delta: BigInt,
  block: ethereum.Block,
): void {
  const wasOpen = position.isOpen;
  position.shares = position.shares.plus(delta);
  position.isOpen = position.shares.gt(BIGINT_ZERO);

  if (position.isOpen && !wasOpen) {
    vault.openPositionCount = vault.openPositionCount + 1;
  } else if (!position.isOpen && wasOpen) {
    vault.openPositionCount = vault.openPositionCount - 1;
  }

  position.lastUpdatedBlock = block.number;
  position.lastUpdatedTimestamp = block.timestamp;
  position.save();
  vault.save();
}
