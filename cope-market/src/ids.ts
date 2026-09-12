import {BigInt, Bytes, ethereum} from "@graphprotocol/graph-ts";

/// Token ids as 32-byte big-endian.
///
/// `Bytes.fromBigInt` writes little-endian and trims to the value's own width, so ids 1 and 256
/// come out as 0x01 and 0x0001 — different lengths, ordered backwards. Store ids sort as bytes, so
/// that would make `orderBy: id` unrelated to mint order.
export function tokenIdToBytes(tokenId: BigInt): Bytes {
  let hex = tokenId.toHexString().slice(2);
  while (hex.length < 64) {
    hex = "0" + hex;
  }
  return Bytes.fromHexString("0x" + hex);
}

/// Event ids are the transaction hash followed by the log index. Two closes in one transaction are
/// ordinary — a batch, or a liquidation sweep — so the hash alone does not identify a log.
export function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}
