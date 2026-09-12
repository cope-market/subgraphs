// Scaffold mappings. Workstream step 5.7 replaces the bodies.
import {BigInt, Bytes} from "@graphprotocol/graph-ts";
import {PositionOpened} from "../generated/SyntheticVault/SyntheticVault";
import {Position} from "../generated/schema";

/// `Bytes.fromBigInt` writes little-endian and trims to the value's own width, so token id 1 and
/// token id 256 come out as `0x01` and `0x0001` — different lengths, and ordered backwards. Ids in
/// the store sort as bytes, so a 32-byte big-endian form is what makes `orderBy: id` mean
/// "by token id".
export function tokenIdToBytes(tokenId: BigInt): Bytes {
  let hex = tokenId.toHexString().slice(2);
  while (hex.length < 64) {
    hex = "0" + hex;
  }
  return Bytes.fromHexString("0x" + hex);
}

export function handlePositionOpened(event: PositionOpened): void {
  const position = new Position(tokenIdToBytes(event.params.tokenId));
  position.feedId = event.params.feedId;
  position.isLong = event.params.isLong;
  position.save();
}
