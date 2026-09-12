import {BigInt} from "@graphprotocol/graph-ts";
import {afterEach, assert, clearStore, describe, test} from "matchstick-as/assembly/index";
import {
  handleAuthorFeePaid,
  handlePositionClosed,
  handlePositionLiquidated,
  handlePositionOpened,
  handleTransfer,
} from "../src/synthetic-vault";
import {
  ALICE,
  BOB,
  BTC,
  CAROL,
  ETH,
  TWO_USDC,
  VAULT,
  WAD,
  ZERO,
  authorFeeEvent,
  closedEvent,
  liquidatedEvent,
  nftTransferEvent,
  openedEvent,
  positionId,
} from "./helpers";

describe("opening", () => {
  afterEach(() => {
    clearStore();
  });

  test("records the position, the asset, the trader and the protocol", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));

    assert.entityCount("Position", 1);
    assert.fieldEquals("Position", positionId(1), "status", "OPEN");
    assert.fieldEquals("Position", positionId(1), "isLong", "true");
    assert.fieldEquals("Position", positionId(1), "collateral", "2000000");
    assert.fieldEquals("Position", positionId(1), "author", ALICE.toHexString());
    assert.fieldEquals("Position", positionId(1), "owner", ALICE.toHexString());
    assert.fieldEquals("Asset", BTC.toHexString(), "openPositionCount", "1");
    assert.fieldEquals("Asset", BTC.toHexString(), "longCount", "1");
    assert.fieldEquals("Trader", ALICE.toHexString(), "positionsOpened", "1");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "openPositionCount", "1");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "cumulativeCollateral", "2000000");
  });

  test("keeps long and short counts apart per asset", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionOpened(openedEvent(2, BOB, BTC, false, TWO_USDC, 0));
    handlePositionOpened(openedEvent(3, BOB, ETH, true, TWO_USDC, 0));

    assert.fieldEquals("Asset", BTC.toHexString(), "longCount", "1");
    assert.fieldEquals("Asset", BTC.toHexString(), "shortCount", "1");
    assert.fieldEquals("Asset", ETH.toHexString(), "longCount", "1");
    assert.entityCount("Asset", 2);
  });

  /// Token ids start at one, so zero is free to mean "not a copy".
  test("an original is not counted as a copy", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));

    assert.fieldEquals("Trader", ALICE.toHexString(), "copiesMade", "0");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "copyCount", "0");
  });
});

describe("the copy graph", () => {
  afterEach(() => {
    clearStore();
  });

  test("a copy links to the original and credits its author", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionOpened(openedEvent(2, BOB, BTC, true, TWO_USDC, 1));

    assert.fieldEquals("Position", positionId(2), "copiedFrom", positionId(1));
    assert.fieldEquals("Position", positionId(1), "copyCount", "1");
    assert.fieldEquals("Trader", BOB.toHexString(), "copiesMade", "1");
    assert.fieldEquals("Trader", ALICE.toHexString(), "copiesReceived", "1");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "copyCount", "1");
  });

  /// Credit follows the author, not the holder. Selling the NFT moves the payout; it does not move
  /// who made the call.
  test("copying a position that has been sold still credits its author", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handleTransfer(nftTransferEvent(ALICE, CAROL, 1));
    handlePositionOpened(openedEvent(2, BOB, BTC, true, TWO_USDC, 1));

    assert.fieldEquals("Position", positionId(1), "owner", CAROL.toHexString());
    assert.fieldEquals("Position", positionId(1), "author", ALICE.toHexString());
    assert.fieldEquals("Trader", ALICE.toHexString(), "copiesReceived", "1");
    assert.fieldEquals("Trader", CAROL.toHexString(), "copiesReceived", "0");
  });

  /// A copy of a position opened before the start block has nothing to link to. The copy must still
  /// index rather than abort the handler and stall the subgraph.
  test("a copy of an unknown original still indexes", () => {
    handlePositionOpened(openedEvent(2, BOB, BTC, true, TWO_USDC, 99));

    assert.entityCount("Position", 1);
    assert.fieldEquals("Position", positionId(2), "copiedFrom", positionId(99));
    assert.fieldEquals("Trader", BOB.toHexString(), "copiesMade", "1");
  });
});

describe("closing", () => {
  afterEach(() => {
    clearStore();
  });

  test("records the result and counts a win", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionClosed(closedEvent(1, ALICE, BTC, WAD, BigInt.fromI32(2_900_000)));

    assert.fieldEquals("Position", positionId(1), "status", "CLOSED");
    assert.fieldEquals("Position", positionId(1), "realizedPnlWad", WAD.toString());
    assert.fieldEquals("Position", positionId(1), "payout", "2900000");
    assert.fieldEquals("Trader", ALICE.toHexString(), "wins", "1");
    assert.fieldEquals("Trader", ALICE.toHexString(), "losses", "0");
    assert.fieldEquals("Trader", ALICE.toHexString(), "realizedPnlWad", WAD.toString());
    assert.fieldEquals("Asset", BTC.toHexString(), "openPositionCount", "0");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "openPositionCount", "0");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "closedCount", "1");
  });

  test("a loss subtracts from realised P&L", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionClosed(
      closedEvent(1, ALICE, BTC, BigInt.zero().minus(WAD), BigInt.fromI32(1_000_000)),
    );

    assert.fieldEquals("Trader", ALICE.toHexString(), "losses", "1");
    assert.fieldEquals(
      "Trader",
      ALICE.toHexString(),
      "realizedPnlWad",
      BigInt.zero().minus(WAD).toString(),
    );
    assert.fieldEquals(
      "Protocol",
      VAULT.toHexString(),
      "realizedPnlWad",
      BigInt.zero().minus(WAD).toString(),
    );
  });

  /// Rounding lands exactly on zero often enough that treating a flat close as a win would inflate
  /// every win rate on the leaderboard.
  test("a flat close counts as a loss, not a win", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionClosed(closedEvent(1, ALICE, BTC, BigInt.zero(), TWO_USDC));

    assert.fieldEquals("Trader", ALICE.toHexString(), "wins", "0");
    assert.fieldEquals("Trader", ALICE.toHexString(), "losses", "1");
  });

  /// The leaderboard ranks calls, so the result belongs to whoever made the call. Whoever bought
  /// the NFT gets the money; they did not get the idea.
  test("P&L credits the author even when someone else holds the NFT", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handleTransfer(nftTransferEvent(ALICE, CAROL, 1));
    handlePositionClosed(closedEvent(1, CAROL, BTC, WAD, BigInt.fromI32(2_900_000)));

    assert.fieldEquals("Trader", ALICE.toHexString(), "realizedPnlWad", WAD.toString());
    assert.fieldEquals("Trader", ALICE.toHexString(), "wins", "1");
    assert.fieldEquals("Trader", CAROL.toHexString(), "realizedPnlWad", "0");
    assert.fieldEquals("Trader", CAROL.toHexString(), "wins", "0");
    assert.fieldEquals("Position", positionId(1), "closedBy", CAROL.toHexString());
  });

  /// Closing a position the subgraph never saw opened would credit P&L to nobody and skew every
  /// total it touched.
  test("a close with no matching open changes nothing", () => {
    handlePositionClosed(closedEvent(7, ALICE, BTC, WAD, TWO_USDC));

    assert.entityCount("Position", 0);
    assert.entityCount("Trader", 0);
  });

  test("a liquidation is recorded separately and keeps the reward", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionLiquidated(
      liquidatedEvent(
        1,
        BOB,
        BTC,
        BigInt.zero().minus(WAD),
        BigInt.fromI32(50_000),
        BigInt.fromI32(20_000),
      ),
    );

    assert.fieldEquals("Position", positionId(1), "status", "LIQUIDATED");
    assert.fieldEquals("Position", positionId(1), "liquidationReward", "20000");
    assert.fieldEquals("Position", positionId(1), "closedBy", BOB.toHexString());
    assert.fieldEquals("Trader", ALICE.toHexString(), "positionsLiquidated", "1");
    assert.fieldEquals("Trader", ALICE.toHexString(), "losses", "1");
    assert.fieldEquals("Trader", BOB.toHexString(), "positionsLiquidated", "0");
    assert.fieldEquals("Trader", BOB.toHexString(), "liquidationsPerformed", "1");
    assert.fieldEquals("Trader", BOB.toHexString(), "liquidationRewardsEarned", "20000");
    assert.fieldEquals("Trader", BOB.toHexString(), "realizedPnlWad", "0");
    assert.fieldEquals("Trader", BOB.toHexString(), "losses", "0");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "liquidatedCount", "1");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "closedCount", "0");
  });
});

describe("author fees", () => {
  afterEach(() => {
    clearStore();
  });

  test("credits the author of the copied position", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionOpened(openedEvent(2, BOB, BTC, true, TWO_USDC, 1));
    handlePositionClosed(closedEvent(2, BOB, BTC, WAD, BigInt.fromI32(2_800_000)));
    handleAuthorFeePaid(authorFeeEvent(2, ALICE, BigInt.fromI32(100_000)));

    assert.entityCount("AuthorFee", 1);
    assert.fieldEquals("Trader", ALICE.toHexString(), "authorFeesEarned", "100000");
    assert.fieldEquals("Trader", BOB.toHexString(), "authorFeesEarned", "0");
    assert.fieldEquals("Position", positionId(2), "authorFeePaid", "100000");
    assert.fieldEquals("Protocol", VAULT.toHexString(), "cumulativeAuthorFees", "100000");
  });

  test("fees accumulate across copies", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handlePositionOpened(openedEvent(2, BOB, BTC, true, TWO_USDC, 1));
    handlePositionOpened(openedEvent(3, CAROL, BTC, true, TWO_USDC, 1));
    handleAuthorFeePaid(authorFeeEvent(2, ALICE, BigInt.fromI32(100_000)));
    handleAuthorFeePaid(authorFeeEvent(3, ALICE, BigInt.fromI32(250_000)));

    assert.entityCount("AuthorFee", 2);
    assert.fieldEquals("Trader", ALICE.toHexString(), "authorFeesEarned", "350000");
    assert.fieldEquals("Trader", ALICE.toHexString(), "copiesReceived", "2");
  });
});

describe("ownership", () => {
  afterEach(() => {
    clearStore();
  });

  test("a sale moves the owner and leaves the author alone", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handleTransfer(nftTransferEvent(ALICE, BOB, 1));

    assert.fieldEquals("Position", positionId(1), "owner", BOB.toHexString());
    assert.fieldEquals("Position", positionId(1), "author", ALICE.toHexString());
  });

  /// A close burns the NFT, and the burn is emitted before PositionClosed. Writing the zero address
  /// as the owner would erase who held the position at the end.
  test("the closing burn does not erase the owner", () => {
    handlePositionOpened(openedEvent(1, ALICE, BTC, true, TWO_USDC, 0));
    handleTransfer(nftTransferEvent(ALICE, BOB, 1));
    handleTransfer(nftTransferEvent(BOB, ZERO, 1));
    handlePositionClosed(closedEvent(1, BOB, BTC, WAD, BigInt.fromI32(2_900_000)));

    assert.fieldEquals("Position", positionId(1), "owner", BOB.toHexString());
    assert.fieldEquals("Position", positionId(1), "status", "CLOSED");
  });

  /// The mint carries none of the data a position needs, and PositionOpened is emitted with all of
  /// it. Creating a bare position here would leave required fields unset.
  test("the opening mint creates nothing on its own", () => {
    handleTransfer(nftTransferEvent(ZERO, ALICE, 1));

    assert.entityCount("Position", 0);
    assert.entityCount("Trader", 0);
  });
});
