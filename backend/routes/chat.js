const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Recuperer les messages (les 50 derniers)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const before = req.query.before; // id for pagination
        let query = `SELECT cm.id, cm.message, cm.created_at,
                        cm.player_id, p.display_name, p.profile_photo
                     FROM chat_messages cm
                     JOIN players p ON cm.player_id = p.id`;
        const params = [];

        if (before) {
            query += ' WHERE cm.id < ?';
            params.push(before);
        }

        query += ' ORDER BY cm.id DESC LIMIT 50';
        const [rows] = await pool.query(query, params);

        res.json(rows.reverse());
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Envoyer un message
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message vide' });
        }
        if (message.length > 500) {
            return res.status(400).json({ error: 'Message trop long (500 max)' });
        }

        const [result] = await pool.query(
            'INSERT INTO chat_messages (player_id, message) VALUES (?, ?)',
            [req.user.id, message.trim()]
        );

        const [rows] = await pool.query(
            `SELECT cm.id, cm.message, cm.created_at,
                    cm.player_id, p.display_name, p.profile_photo
             FROM chat_messages cm
             JOIN players p ON cm.player_id = p.id
             WHERE cm.id = ?`,
            [result.insertId]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
