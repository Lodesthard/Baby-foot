const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_THEMES = ['classic', 'mai'];

function asyncRoute(handler) {
    return (req, res) => {
        Promise.resolve(handler(req, res)).catch((err) => {
            console.error(err);
            res.status(500).json({ error: 'Erreur serveur' });
        });
    };
}

// Lecture publique (pas d auth) du theme global, pour permettre l application
// du theme avant meme la connexion (login screen).
router.get('/theme', asyncRoute(async (req, res) => {
    const [rows] = await pool.query("SELECT value FROM app_settings WHERE `key` = 'theme'");
    const theme = rows[0]?.value || 'classic';
    res.json({ theme });
}));

router.put('/theme', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    const theme = String(req.body?.theme || '').trim();
    if (!ALLOWED_THEMES.includes(theme)) {
        return res.status(400).json({ error: 'Theme inconnu' });
    }
    await pool.query(
        "INSERT INTO app_settings (`key`, value) VALUES ('theme', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
        [theme]
    );
    res.json({ message: 'Theme global mis a jour', theme });
}));

module.exports = router;
