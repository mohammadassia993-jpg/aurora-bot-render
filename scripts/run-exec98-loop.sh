#!/bin/bash
# Loop runner: restarts execute-98-tasks.js until all ready tasks are drafted
cd /root/silent-giants
for i in $(seq 1 20); do
  left=$(node --input-type=module -e "
    import { db } from './src/db.js';
    const n = db.prepare(\"SELECT COUNT(*) c FROM tasks WHERE status IN ('ready_for_approval','discovered','delegated') AND title NOT LIKE 'Configure %'\").get().c;
    console.log(n);
  " 2>/dev/null | tail -1)
  echo "[$i] remaining=$left"
  if [ -z "$left" ] || [ "$left" = "0" ]; then echo "ALL DONE"; break; fi
  node scripts/execute-98-tasks.js >> logs/exec-98-loop.log 2>&1
  echo "[$i] run finished, checking..."
  sleep 3
done
echo "LOOP_END"
