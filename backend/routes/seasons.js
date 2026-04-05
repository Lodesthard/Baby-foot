const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/active', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM seasons WHERE is_active = 1');
        res.json(rows[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM seasons ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            name,
            base_k_factor,
            rank_multiplier,
            score_multiplier,
            duo_rank_multiplier,
            loss_multiplier,
            win_streak_multiplier,
            loss_streak_multiplier,
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nom requis' });
        }

        const [result] = await pool.query(
            `INSERT INTO seasons (
                name, start_date, base_k_factor, rank_multiplier, score_multiplier,
                duo_rank_multiplier, loss_multiplier, win_streak_multiplier, loss_streak_multiplier
            ) VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                base_k_factor ?? 32,
                rank_multiplier ?? 1.5,
                score_multiplier ?? 0.1,
                duo_rank_multiplier ?? 1.3,
                loss_multiplier ?? 1,
                win_streak_multiplier ?? 0.05,
                loss_streak_multiplier ?? 0.05,
            ]
        );

        res.status(201).json({ message: 'Saison creee', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE seasons SET is_active = 0');
        await pool.query('UPDATE seasons SET is_active = 1 WHERE id = ?', [req.params.id]);

        const [players] = await pool.query('SELECT id FROM players');
        for (const player of players) {
            await pool.query(
                'INSERT IGNORE INTO player_ratings (player_id, season_id) VALUES (?, ?)',
                [player.id, req.params.id]
            );
        }

        res.json({ message: 'Saison activee' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            base_k_factor,
            rank_multiplier,
            score_multiplier,
            duo_rank_multiplier,
            loss_multiplier,
            win_streak_multiplier,
            loss_streak_multiplier,
            name,
        } = req.body;

        await pool.query(
            `UPDATE seasons
             SET base_k_factor = ?,
                 rank_multiplier = ?,
                 score_multiplier = ?,
                 duo_rank_multiplier = ?,
                 loss_multiplier = ?,
                 win_streak_multiplier = ?,
                 loss_streak_multiplier = ?,
                 name = ?
             WHERE id = ?`,
            [
                base_k_factor,
                rank_multiplier,
                score_multiplier,
                duo_rank_multiplier,
                loss_multiplier,
                win_streak_multiplier,
                loss_streak_multiplier,
                name,
                req.params.id,
            ]
        );

        res.json({ message: 'Saison mise a jour' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/end', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE seasons SET is_active = 0, end_date = CURDATE() WHERE id = ?', [req.params.id]);
        res.json({ message: 'Saison terminee' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
