#!/usr/bin/env bash
set -euo pipefail

: "${HF_TOKEN:?HF_TOKEN is required}"
: "${HF_USERNAME:?HF_USERNAME is required}"
SPACE_NAME="${HF_SPACE_NAME:-aurora-silent-giants-backup}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -a . "$work"/
rm -rf "$work"/{data,logs,backups,dist,.env}
cp deploy/huggingface/Dockerfile "$work"/Dockerfile
cp deploy/huggingface/README.md "$work"/README.md

cd "$work"
git init -q
git config user.name "Aurora"
git config user.email "auroraalmada4@gmail.com"
git add .
git commit -qm "Deploy Aurora Silent Giants backup"
git remote add origin "https://${HF_USERNAME}:${HF_TOKEN}@huggingface.co/spaces/${HF_USERNAME}/${SPACE_NAME}"
git push -q origin main:main
printf 'Deployed https://huggingface.co/spaces/%s/%s\n' "$HF_USERNAME" "$SPACE_NAME"
