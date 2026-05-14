require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');
const ensureSchema = require('./config/ensure-schema');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir les assets partages et le frontend
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/rankings', require('./routes/rankings'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/duos', require('./routes/duos'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/lobbies', require('./routes/lobbies'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/recaps', require('./routes/recaps'));
app.use('/api/skins', require('./routes/skins'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

async function startServer() {
    try {
        await ensureSchema(pool);
        app.listen(PORT, () => {
            console.log(`Serveur demarre sur le port ${PORT}`);
        });
    } catch (err) {
        console.error('Impossible de demarrer le serveur :', err.message || err);
        process.exit(1);
    }
}

startServer();
