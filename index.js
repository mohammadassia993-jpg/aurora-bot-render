const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('✅ Bot is running successfully on Bonto!');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', source: 'bonto' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
