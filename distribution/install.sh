#!/bin/sh
set -eu

version="${1:-1.0.0}"
case "$version" in
  *[!0-9.]*|.*|*.) echo "Version must contain only dot-separated numbers." >&2; exit 2 ;;
esac

repository="https://github.com/siddharthg2309/privacyguard-extension"
archive="privacy-guard-cli-${version}.tgz"
base_url="${repository}/releases/download/v${version}"
install_directory="${TMPDIR:-/tmp}/privacy-guard-install-${version}-$$"
mkdir -m 700 "$install_directory"
trap 'rm -rf "$install_directory"' EXIT HUP INT TERM

curl --fail --location --proto '=https' --tlsv1.2 --output "$install_directory/$archive" "$base_url/$archive"
curl --fail --location --proto '=https' --tlsv1.2 --output "$install_directory/SHA256SUMS" "$base_url/SHA256SUMS"

expected="$(sed -n "s/  ${archive}$//p" "$install_directory/SHA256SUMS")"
if [ -z "$expected" ]; then echo "Release checksum is missing." >&2; exit 3; fi
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$install_directory/$archive" | sed 's/ .*//')"
else
  actual="$(shasum -a 256 "$install_directory/$archive" | sed 's/ .*//')"
fi
if [ "$actual" != "$expected" ]; then echo "Release checksum verification failed." >&2; exit 3; fi

npm install --global "$install_directory/$archive"
aiprivacy doctor
