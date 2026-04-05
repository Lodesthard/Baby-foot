const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { getRank } = require('../utils/elo');

const router = express.Router();

async function getActiveSeasonId() {
    const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
    return season[0]?.id || null;
}

async function ensureSeasonRatings(seasonId) {
    await pool.query(
        `INSERT IGNORE INTO player_ratings (player_id, season_id)
         SELECT id, ? FROM players`,
        [seasonId]
    );
}

// Classement attaque
router.get('/attack', authenticateToken, async (req, res) => {
    try {
        const seasonId = await getActiveSeasonId();
        if (!seasonId) return res.json([]);

        await ensureSeasonRatings(seasonId);

        const [rows] = await pool.query(
            `SELECT pr.*, p.display_name, p.profile_photo
             FROM player_ratings pr
             JOIN players p ON pr.player_id = p.id
             WHERE pr.season_id = ?
             ORDER BY pr.elo_attack DESC, p.display_name ASC`,
            [seasonId]
        );

        const ranked = rows.map((r, i) => ({
            position: i + 1,
            player_id: r.player_id,
            display_name: r.display_name,
            profile_photo: r.profile_photo,
            elo: r.elo_attack,
            rank: getRank(r.elo_attack),
            wins: r.wins_attack,
            losses: r.losses_attack,
        }));

        res.json(ranked);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Classement defense
router.get('/defense', authenticateToken, async (req, res) => {
    try {
        const seasonId = await getActiveSeasonId();
        if (!seasonId) return res.json([]);

        await ensureSeasonRatings(seasonId);

        const [rows] = await pool.query(
            `SELECT pr.*, p.display_name, p.profile_photo
             FROM player_ratings pr
             JOIN players p ON pr.player_id = p.id
             WHERE pr.season_id = ?
             ORDER BY pr.elo_defense DESC, p.display_name ASC`,
            [seasonId]
        );

        const ranked = rows.map((r, i) => ({
            position: i + 1,
            player_id: r.player_id,
            display_name: r.display_name,
            profile_photo: r.profile_photo,
            elo: r.elo_defense,
            rank: getRank(r.elo_defense),
            wins: r.wins_defense,
            losses: r.losses_defense,
        }));

        res.json(ranked);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Classement duo
router.get('/duo', authenticateToken, async (req, res) => {
    try {
        const seasonId = await getActiveSeasonId();
        if (!seasonId) return res.json([]);

        await ensureSeasonRatings(seasonId);

        const [duos] = await pool.query(
            `SELECT d.*, d.duo_name,
                p1.display_name as player1_name, p2.display_name as player2_name,
                pr1.elo_duo as elo1, pr2.elo_duo as elo2,
                pr1.wins_duo as wins1, pr1.losses_duo as losses1
             FROM duos d
             JOIN players p1 ON d.player1_id = p1.id
             JOIN players p2 ON d.player2_id = p2.id
             JOIN player_ratings pr1 ON pr1.player_id = d.player1_id AND pr1.season_id = d.season_id
             JOIN player_ratings pr2 ON pr2.player_id = d.player2_id AND pr2.season_id = d.season_id
             WHERE d.season_id = ?
             ORDER BY (pr1.elo_duo + pr2.elo_duo) / 2 DESC, p1.display_name ASC, p2.display_name ASC`,
            [seasonId]
        );

        const ranked = duos.map((d, i) => {
            const avgElo = Math.round((d.elo1 + d.elo2) / 2);
            return {
                position: i + 1,
                duo_name: d.duo_name,
                player1_name: d.player1_name,
                player2_name: d.player2_name,
                player1_id: d.player1_id,
                player2_id: d.player2_id,
                elo: avgElo,
                rank: getRank(avgElo),
                wins: d.wins1,
                losses: d.losses1,
            };
        });

        res.json(ranked);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Classement 1v1
router.get('/1v1', authenticateToken, async (req, res) => {
    try {
        const seasonId = await getActiveSeasonId();
        if (!seasonId) return res.json([]);

        await ensureSeasonRatings(seasonId);

        const [rows] = await pool.query(
            `SELECT pr.*, p.display_name, p.profile_photo
             FROM player_ratings pr
             JOIN players p ON pr.player_id = p.id
             WHERE pr.season_id = ?
             ORDER BY pr.elo_1v1 DESC, p.display_name ASC`,
            [seasonId]
        );

        const ranked = rows.map((r, i) => ({
            position: i + 1,
            player_id: r.player_id,
            display_name: r.display_name,
            profile_photo: r.profile_photo,
            elo: r.elo_1v1,
            rank: getRank(r.elo_1v1),
            wins: r.wins_1v1,
            losses: r.losses_1v1,
        }));

        res.json(ranked);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Classement global (somme des positions attaque + defense + 1v1)
router.get('/global', authenticateToken, async (req, res) => {
    try {
        const seasonId = await getActiveSeasonId();
        if (!seasonId) return res.json([]);

        await ensureSeasonRatings(seasonId);

        const [rows] = await pool.query(
            `SELECT pr.*, p.display_name, p.profile_photo
             FROM player_ratings pr
             JOIN players p ON pr.player_id = p.id
             WHERE pr.season_id = ?
             ORDER BY (pr.elo_attack + pr.elo_defense + pr.elo_1v1) DESC, p.display_name ASC`,
            [seasonId]
        );

        const ranked = rows.map((r, i) => {
            const totalWins = r.wins_attack + r.wins_defense + r.wins_1v1;
            const totalLosses = r.losses_attack + r.losses_defense + r.losses_1v1;
            return {
                position: i + 1,
                player_id: r.player_id,
                display_name: r.display_name,
                profile_photo: r.profile_photo,
                elo: r.elo_attack + r.elo_defense + r.elo_1v1,
                rank: getRank(Math.round((r.elo_attack + r.elo_defense + r.elo_1v1) / 3)),
                elo_attack: r.elo_attack,
                elo_defense: r.elo_defense,
                elo_1v1: r.elo_1v1,
                wins: totalWins,
                losses: totalLosses,
            };
        });

        res.json(ranked);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
