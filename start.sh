#!/bin/bash
set -a
source /home/azureuser/debate-flower/.env
set +a
exec node /home/azureuser/debate-flower/build/index.js
