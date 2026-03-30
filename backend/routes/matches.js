const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { calculateMatchElo, calculateDuoEloChange } = require('../utils/elo');

const router = express.Router();

// Enregistrer un match
router.post('/', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { team1_attack, team1_defense, team2_attack, team2_defense, score_team1, score_team2 } = req.body;

        // Validations
        if (score_team1 === score_team2) {
            return res.status(400).json({ error: 'Pas de match nul possible' });
        }
        const playerIds = [team1_attack, team1_defense, team2_attack, team2_defense];
        if (new Set(playerIds).size !== 4) {
            return res.status(400).json({ error: 'Les 4 joueurs doivent être différents' });
        }

        // Saison active
        const [season] = await conn.query('SELECT * FROM seasons WHERE is_active = 1');
        if (season.length === 0) {
            return res.status(400).json({ error: 'Aucune saison active' });
        }
        const s = season[0];

        // Récupérer les ratings
        const getRating = async (playerId) => {
            const [rows] = await conn.query(
                'SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?',
                [playerId, s.id]
            );
            if (rows.length === 0) {
                await conn.query('INSERT INTO player_ratings (player_id, season_id) VALUES (?, ?)', [playerId, s.id]);
                const [newRows] = await conn.query(
                    'SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?',
                    [playerId, s.id]
                );
                return newRows[0];
            }
            return rows[0];
        };

        const ratings = {
            t1_attack: await getRating(team1_attack),
            t1_defense: await getRating(team1_defense),
            t2_attack: await getRating(team2_attack),
            t2_defense: await getRating(team2_defense),
        };

        // Calcul ELO individuel (attaque et défense)
        const eloChanges = calculateMatchElo(
            { score_team1, score_team2 },
            ratings,
            {
                base_k_factor: s.base_k_factor,
                rank_multiplier: s.rank_multiplier,
                score_multiplier: s.score_multiplier,
                duo_rank_multiplier: s.duo_rank_multiplier
            }
        );

        // Vérifier si c'est un match duo
        let isDuo = false;
        let duoEloChanges = { elo_change_duo_t1: 0, elo_change_duo_t2: 0 };

        const [duo1] = await conn.query(
            `SELECT * FROM duos WHERE season_id = ? AND
             ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))`,
            [s.id, team1_attack, team1_defense, team1_defense, team1_attack]
        );
        const [duo2] = await conn.query(
            `SELECT * FROM duos WHERE season_id = ? AND
             ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))`,
            [s.id, team2_attack, team2_defense, team2_defense, team2_attack]
        );

        if (duo1.length > 0 && duo2.length > 0) {
            isDuo = true;
            duoEloChanges = calculateDuoEloChange(
                ratings.t1_attack.elo_duo, ratings.t1_defense.elo_duo,
                ratings.t2_attack.elo_duo, ratings.t2_defense.elo_duo,
                score_team1, score_team2,
                { base_k_factor: s.base_k_factor, rank_multiplier: s.rank_multiplier, score_multiplier: s.score_multiplier, duo_rank_multiplier: s.duo_rank_multiplier }
            );
        }

        // Insérer le match
        const [matchResult] = await conn.query(
            `INSERT INTO matches (season_id, match_type, team1_attack, team1_defense, score_team1,
             team2_attack, team2_defense, score_team2,
             elo_change_t1_attack, elo_change_t1_defense, elo_change_t2_attack, elo_change_t2_defense,
             elo_change_duo_t1, elo_change_duo_t2, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [s.id, isDuo ? 'duo' : 'solo',
             team1_attack, team1_defense, score_team1,
             team2_attack, team2_defense, score_team2,
             eloChanges.elo_change_t1_attack, eloChanges.elo_change_t1_defense,
             eloChanges.elo_change_t2_attack, eloChanges.elo_change_t2_defense,
             duoEloChanges.elo_change_duo_t1, duoEloChanges.elo_change_duo_t2,
             req.user.id]
        );

        const team1Wins = score_team1 > score_team2;

        // Mettre à jour les ratings
        const updateRating = async (playerId, eloAttackChange, eloDefenseChange, eloDuoChange, isAttacker, won) => {
            const field_wins = isAttacker ? (won ? 'wins_attack' : 'losses_attack') : (won ? 'wins_defense' : 'losses_defense');
            let query = `UPDATE player_ratings SET
                elo_attack = GREATEST(0, elo_attack + ?),
                elo_defense = GREATEST(0, elo_defense + ?),
                elo_duo = GREATEST(0, elo_duo + ?),
                ${field_wins} = ${field_wins} + 1`;
            if (isDuo) {
                query += `, ${won ? 'wins_duo' : 'losses_duo'} = ${won ? 'wins_duo' : 'losses_duo'} + 1`;
            }
            query += ` WHERE player_id = ? AND season_id = ?`;
            await conn.query(query, [eloAttackChange, eloDefenseChange, eloDuoChange, playerId, s.id]);
        };

        await updateRating(team1_attack, eloChanges.elo_change_t1_attack, 0, duoEloChanges.elo_change_duo_t1, true, team1Wins);
        await updateRating(team1_defense, 0, eloChanges.elo_change_t1_defense, duoEloChanges.elo_change_duo_t1, false, team1Wins);
        await updateRating(team2_attack, eloChanges.elo_change_t2_attack, 0, duoEloChanges.elo_change_duo_t2, true, !team1Wins);
        await updateRating(team2_defense, 0, eloChanges.elo_change_t2_defense, duoEloChanges.elo_change_duo_t2, false, !team1Wins);

        // Historique ELO
        for (const pid of playerIds) {
            const [r] = await conn.query('SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?', [pid, s.id]);
            await conn.query(
                'INSERT INTO elo_history (player_id, season_id, match_id, elo_attack, elo_defense, elo_duo) VALUES (?, ?, ?, ?, ?, ?)',
                [pid, s.id, matchResult.insertId, r[0].elo_attack, r[0].elo_defense, r[0].elo_duo]
            );
        }

        await conn.commit();

        res.status(201).json({
            message: 'Match enregistré',
            match_id: matchResult.insertId,
            elo_changes: { ...eloChanges, ...duoEloChanges },
            is_duo: isDuo
        });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

// Derniers matchs
router.get('/recent', authenticateToken, async (req, res) => {
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
             WHERE m.season_id = ?
             ORDER BY m.played_at DESC LIMIT 20`,
            [season[0].id]
        );
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
