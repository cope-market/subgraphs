import {Deposit, Transfer, Withdraw} from "../generated/Vault/ERC4626";
import {getOrCreateVault, refreshVault} from "./entities";

// Step 5.3 adds the Deposit, Withdraw, position and counter accounting; step 5.4 adds share
// transfers and snapshots. Until then every handler does the one thing the vault row always needs:
// exist, and hold current on-chain state.

export function handleDeposit(event: Deposit): void {
  const vault = getOrCreateVault(event.address, event.block);
  refreshVault(vault, event.block);
}

export function handleWithdraw(event: Withdraw): void {
  const vault = getOrCreateVault(event.address, event.block);
  refreshVault(vault, event.block);
}

export function handleTransfer(event: Transfer): void {
  const vault = getOrCreateVault(event.address, event.block);
  refreshVault(vault, event.block);
}
