// Scaffold mappings. Workstream step 5.3 replaces the bodies.
import {Address, Bytes} from "@graphprotocol/graph-ts";
import {Deposit, ERC4626, Transfer, Withdraw} from "../generated/Vault/ERC4626";
import {Vault} from "../generated/schema";

/// Reads `asset()` once per vault and stores it. Every handler needs the vault row to exist, and
/// ERC-4626 gives no creation event to seed it from.
function loadVault(address: Address): Vault {
  let vault = Vault.load(address);
  if (vault != null) {
    return vault;
  }
  vault = new Vault(address);
  const bound = ERC4626.bind(address);
  const asset = bound.try_asset();
  vault.asset = asset.reverted ? Bytes.empty() : Bytes.fromHexString(asset.value.toHexString());
  vault.save();
  return vault;
}

export function handleDeposit(event: Deposit): void {
  loadVault(event.address);
}

export function handleWithdraw(event: Withdraw): void {
  loadVault(event.address);
}

export function handleTransfer(event: Transfer): void {
  loadVault(event.address);
}
