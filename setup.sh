#!/usr/bin/env bash
# One-time dependency setup for claude-visual-feedback. Called by the consuming
# project's devcontainer postCreate after cloning this repo. Lives in the tool repo
# so dependency changes propagate globally (not frozen in the template).
set -e
cd "$(dirname "$0")"
npm install
npx playwright install webkit
sudo npx playwright install-deps webkit
echo "✓ claude-visual-feedback ready"
