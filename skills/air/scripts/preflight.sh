#!/bin/sh
# Requires Node >= 20. This check never mints tokens from the application's route.
exec node "$(dirname "$0")/preflight.mjs" "$@"
