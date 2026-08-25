import { createBackupSnapshot } from '../src/backup.js';
const result = await createBackupSnapshot();
console.log(JSON.stringify(result));
