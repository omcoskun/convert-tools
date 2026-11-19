#!/bin/sh
# Checks that a release tag (vX.Y.Z) names the version that the root
# package.json, the JavaScript package and the Java pom.xml all carry, so a
# release never publishes a version other than the one tagged.
#
# Usage: sh scripts/check-release-tag.sh v1.0.0   (from the repository root)
set -eu

tag=${1:-}
case "$tag" in
  v?*) version=${tag#v} ;;
  *)
    echo "check-release-tag: the tag must look like v1.2.3, got '$tag'" >&2
    exit 1
    ;;
esac

ROOT=$(cd "$(dirname "$0")/.." && pwd)
root_version=$(node -p "require('$ROOT/package.json').version")
js_version=$(node -p "require('$ROOT/packages/core-js/package.json').version")
# The project version is the only <version> indented by two spaces.
java_version=$(sed -n 's:^  <version>\(.*\)</version>$:\1:p' "$ROOT/packages/core-java/pom.xml")

status=0
check() {
  if [ "$2" != "$version" ]; then
    echo "check-release-tag: $1 is $2, the tag says $version" >&2
    status=1
  fi
}
check "package.json" "$root_version"
check "packages/core-js/package.json" "$js_version"
check "packages/core-java/pom.xml" "$java_version"
exit $status
