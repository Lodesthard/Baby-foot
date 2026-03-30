const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Saison active
router.get('/active', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM seasons WHERE is_active = 1');
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Toutes les saisons
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM seasons ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Créer une saison (admin)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, base_k_factor, rank_multiplier, score_multiplier, duo_rank_multiplier } = req.body;
        if (!name) return res.status(400).json({ error: 'Nom requis' });

        const [result] = await pool.query(
            'INSERT INTO seasons (name, start_date, base_k_factor, rank_multiplier, score_multiplier, duo_rank_multiplier) VALUES (?, CURDATE(), ?, ?, ?, ?)',
            [name, base_k_factor || 32, rank_multiplier || 1.5, score_multiplier || 0.1, duo_rank_multiplier || 1.3]
        );

        res.status(201).json({ message: 'Saison créée', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Activer une saison (admin)
router.put('/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE seasons SET is_active = 0');
        await pool.query('UPDATE seasons SET is_active = 1 WHERE id = ?', [req.params.id]);

        // Créer les ratings pour tous les joueurs
        const [players] = await pool.query('SELECT id FROM players');
        for (const p of players) {
            await pool.query(
                'INSERT IGNORE INTO player_ratings (player_id, season_id) VALUES (?, ?)',
                [p.id, req.params.id]
            );
        }

        res.json({ message: 'Saison activée' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Modifier les coefficients (admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { base_k_factor, rank_multiplier, score_multiplier, duo_rank_multiplier, name } = req.body;
        await pool.query(
            'UPDATE seasons SET base_k_factor = ?, rank_multiplier = ?, score_multiplier = ?, duo_rank_multiplier = ?, name = ? WHERE id = ?',
            [base_k_factor, rank_multiplier, score_multiplier, duo_rank_multiplier, name, req.params.id]
        );
        res.json({ message: 'Saison mise à jour' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Terminer une saison (admin)
router.put('/:id/end', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE seasons SET is_active = 0, end_date = CURDATE() WHERE id = ?', [req.params.id]);
        res.json({ message: 'Saison terminée' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
