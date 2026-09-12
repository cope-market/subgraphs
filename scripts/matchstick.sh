#!/usr/bin/env bash
# Runs matchstick against the workspace this is invoked from.
#
# `graph test` refuses to run on any Linux it cannot match to an Ubuntu release. It reads
# /etc/*-release for a VERSION= line, and distributions that do not publish one — Arch among them —
# fall through to the kernel version, which matches nothing:
#
#     Error: Failed to get matchstick binary: Unsupported platform: Linux x64 7
#
# The binary itself is fine; only graph-cli's host detection is not. So we fetch the release asset
# directly and run it. Docker (`graph test -d`) is the other documented escape hatch, but it costs
# an image build on every clean checkout and needs a working daemon in CI.
set -euo pipefail

VERSION="${MATCHSTICK_VERSION:-0.6.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/.bin/matchstick-$VERSION"

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) ASSET="binary-linux-22" ;;
  Darwin/arm64) ASSET="binary-macos-12-m1" ;;
  Darwin/x86_64) ASSET="binary-macos-12" ;;
  *)
    echo "No matchstick release for $(uname -s)/$(uname -m). Use 'npx graph test -d' instead." >&2
    exit 1
    ;;
esac

if [ ! -x "$BIN" ]; then
  echo "Fetching matchstick $VERSION ($ASSET)..." >&2
  mkdir -p "$ROOT/.bin"
  curl --fail --silent --show-error --location \
    --output "$BIN" \
    "https://github.com/LimeChain/matchstick/releases/download/$VERSION/$ASSET"
  chmod +x "$BIN"
fi

exec "$BIN" "$@"
