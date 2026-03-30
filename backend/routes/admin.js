const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Dashboard admin
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [players] = await pool.query('SELECT COUNT(*) as count FROM players');
        const [season] = await pool.query('SELECT * FROM seasons WHERE is_active = 1');
        const seasonId = season[0]?.id;
        let matchCount = 0;
        let duoCount = 0;
        if (seasonId) {
            const [m] = await pool.query('SELECT COUNT(*) as count FROM matches WHERE season_id = ?', [seasonId]);
            matchCount = m[0].count;
            const [d] = await pool.query('SELECT COUNT(*) as count FROM duos WHERE season_id = ?', [seasonId]);
            duoCount = d[0].count;
        }

        res.json({
            total_players: players[0].count,
            active_season: season[0] || null,
            matches_this_season: matchCount,
            duos_this_season: duoCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Promouvoir/rétrograder admin
router.put('/players/:id/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { is_admin } = req.body;
        await pool.query('UPDATE players SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, req.params.id]);
        res.json({ message: 'Mis à jour' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Reset mot de passe d'un joueur (admin)
router.put('/players/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 4) {
            return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
        }
        const hash = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE players SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
        res.json({ message: 'Mot de passe réinitialisé' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer un duo (admin)
router.delete('/duos/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM duos WHERE id = ?', [req.params.id]);
        res.json({ message: 'Duo supprimé' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste tous les joueurs avec détails (admin)
router.get('/players', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, identifier, display_name, is_admin, created_at FROM players ORDER BY display_name'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
