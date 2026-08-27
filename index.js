// Root entry point for cloud platforms (Bonto, Codespaces, etc.)
// Serves a lightweight health endpoint; the full platform runs via src/index.js
import express from 'express';

const app = express();

app.get('/', (req, res) => res.send('OK: Silent Giants is running'));
app.get('/health', (req, res) => res.json({ status: 'ok', source: 'bonto' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Bonto entry server running on port ${PORT}`));
