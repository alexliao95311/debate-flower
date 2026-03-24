#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a

HOST=0.0.0.0 PORT=3000 node build/index.js
