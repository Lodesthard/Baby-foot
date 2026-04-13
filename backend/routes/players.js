const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { didPlayerWinMatch } = require('../utils/streaks');

const router = express.Router();

// Liste de tous les joueurs
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, identifier, display_name, profile_photo FROM players ORDER BY display_name'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Search players
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 1) return res.json([]);

        const [rows] = await pool.query(
            `SELECT id, identifier, display_name, profile_photo
             FROM players
             WHERE display_name LIKE ? OR identifier LIKE ?
             ORDER BY display_name
             LIMIT 20`,
            [`%${q}%`, `%${q}%`]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Stats d'un joueur pour la saison active
router.get('/:id/stats', authenticateToken, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json(null);

        const [ratings] = await pool.query(
            'SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?',
            [req.params.id, season[0].id]
        );

        const [duo] = await pool.query(
            `SELECT d.*, p1.display_name as player1_name, p2.display_name as player2_name
             FROM duos d
             JOIN players p1 ON d.player1_id = p1.id
             JOIN players p2 ON d.player2_id = p2.id
             WHERE (d.player1_id = ? OR d.player2_id = ?) AND d.season_id = ?`,
            [req.params.id, req.params.id, season[0].id]
        );

        const [player] = await pool.query(
            'SELECT id, identifier, display_name, profile_photo FROM players WHERE id = ?',
            [req.params.id]
        );

        // Compute global rank position
        let globalRank = null;
        if (ratings[0]) {
            const [allRatings] = await pool.query(
                `SELECT player_id, (elo_attack + elo_defense) as total_elo
                 FROM player_ratings WHERE season_id = ?
                 ORDER BY total_elo DESC`,
                [season[0].id]
            );
            const pos = allRatings.findIndex(r => r.player_id === parseInt(req.params.id));
            globalRank = pos >= 0 ? pos + 1 : null;
        }

        res.json({
            player: player[0] || null,
            ratings: ratings[0] || null,
            duo: duo[0] || null,
            season_id: season[0].id,
            global_rank: globalRank,
            total_players: (await pool.query('SELECT COUNT(*) as c FROM player_ratings WHERE season_id = ?', [season[0].id]))[0][0].c
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Head-to-head winrate between two players
router.get('/:id/vs/:opponentId', authenticateToken, async (req, res) => {
    try {
        const myId = parseInt(req.params.id);
        const oppId = parseInt(req.params.opponentId);

        const [matches] = await pool.query(
            `SELECT id, match_type, season_id, team1_attack, team1_defense, team2_attack, team2_defense, score_team1, score_team2, played_at
             FROM matches
             WHERE is_cancelled = 0
               AND (
                    (
                        (team1_attack = ? OR team1_defense = ?)
                        AND (team2_attack = ? OR team2_defense = ?)
                    )
                    OR
                    (
                        (team1_attack = ? OR team1_defense = ?)
                        AND (team2_attack = ? OR team2_defense = ?)
                    )
               )
             ORDER BY played_at DESC, id DESC`,
            [myId, myId, oppId, oppId, oppId, oppId, myId, myId]
        );

        let wins = 0;
        let losses = 0;
        for (const m of matches) {
            const didWin = didPlayerWinMatch(m, myId);
            if (didWin === true) {
                wins++;
            } else if (didWin === false) {
                losses++;
            }
        }

        const total = wins + losses;
        const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;

        res.json({ wins, losses, total, winrate });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Historique des matchs d'un joueur
router.get('/:id/matches', authenticateToken, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json([]);

        const [matches] = await pool.query(
            `SELECT m.*,
                p1a.display_name as t1_attack_name, p1d.display_name as t1_defense_name,
                p2a.display_name as t2_attack_name, p2d.display_name as t2_defense_name
             FROM matches m
             JOIN players p1a ON m.team1_attack = p1a.id
             JOIN players p1d ON m.team1_defense = p1d.id
             JOIN players p2a ON m.team2_attack = p2a.id
             JOIN players p2d ON m.team2_defense = p2d.id
             WHERE m.season_id = ? AND m.is_cancelled = 0
               AND (m.team1_attack = ? OR m.team1_defense = ? OR m.team2_attack = ? OR m.team2_defense = ?)
             ORDER BY m.played_at DESC LIMIT 50`,
            [season[0].id, req.params.id, req.params.id, req.params.id, req.params.id]
        );
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
