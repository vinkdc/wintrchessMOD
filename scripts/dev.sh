#!/bin/sh
# Development server. Client changes are rebuilt by webpack in watch mode;
# shared or server changes rebuild those workspaces and restart the server.
set -e

npm run build -w shared

(cd client && npx webpack --watch) &

exec node --watch-path=shared/src --watch-path=server/src \
    scripts/devServer.mjs
