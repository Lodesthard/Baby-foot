const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Créer un duo pour la saison
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { partner_id, duo_name } = req.body;
        const player_id = req.user.id;

        if (player_id === partner_id) {
            return res.status(400).json({ error: 'Impossible de faire un duo avec soi-même' });
        }

        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) {
            return res.status(400).json({ error: 'Aucune saison active' });
        }
        const seasonId = season[0].id;

        // Vérifier que ni l'un ni l'autre n'a déjà un duo
        const [existing] = await pool.query(
            'SELECT * FROM duos WHERE season_id = ? AND (player1_id = ? OR player2_id = ? OR player1_id = ? OR player2_id = ?)',
            [seasonId, player_id, player_id, partner_id, partner_id]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Un des joueurs a déjà un duo pour cette saison' });
        }

        await pool.query(
            'INSERT INTO duos (season_id, player1_id, player2_id, duo_name) VALUES (?, ?, ?, ?)',
            [seasonId, player_id, partner_id, duo_name || null]
        );

        res.status(201).json({ message: 'Duo créé pour la saison' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Mon duo actuel
router.get('/mine', authenticateToken, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json(null);

        const [duo] = await pool.query(
            `SELECT d.*, p1.display_name as player1_name, p2.display_name as player2_name
             FROM duos d
             JOIN players p1 ON d.player1_id = p1.id
             JOIN players p2 ON d.player2_id = p2.id
             WHERE (d.player1_id = ? OR d.player2_id = ?) AND d.season_id = ?`,
            [req.user.id, req.user.id, season[0].id]
        );

        res.json(duo[0] || null);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste de tous les duos de la saison active
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json([]);

        const [duos] = await pool.query(
            `SELECT d.*, p1.display_name as player1_name, p2.display_name as player2_name
             FROM duos d
             JOIN players p1 ON d.player1_id = p1.id
             JOIN players p2 ON d.player2_id = p2.id
             WHERE d.season_id = ?
             ORDER BY d.duo_name, p1.display_name`,
            [season[0].id]
        );

        res.json(duos);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
