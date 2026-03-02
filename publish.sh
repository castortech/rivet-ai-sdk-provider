#!/usr/bin/env bash
set -e

# Set your NPM token
export NODE_AUTH_TOKEN=npm_xxx

# If you use a private registry, also set npmrc accordingly
# echo "//registry.npmjs.org/:_authToken=$NODE_AUTH_TOKEN" > .npmrc

# Checkout is not needed; you are already on your source.

# Node setup
corepack enable
corepack prepare pnpm@latest --activate

# Install dependencies
pnpm install --frozen-lockfile

# Type checking
pnpm typecheck

# Build
pnpm build

# Decide tag (simulate release/prerelease)
IS_PRERELEASE=false # change to true to simulate prerelease

if [ "$IS_PRERELEASE" = "true" ]; then
  pnpm publish --access public --no-git-checks --tag beta
else
  pnpm publish --access public --no-git-checks
fi
