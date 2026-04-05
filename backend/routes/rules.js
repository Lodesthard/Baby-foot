const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get current rules
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.*, p.display_name as updated_by_name
             FROM rules r
             JOIN players p ON r.updated_by = p.id
             ORDER BY r.updated_at DESC LIMIT 1`
        );
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Update rules (admin only)
router.put('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Le contenu ne peut pas être vide' });
        }

        // Check if rules exist
        const [existing] = await pool.query('SELECT id FROM rules LIMIT 1');
        if (existing.length > 0) {
            await pool.query(
                'UPDATE rules SET content = ?, updated_by = ? WHERE id = ?',
                [content.trim(), req.user.id, existing[0].id]
            );
        } else {
            await pool.query(
                'INSERT INTO rules (content, updated_by) VALUES (?, ?)',
                [content.trim(), req.user.id]
            );
        }

        res.json({ message: 'Règlement mis à jour' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
