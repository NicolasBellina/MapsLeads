#!/usr/bin/env bash
# Construit l'archive a televerser sur le Chrome Web Store, puis la verifie.
#
# On passe par un dossier de preparation plutot que de zipper l'arborescence en
# place : c'est le seul moyen sur d'exclure les fichiers macOS (.DS_Store,
# ._AppleDouble) et de garantir que manifest.json se retrouve a la racine du zip.
# Le Chrome Web Store refuse l'archive des qu'un dossier parent s'intercale.
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
stage="build/stage"
out="build/mapsleads-$version.zip"

rm -rf "$stage"
mkdir -p "$stage"

cp manifest.json "$stage/"
cp -R src "$stage/src"
cp -R icons "$stage/icons"

# Fichiers que macOS seme partout et que le Chrome Web Store considere comme du
# contenu inattendu.
find "$stage" \( -name '.DS_Store' -o -name '._*' -o -name '.*.icloud' \) -delete

rm -f "$out"
# -X : pas d'attributs macOS. -r : recursif. Le `cd` fait que les chemins
# stockes dans le zip sont relatifs a la racine du package.
(cd "$stage" && zip -r -q -X "../../$out" .)

rm -rf "$stage"

# --- Verification -----------------------------------------------------------
# On relit l'archive produite plutot que de faire confiance au script.
check="build/verify"
rm -rf "$check"
mkdir -p "$check"
unzip -q "$out" -d "$check"

fail() { echo "ECHEC : $1" >&2; rm -rf "$check"; exit 1; }

[ -f "$check/manifest.json" ] || fail "manifest.json absent de la racine du zip"
node -e "JSON.parse(require('fs').readFileSync('$check/manifest.json','utf8'))" \
  || fail "manifest.json n'est pas un JSON valide"

# Chaque fichier declare dans le manifeste doit exister dans l'archive.
node - "$check" <<'NODE' || fail "un fichier declare dans le manifeste est absent"
const fs = require("fs"), path = require("path");
const root = process.argv[2];
const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const refs = [m.action?.default_popup, ...Object.values(m.icons || {})].filter(Boolean);
let ok = true;
for (const r of refs) {
  if (!fs.existsSync(path.join(root, r))) {
    console.error(`  manquant : ${r}`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
NODE

if unzip -l "$out" | grep -qE '__MACOSX|\.DS_Store'; then
  fail "l'archive contient des fichiers macOS"
fi

rm -rf "$check"

echo "OK  $out  (version $version)"
unzip -l "$out"
