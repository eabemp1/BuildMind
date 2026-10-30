#!/usr/bin/env bash
# Lists unused files, exports and dependencies. It never deletes anything.
# Run from the repo root:  bash scripts/unused-report.sh
# Read the list yourself: public/sw.js, scripts/ and files loaded by name can show up wrongly.
npx --yes knip@5 --no-progress > unused-report.txt 2>&1
echo "Wrote unused-report.txt"
