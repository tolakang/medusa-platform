#!/usr/bin/env bash
# Medusa update: BUILD_PLAN.md §8.2. Plain bash (macOS bash 3.2 compatible).
#
#   scripts/update-medusa.sh <category | category/app | all> [version] [--pnpm-latest]
#
# Root workspace (BUILD_PLAN.md §4.3): the Medusa catalog in the root
# pnpm-workspace.yaml is set once, for every app in it, and the workspace is
# installed once at the root. Apps there write "catalog:" and are left as is.
# Per app not moved yet (own pnpm-workspace.yaml):
#   1. target version = [version] or `npm view @medusajs/medusa version`
#   2. every @medusajs/* dependency on the release line -> exact target version;
#      @medusajs/ui (own version line, MEDUSA_SKILL §1) -> the version
#      @medusajs/dashboard@<target> depends on (decision on F-006), falling
#      back to the medusajs/dtc-starter backend pin (plan §6.2)
#   3. pnpm install -> new pnpm-lock.yaml
# Then runs scripts/verify.sh for the target and prints the files to commit.
# It never commits and never touches BUILD_PLAN.md.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: scripts/update-medusa.sh <category|category/app|all> [version] [--pnpm-latest]"; exit 2; }
VERSION=""; PNPM_LATEST=0
for arg in "${@:2}"; do
  case "$arg" in
    --pnpm-latest) PNPM_LATEST=1 ;;
    *) VERSION="$arg" ;;
  esac
done
[ -n "$VERSION" ] || VERSION=$(npm view @medusajs/medusa version)
echo "Target Medusa version: $VERSION"
npm view "@medusajs/medusa@$VERSION" version >/dev/null || { echo "version $VERSION not on npm"; exit 1; }

# @medusajs/ui for this release: the version @medusajs/dashboard@$VERSION
# depends on, so the lockfile holds one copy (F-006, decided 2026-09-25).
# Fallback: the dtc-starter backend pin (plan §6.2).
DASH_UI=$(npm view "@medusajs/dashboard@$VERSION" dependencies --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)["@medusajs/ui"]||"")}catch{console.log("")}})')
STARTER_PKG=$(curl -fsSL https://raw.githubusercontent.com/medusajs/dtc-starter/HEAD/apps/backend/package.json || true)
STARTER_MEDUSA=$(printf '%s' "$STARTER_PKG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).dependencies["@medusajs/medusa"]||"")}catch{console.log("")}})')
STARTER_UI=""
if [ "$STARTER_MEDUSA" = "$VERSION" ]; then
  STARTER_UI=$(printf '%s' "$STARTER_PKG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).dependencies["@medusajs/ui"]||"")}catch{console.log("")}})')
fi
UI_VERSION="$DASH_UI"
if [ -n "$UI_VERSION" ]; then
  echo "@medusajs/ui (@medusajs/dashboard@$VERSION dependency): $UI_VERSION"
  [ -n "$STARTER_UI" ] && [ "$STARTER_UI" != "$UI_VERSION" ] \
    && echo "NOTE: dtc-starter pins @medusajs/ui $STARTER_UI; we follow the dashboard (F-006)."
else
  UI_VERSION="$STARTER_UI"
  if [ -n "$UI_VERSION" ]; then
    echo "WARN: no @medusajs/ui dependency read from @medusajs/dashboard@$VERSION."
    echo "      Falling back to the dtc-starter pin: $UI_VERSION"
  else
    echo "WARN: could not read @medusajs/ui from @medusajs/dashboard@$VERSION,"
    echo "      and dtc-starter HEAD is on @medusajs/medusa '$STARTER_MEDUSA', not $VERSION."
    echo "      @medusajs/ui is left unchanged. Pick it by hand for $VERSION."
  fi
fi

PNPM_VERSION=""
[ "$PNPM_LATEST" = 1 ] && PNPM_VERSION=$(npm view pnpm version) && echo "pnpm -> $PNPM_VERSION"

CHANGED=""
WORKSPACE=0
if grep -q '^catalog:' pnpm-workspace.yaml 2>/dev/null; then
  WORKSPACE=1
  echo; echo "---- root catalog (pnpm-workspace.yaml): every app in the workspace moves"
  VERSION="$VERSION" UI_VERSION="$UI_VERSION" node -e '
    const fs = require("fs"); const p = "pnpm-workspace.yaml";
    const { VERSION, UI_VERSION } = process.env;
    let inCat = false;
    const out = fs.readFileSync(p, "utf8").split("\n").map((line) => {
      if (/^catalog:/.test(line)) { inCat = true; return line; }
      if (inCat && /^\S/.test(line)) inCat = false;
      const m = inCat && line.match(/^  "(@medusajs\/[^"]+)": (\S+)$/);
      if (!m) return line;
      const next = m[1] === "@medusajs/ui" ? (UI_VERSION || m[2]) : VERSION;
      if (next !== m[2]) console.log(`  ${m[1]}: ${m[2]} -> ${next}`);
      return `  "${m[1]}": ${next}`;
    });
    fs.writeFileSync(p, out.join("\n"));
  '
  if [ -n "$PNPM_VERSION" ]; then
    node -e 'const fs=require("fs");const p="package.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));j.packageManager=`pnpm@${process.argv[1]}`;fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$PNPM_VERSION"
  fi
  CHANGED="$CHANGED pnpm-workspace.yaml package.json pnpm-lock.yaml"
fi

# packages/* (the shared core) follow every bump: their Medusa peer
# dependencies are exact versions (docs learn/fundamentals/plugins/create).
for dir in packages/* */backend */storefront */*-portal */pos-app; do
  [ -f "$dir/package.json" ] || continue
  case "$dir:$TARGET" in packages/*) ;; *)
  case "$TARGET" in
    all) ;;
    */*) [ "$dir" = "$TARGET" ] || continue ;;
    *) case "$dir" in "$TARGET"/*) ;; *) continue ;; esac ;;
  esac ;; esac
  echo; echo "---- $dir"
  VERSION="$VERSION" UI_VERSION="$UI_VERSION" PNPM_VERSION="$PNPM_VERSION" node -e '
    const fs = require("fs"); const p = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    const { VERSION, UI_VERSION, PNPM_VERSION } = process.env;
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkg[field] || {};
      for (const name of Object.keys(deps)) {
        if (!name.startsWith("@medusajs/") || deps[name] === "catalog:") continue;
        const next = name === "@medusajs/ui" ? (UI_VERSION || deps[name]) : VERSION;
        if (deps[name] !== next) { console.log(`  ${name}: ${deps[name]} -> ${next}`); deps[name] = next; }
      }
    }
    if (PNPM_VERSION) pkg.packageManager = `pnpm@${PNPM_VERSION}`;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  ' "$dir/package.json"
  # Apps in the root workspace are installed once, below.
  [ -f "$dir/pnpm-workspace.yaml" ] && (cd "$dir" && pnpm install --no-frozen-lockfile)
  CHANGED="$CHANGED $dir/package.json $dir/pnpm-lock.yaml"
done

if [ "$WORKSPACE" = 1 ]; then
  echo; echo "---- root workspace install"
  pnpm install --no-frozen-lockfile
fi

[ -n "$CHANGED" ] || { echo "no apps matched '$TARGET'"; exit 1; }

echo; echo "==== verify"
scripts/verify.sh "$TARGET"

echo
echo "update: PASS. Review the diff, read the release notes for every skipped version"
echo "(run any codemod they list), then commit on a branch:"
echo "  git add$CHANGED"
echo "  git commit -m \"chore(deps): update Medusa to $VERSION ($TARGET)\""
