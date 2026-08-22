#!/usr/bin/env sh
# Re-stamp the ?v= cache-buster on every module URL in the HTML import map.
# Run after changing anything under js/ so browsers fetch fresh modules.
cd "$(dirname "$0")" || exit 1
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s/\?v=[A-Za-z0-9]+/?v=${V}/g" pikachu-stitch-companion.html
echo "stamped v=${V}"
