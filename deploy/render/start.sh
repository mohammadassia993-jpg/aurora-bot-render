if [ -f deploy/render/bootstrap-platform.db.gz ]; then
  mkdir -p data
  gzip -dc deploy/render/bootstrap-platform.db.gz > data/incoming-platform.db
  echo '{"bundled":true,"bytes":'$(wc -c < data/incoming-platform.db)'}'
fi
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node scripts/bootstrap-render.js
node scripts/restore-database.js
exec npm start
