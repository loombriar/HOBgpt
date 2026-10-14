#!/bin/sh
set -eu

# Railway attaches the persistent volume after the image has been built.
# Its existing SQLite files may be owned by root from older deployments.
DATA_PATH="${DATA_DIR:-/app/.data}"
case "$DATA_PATH" in
  /*) ;;
  *) DATA_PATH="/app/$DATA_PATH" ;;
esac
mkdir -p "$DATA_PATH"
chown -R node:node "$DATA_PATH"

# Only the narrow startup ownership repair runs as root.
gosu node node -e 'const uid=process.getuid();if(uid!==1000){console.error(`Runtime UID verification failed: ${uid}`);process.exit(1)}console.log(`Runtime UID verified: ${uid} (node)`)'
exec gosu node "$@"
