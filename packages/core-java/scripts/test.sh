#!/bin/sh
# Compiles the Java core and its contract checks with plain javac (no Maven
# needed) and runs them against contracts/test-vectors. Same steps as CI.
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$ROOT/build/java-contract"
rm -rf "$OUT"
mkdir -p "$OUT"
find "$ROOT/packages/core-java/src/main/java" "$ROOT/packages/core-java/src/test/java" -name '*.java' -print0 \
  | xargs -0 javac --release 17 -Xlint:all -Werror -d "$OUT"
for test in ContractTest CoordinateContractTest ReferenceVectorTest ErrorContractTest; do
  java -ea -cp "$OUT" "io.github.mertc0604.converttools.$test" "$ROOT/contracts/test-vectors"
done
