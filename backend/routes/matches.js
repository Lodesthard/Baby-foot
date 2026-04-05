const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { calculateMatchElo, calculateDuoEloChange, calculate1v1EloChange } = require('../utils/elo');
const { getRelevantStreakValue } = require('../utils/streaks');

const router = express.Router();

function getTeamStreak(ratingA, ratingB, didWin) {
    const streakA = getRelevantStreakValue(ratingA, didWin);
    const streakB = getRelevantStreakValue(ratingB, didWin);
    return Math.round((streakA + streakB) / 2);
}

// Enregistrer un match 2v2 (solo ou duo)
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

        const team1Wins = score_team1 > score_team2;

        // Build streak info for ELO calculation
        const streaks = {
            t1_attack_win: team1Wins ? ratings.t1_attack.current_win_streak : 0,
            t1_attack_loss: !team1Wins ? ratings.t1_attack.current_loss_streak : 0,
            t1_defense_win: team1Wins ? ratings.t1_defense.current_win_streak : 0,
            t1_defense_loss: !team1Wins ? ratings.t1_defense.current_loss_streak : 0,
            t2_attack_win: !team1Wins ? ratings.t2_attack.current_win_streak : 0,
            t2_attack_loss: team1Wins ? ratings.t2_attack.current_loss_streak : 0,
            t2_defense_win: !team1Wins ? ratings.t2_defense.current_win_streak : 0,
            t2_defense_loss: team1Wins ? ratings.t2_defense.current_loss_streak : 0,
        };

        // Calcul ELO individuel (attaque et défense)
        const eloChanges = calculateMatchElo(
            { score_team1, score_team2 },
            ratings,
            {
                base_k_factor: s.base_k_factor,
                rank_multiplier: s.rank_multiplier,
                score_multiplier: s.score_multiplier,
                duo_rank_multiplier: s.duo_rank_multiplier,
                loss_multiplier: s.loss_multiplier,
                win_streak_multiplier: s.win_streak_multiplier,
                loss_streak_multiplier: s.loss_streak_multiplier
            },
            streaks
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
            const team1DuoStreak = getTeamStreak(ratings.t1_attack, ratings.t1_defense, team1Wins);
            const team2DuoStreak = getTeamStreak(ratings.t2_attack, ratings.t2_defense, !team1Wins);
            duoEloChanges = calculateDuoEloChange(
                ratings.t1_attack.elo_duo, ratings.t1_defense.elo_duo,
                ratings.t2_attack.elo_duo, ratings.t2_defense.elo_duo,
                score_team1, score_team2,
                {
                    base_k_factor: s.base_k_factor,
                    rank_multiplier: s.rank_multiplier,
                    score_multiplier: s.score_multiplier,
                    duo_rank_multiplier: s.duo_rank_multiplier,
                    loss_multiplier: s.loss_multiplier,
                    win_streak_multiplier: s.win_streak_multiplier,
                    loss_streak_multiplier: s.loss_streak_multiplier
                },
                team1DuoStreak,
                team2DuoStreak
            );
        }

        // Insérer le match
        const [matchResult] = await conn.query(
            `INSERT INTO matches (season_id, match_type, team1_attack, team1_defense, score_team1,
             team2_attack, team2_defense, score_team2,
             elo_change_t1_attack, elo_change_t1_defense, elo_change_t2_attack, elo_change_t2_defense,
             elo_change_duo_t1, elo_change_duo_t2, elo_change_1v1_t1, elo_change_1v1_t2, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
            [s.id, isDuo ? 'duo' : 'solo',
             team1_attack, team1_defense, score_team1,
             team2_attack, team2_defense, score_team2,
             eloChanges.elo_change_t1_attack, eloChanges.elo_change_t1_defense,
             eloChanges.elo_change_t2_attack, eloChanges.elo_change_t2_defense,
             duoEloChanges.elo_change_duo_t1, duoEloChanges.elo_change_duo_t2,
             req.user.id]
        );

        // Mettre à jour les ratings + streaks
        const updateRating = async (playerId, eloAttackChange, eloDefenseChange, eloDuoChange, isAttacker, won) => {
            const field_wins = isAttacker ? (won ? 'wins_attack' : 'losses_attack') : (won ? 'wins_defense' : 'losses_defense');
            let query = `UPDATE player_ratings SET
                elo_attack = GREATEST(0, elo_attack + ?),
                elo_defense = GREATEST(0, elo_defense + ?),
                elo_duo = GREATEST(0, elo_duo + ?),
                ${field_wins} = ${field_wins} + 1,
                current_win_streak = ${won ? 'current_win_streak + 1' : '0'},
                current_loss_streak = ${won ? '0' : 'current_loss_streak + 1'}`;
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
                'INSERT INTO elo_history (player_id, season_id, match_id, elo_attack, elo_defense, elo_duo, elo_1v1) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [pid, s.id, matchResult.insertId, r[0].elo_attack, r[0].elo_defense, r[0].elo_duo, r[0].elo_1v1]
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

// Enregistrer un match 1v1
router.post('/1v1', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { player1, player2, score_player1, score_player2 } = req.body;

        if (score_player1 === score_player2) {
            return res.status(400).json({ error: 'Pas de match nul possible' });
        }
        if (player1 === player2) {
            return res.status(400).json({ error: 'Les 2 joueurs doivent être différents' });
        }

        const [season] = await conn.query('SELECT * FROM seasons WHERE is_active = 1');
        if (season.length === 0) {
            return res.status(400).json({ error: 'Aucune saison active' });
        }
        const s = season[0];

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

        const r1 = await getRating(player1);
        const r2 = await getRating(player2);

        const p1Wins = score_player1 > score_player2;

        const eloChanges = calculate1v1EloChange(
            r1.elo_1v1, r2.elo_1v1,
            score_player1, score_player2,
            {
                base_k_factor: s.base_k_factor,
                rank_multiplier: s.rank_multiplier,
                score_multiplier: s.score_multiplier,
                loss_multiplier: s.loss_multiplier,
                win_streak_multiplier: s.win_streak_multiplier,
                loss_streak_multiplier: s.loss_streak_multiplier
            },
            p1Wins ? r1.current_win_streak : r1.current_loss_streak,
            !p1Wins ? r2.current_win_streak : r2.current_loss_streak
        );

        // Pour 1v1, on utilise team1_attack = player1, team2_attack = player2, defense = meme joueur
        const [matchResult] = await conn.query(
            `INSERT INTO matches (season_id, match_type, team1_attack, team1_defense, score_team1,
             team2_attack, team2_defense, score_team2,
             elo_change_t1_attack, elo_change_t1_defense, elo_change_t2_attack, elo_change_t2_defense,
             elo_change_duo_t1, elo_change_duo_t2, elo_change_1v1_t1, elo_change_1v1_t2, recorded_by)
             VALUES (?, '1v1', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?)`,
            [s.id,
             player1, player1, score_player1,
             player2, player2, score_player2,
             eloChanges.elo_change_1v1_t1, eloChanges.elo_change_1v1_t2,
             req.user.id]
        );

        // Update ratings + streaks
        await conn.query(
            `UPDATE player_ratings SET
                elo_1v1 = GREATEST(0, elo_1v1 + ?),
                wins_1v1 = wins_1v1 + ?,
                losses_1v1 = losses_1v1 + ?,
                current_win_streak = ${p1Wins ? 'current_win_streak + 1' : '0'},
                current_loss_streak = ${p1Wins ? '0' : 'current_loss_streak + 1'}
             WHERE player_id = ? AND season_id = ?`,
            [eloChanges.elo_change_1v1_t1, p1Wins ? 1 : 0, p1Wins ? 0 : 1, player1, s.id]
        );

        await conn.query(
            `UPDATE player_ratings SET
                elo_1v1 = GREATEST(0, elo_1v1 + ?),
                wins_1v1 = wins_1v1 + ?,
                losses_1v1 = losses_1v1 + ?,
                current_win_streak = ${!p1Wins ? 'current_win_streak + 1' : '0'},
                current_loss_streak = ${!p1Wins ? '0' : 'current_loss_streak + 1'}
             WHERE player_id = ? AND season_id = ?`,
            [eloChanges.elo_change_1v1_t2, !p1Wins ? 1 : 0, !p1Wins ? 0 : 1, player2, s.id]
        );

        // Historique ELO
        for (const pid of [player1, player2]) {
            const [r] = await conn.query('SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?', [pid, s.id]);
            await conn.query(
                'INSERT INTO elo_history (player_id, season_id, match_id, elo_attack, elo_defense, elo_duo, elo_1v1) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [pid, s.id, matchResult.insertId, r[0].elo_attack, r[0].elo_defense, r[0].elo_duo, r[0].elo_1v1]
            );
        }

        await conn.commit();

        res.status(201).json({
            message: 'Match 1v1 enregistré',
            match_id: matchResult.insertId,
            elo_changes: eloChanges
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
             WHERE m.season_id = ? AND m.is_cancelled = 0
             ORDER BY m.played_at DESC LIMIT 20`,
            [season[0].id]
        );
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Historique complet des matchs (tous les joueurs)
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json([]);

        const page = parseInt(req.query.page) || 1;
        const limit = 30;
        const offset = (page - 1) * limit;

        const [total] = await pool.query(
            'SELECT COUNT(*) as count FROM matches WHERE season_id = ? AND is_cancelled = 0',
            [season[0].id]
        );

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
             ORDER BY m.played_at DESC
             LIMIT ? OFFSET ?`,
            [season[0].id, limit, offset]
        );

        res.json({
            matches,
            total: total[0].count,
            page,
            totalPages: Math.ceil(total[0].count / limit)
        });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
