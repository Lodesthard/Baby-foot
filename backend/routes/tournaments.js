const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { calculateMatchElo, calculateDuoEloChange, calculate1v1EloChange } = require('../utils/elo');

const router = express.Router();

// ===== Helpers =====

function nextPowerOf2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

function getTotalRounds(participantCount) {
    return Math.ceil(Math.log2(participantCount));
}

// Charge (ou cree) la ligne player_ratings pour la saison donnee.
async function fetchOrCreateRating(conn, playerId, seasonId) {
    const [rows] = await conn.query(
        'SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?',
        [playerId, seasonId]
    );
    if (rows.length > 0) return rows[0];

    await conn.query(
        'INSERT INTO player_ratings (player_id, season_id) VALUES (?, ?)',
        [playerId, seasonId]
    );
    const [newRows] = await conn.query(
        'SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?',
        [playerId, seasonId]
    );
    return newRows[0];
}

// ===== Liste des tournois de la saison active =====
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json([]);

        const [tournaments] = await pool.query(
            `SELECT t.*, p.display_name as created_by_name,
                (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) as participant_count
             FROM tournaments t
             JOIN players p ON t.created_by = p.id
             WHERE t.season_id = ?
             ORDER BY t.created_at DESC`,
            [season[0].id]
        );
        res.json(tournaments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== Detail d'un tournoi avec bracket =====
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [tournaments] = await pool.query(
            `SELECT t.*, p.display_name as created_by_name
             FROM tournaments t
             JOIN players p ON t.created_by = p.id
             WHERE t.id = ?`,
            [req.params.id]
        );
        if (tournaments.length === 0) {
            return res.status(404).json({ error: 'Tournoi introuvable' });
        }
        const tournament = tournaments[0];

        // Participants
        let participants;
        if (tournament.tournament_type === 'simple') {
            const [rows] = await pool.query(
                `SELECT tp.*, pl.display_name,
                    pr.elo_1v1
                 FROM tournament_participants tp
                 JOIN players pl ON tp.player_id = pl.id
                 LEFT JOIN player_ratings pr ON pr.player_id = pl.id AND pr.season_id = ?
                 WHERE tp.tournament_id = ?
                 ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC`,
                [tournament.season_id, tournament.id]
            );
            participants = rows;
        } else {
            const [rows] = await pool.query(
                `SELECT tp.*, d.duo_name, d.player1_id, d.player2_id,
                    p1.display_name as player1_name, p2.display_name as player2_name,
                    pr1.elo_duo as elo_duo_p1, pr2.elo_duo as elo_duo_p2
                 FROM tournament_participants tp
                 JOIN duos d ON tp.duo_id = d.id
                 JOIN players p1 ON d.player1_id = p1.id
                 JOIN players p2 ON d.player2_id = p2.id
                 LEFT JOIN player_ratings pr1 ON pr1.player_id = d.player1_id AND pr1.season_id = ?
                 LEFT JOIN player_ratings pr2 ON pr2.player_id = d.player2_id AND pr2.season_id = ?
                 WHERE tp.tournament_id = ?
                 ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC`,
                [tournament.season_id, tournament.season_id, tournament.id]
            );
            participants = rows;
        }

        // Bracket (matchs du tournoi)
        const [matches] = await pool.query(
            `SELECT tm.*,
                m.score_team1, m.score_team2, m.match_type,
                m.elo_change_t1_attack, m.elo_change_t1_defense,
                m.elo_change_t2_attack, m.elo_change_t2_defense,
                m.elo_change_duo_t1, m.elo_change_duo_t2,
                m.elo_change_1v1_t1, m.elo_change_1v1_t2
             FROM tournament_matches tm
             LEFT JOIN matches m ON tm.match_id = m.id
             WHERE tm.tournament_id = ?
             ORDER BY tm.round ASC, tm.position ASC`,
            [tournament.id]
        );

        res.json({ tournament, participants, matches });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== Creer un tournoi (admin) =====
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, tournament_type, max_participants } = req.body;

        if (!name || !tournament_type) {
            return res.status(400).json({ error: 'Nom et type requis' });
        }
        if (!['simple', 'double'].includes(tournament_type)) {
            return res.status(400).json({ error: 'Type invalide (simple ou double)' });
        }

        const maxP = parseInt(max_participants) || 16;
        if (maxP < 4 || maxP > 64) {
            return res.status(400).json({ error: 'Entre 4 et 64 participants' });
        }

        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) {
            return res.status(400).json({ error: 'Aucune saison active' });
        }

        const [result] = await pool.query(
            'INSERT INTO tournaments (season_id, name, tournament_type, max_participants, created_by) VALUES (?, ?, ?, ?, ?)',
            [season[0].id, name, tournament_type, maxP, req.user.id]
        );

        res.status(201).json({ message: 'Tournoi cree', tournament_id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== S'inscrire a un tournoi =====
router.post('/:id/register', authenticateToken, async (req, res) => {
    try {
        const [tournaments] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
        if (tournaments.length === 0) {
            return res.status(404).json({ error: 'Tournoi introuvable' });
        }
        const t = tournaments[0];

        if (t.status !== 'registration') {
            return res.status(400).json({ error: 'Les inscriptions sont fermees' });
        }

        const [count] = await pool.query(
            'SELECT COUNT(*) as c FROM tournament_participants WHERE tournament_id = ?',
            [t.id]
        );
        if (count[0].c >= t.max_participants) {
            return res.status(400).json({ error: 'Tournoi complet' });
        }

        if (t.tournament_type === 'simple') {
            // Check if already registered
            const [existing] = await pool.query(
                'SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ?',
                [t.id, req.user.id]
            );
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Deja inscrit' });
            }

            await pool.query(
                'INSERT INTO tournament_participants (tournament_id, player_id) VALUES (?, ?)',
                [t.id, req.user.id]
            );
        } else {
            // Double: must have a duo
            const { duo_id } = req.body;
            if (!duo_id) {
                return res.status(400).json({ error: 'ID du duo requis' });
            }

            // Verify duo exists and belongs to current user
            const [duos] = await pool.query(
                'SELECT * FROM duos WHERE id = ? AND season_id = ? AND (player1_id = ? OR player2_id = ?)',
                [duo_id, t.season_id, req.user.id, req.user.id]
            );
            if (duos.length === 0) {
                return res.status(400).json({ error: 'Duo invalide' });
            }

            // Check if duo already registered
            const [existing] = await pool.query(
                'SELECT id FROM tournament_participants WHERE tournament_id = ? AND duo_id = ?',
                [t.id, duo_id]
            );
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Duo deja inscrit' });
            }

            await pool.query(
                'INSERT INTO tournament_participants (tournament_id, duo_id) VALUES (?, ?)',
                [t.id, duo_id]
            );
        }

        res.json({ message: 'Inscription confirmee' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== Se desinscrire d'un tournoi =====
router.delete('/:id/register', authenticateToken, async (req, res) => {
    try {
        const [tournaments] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
        if (tournaments.length === 0) {
            return res.status(404).json({ error: 'Tournoi introuvable' });
        }
        if (tournaments[0].status !== 'registration') {
            return res.status(400).json({ error: 'Impossible de se desinscrire apres le debut' });
        }

        if (tournaments[0].tournament_type === 'simple') {
            await pool.query(
                'DELETE FROM tournament_participants WHERE tournament_id = ? AND player_id = ?',
                [req.params.id, req.user.id]
            );
        } else {
            // Find user's duo and unregister it
            const [duos] = await pool.query(
                'SELECT id FROM duos WHERE season_id = ? AND (player1_id = ? OR player2_id = ?)',
                [tournaments[0].season_id, req.user.id, req.user.id]
            );
            if (duos.length > 0) {
                await pool.query(
                    'DELETE FROM tournament_participants WHERE tournament_id = ? AND duo_id = ?',
                    [req.params.id, duos[0].id]
                );
            }
        }

        res.json({ message: 'Desinscription confirmee' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== Lancer un tournoi (admin) - genere le bracket =====
router.post('/:id/start', authenticateToken, requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [tournaments] = await conn.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
        if (tournaments.length === 0) {
            return res.status(404).json({ error: 'Tournoi introuvable' });
        }
        const t = tournaments[0];

        if (t.status !== 'registration') {
            return res.status(400).json({ error: 'Le tournoi a deja demarre' });
        }

        // Get participants with ELO for seeding
        let participants;
        if (t.tournament_type === 'simple') {
            const [rows] = await conn.query(
                `SELECT tp.id, tp.player_id, COALESCE(pr.elo_1v1, 1200) as elo
                 FROM tournament_participants tp
                 LEFT JOIN player_ratings pr ON pr.player_id = tp.player_id AND pr.season_id = ?
                 WHERE tp.tournament_id = ?`,
                [t.season_id, t.id]
            );
            participants = rows;
        } else {
            const [rows] = await conn.query(
                `SELECT tp.id, tp.duo_id,
                    ROUND((COALESCE(pr1.elo_duo, 1200) + COALESCE(pr2.elo_duo, 1200)) / 2) as elo
                 FROM tournament_participants tp
                 JOIN duos d ON tp.duo_id = d.id
                 LEFT JOIN player_ratings pr1 ON pr1.player_id = d.player1_id AND pr1.season_id = ?
                 LEFT JOIN player_ratings pr2 ON pr2.player_id = d.player2_id AND pr2.season_id = ?
                 WHERE tp.tournament_id = ?`,
                [t.season_id, t.season_id, t.id]
            );
            participants = rows;
        }

        if (participants.length < 2) {
            return res.status(400).json({ error: 'Minimum 2 participants requis' });
        }

        // Sort by ELO descending for seeding
        participants.sort((a, b) => b.elo - a.elo);

        // Assign seeds
        for (let i = 0; i < participants.length; i++) {
            await conn.query('UPDATE tournament_participants SET seed = ? WHERE id = ?', [i + 1, participants[i].id]);
            participants[i].seed = i + 1;
        }

        // Generate bracket (single elimination)
        const n = participants.length;
        const bracketSize = nextPowerOf2(n);
        const totalRounds = getTotalRounds(bracketSize);
        const numByes = bracketSize - n;

        // Standard seeding: 1 vs bracketSize, 2 vs bracketSize-1, etc.
        // Place participants in bracket positions with byes for top seeds
        const slots = new Array(bracketSize).fill(null);

        // Seed placement following standard tournament bracket seeding
        function getStandardSeedPositions(size) {
            if (size === 1) return [0];
            const positions = new Array(size);
            positions[0] = 0;
            positions[1] = 1;
            for (let round = 1; Math.pow(2, round) < size; round++) {
                const count = Math.pow(2, round);
                const nextCount = count * 2;
                const temp = new Array(nextCount);
                for (let i = 0; i < count; i++) {
                    temp[i * 2] = positions[i];
                    temp[i * 2 + 1] = nextCount - 1 - positions[i];
                }
                for (let i = 0; i < nextCount; i++) {
                    positions[i] = temp[i];
                }
            }
            return positions;
        }

        const seedPositions = getStandardSeedPositions(bracketSize);
        for (let i = 0; i < bracketSize; i++) {
            if (i < n) {
                slots[seedPositions[i]] = participants[i];
            }
        }

        // Create round 1 matches
        const round1Matches = bracketSize / 2;
        for (let pos = 0; pos < round1Matches; pos++) {
            const p1 = slots[pos * 2];
            const p2 = slots[pos * 2 + 1];

            const isBye = !p1 || !p2;
            const winnerId = isBye ? (p1 ? p1.id : (p2 ? p2.id : null)) : null;

            await conn.query(
                `INSERT INTO tournament_matches (tournament_id, round, position, participant1_id, participant2_id, winner_participant_id, is_bye)
                 VALUES (?, 1, ?, ?, ?, ?, ?)`,
                [t.id, pos, p1 ? p1.id : null, p2 ? p2.id : null, winnerId, isBye ? 1 : 0]
            );
        }

        // Create empty matches for subsequent rounds
        for (let round = 2; round <= totalRounds; round++) {
            const matchesInRound = bracketSize / Math.pow(2, round);
            for (let pos = 0; pos < matchesInRound; pos++) {
                await conn.query(
                    'INSERT INTO tournament_matches (tournament_id, round, position) VALUES (?, ?, ?)',
                    [t.id, round, pos]
                );
            }
        }

        // Advance bye winners to round 2
        const [round1] = await conn.query(
            'SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = 1 ORDER BY position',
            [t.id]
        );
        const [round2] = await conn.query(
            'SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = 2 ORDER BY position',
            [t.id]
        );

        for (const m of round1) {
            if (m.is_bye && m.winner_participant_id) {
                const r2Pos = Math.floor(m.position / 2);
                const r2Match = round2.find(rm => rm.position === r2Pos);
                if (r2Match) {
                    const field = m.position % 2 === 0 ? 'participant1_id' : 'participant2_id';
                    await conn.query(
                        `UPDATE tournament_matches SET ${field} = ? WHERE id = ?`,
                        [m.winner_participant_id, r2Match.id]
                    );
                }
            }
        }

        // Update tournament status
        await conn.query(
            'UPDATE tournaments SET status = ?, started_at = NOW() WHERE id = ?',
            ['in_progress', t.id]
        );

        await conn.commit();
        res.json({ message: 'Tournoi lance' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

// ===== Enregistrer le resultat d'un match de tournoi (admin) =====
router.post('/:id/matches/:matchId/result', authenticateToken, requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { score1, score2 } = req.body;

        if (score1 === score2) {
            return res.status(400).json({ error: 'Pas de match nul possible' });
        }

        const [tournaments] = await conn.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
        if (tournaments.length === 0) {
            return res.status(404).json({ error: 'Tournoi introuvable' });
        }
        const t = tournaments[0];

        if (t.status !== 'in_progress') {
            return res.status(400).json({ error: 'Le tournoi n\'est pas en cours' });
        }

        const [tmRows] = await conn.query(
            'SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?',
            [req.params.matchId, t.id]
        );
        if (tmRows.length === 0) {
            return res.status(404).json({ error: 'Match de tournoi introuvable' });
        }
        const tm = tmRows[0];

        if (tm.winner_participant_id) {
            return res.status(400).json({ error: 'Match deja joue' });
        }
        if (!tm.participant1_id || !tm.participant2_id) {
            return res.status(400).json({ error: 'Les deux participants ne sont pas encore determines' });
        }

        // Get season config
        const [seasonRows] = await conn.query('SELECT * FROM seasons WHERE id = ?', [t.season_id]);
        const s = seasonRows[0];

        const p1Won = score1 > score2;
        const winnerId = p1Won ? tm.participant1_id : tm.participant2_id;

        // Get participant details
        const [part1Rows] = await conn.query('SELECT * FROM tournament_participants WHERE id = ?', [tm.participant1_id]);
        const [part2Rows] = await conn.query('SELECT * FROM tournament_participants WHERE id = ?', [tm.participant2_id]);
        const part1 = part1Rows[0];
        const part2 = part2Rows[0];

        let recordedMatchId = null;

        if (t.tournament_type === 'simple') {
            // Record as a 1v1 match with ELO
            const r1 = await fetchOrCreateRating(conn, part1.player_id, s.id);
            const r2 = await fetchOrCreateRating(conn, part2.player_id, s.id);

            const eloChanges = calculate1v1EloChange(
                r1.elo_1v1, r2.elo_1v1,
                score1, score2,
                {
                    base_k_factor: s.base_k_factor,
                    rank_multiplier: s.rank_multiplier,
                    score_multiplier: s.score_multiplier,
                    loss_multiplier: s.loss_multiplier,
                    win_streak_multiplier: s.win_streak_multiplier,
                    loss_streak_multiplier: s.loss_streak_multiplier,
                    winrate_multiplier: s.winrate_multiplier
                },
                undefined, undefined,
                r1.wins_1v1, r1.losses_1v1,
                r2.wins_1v1, r2.losses_1v1
            );

            const [matchResult] = await conn.query(
                `INSERT INTO matches (season_id, match_type, team1_attack, team1_defense, score_team1,
                 team2_attack, team2_defense, score_team2,
                 elo_change_t1_attack, elo_change_t1_defense, elo_change_t2_attack, elo_change_t2_defense,
                 elo_change_duo_t1, elo_change_duo_t2, elo_change_1v1_t1, elo_change_1v1_t2, recorded_by)
                 VALUES (?, '1v1', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?)`,
                [s.id,
                 part1.player_id, part1.player_id, score1,
                 part2.player_id, part2.player_id, score2,
                 eloChanges.elo_change_1v1_t1, eloChanges.elo_change_1v1_t2,
                 req.user.id]
            );
            recordedMatchId = matchResult.insertId;

            // Update player ratings
            await conn.query(
                `UPDATE player_ratings SET
                    elo_1v1 = GREATEST(0, elo_1v1 + ?),
                    wins_1v1 = wins_1v1 + ?, losses_1v1 = losses_1v1 + ?
                 WHERE player_id = ? AND season_id = ?`,
                [eloChanges.elo_change_1v1_t1, p1Won ? 1 : 0, p1Won ? 0 : 1, part1.player_id, s.id]
            );
            await conn.query(
                `UPDATE player_ratings SET
                    elo_1v1 = GREATEST(0, elo_1v1 + ?),
                    wins_1v1 = wins_1v1 + ?, losses_1v1 = losses_1v1 + ?
                 WHERE player_id = ? AND season_id = ?`,
                [eloChanges.elo_change_1v1_t2, !p1Won ? 1 : 0, !p1Won ? 0 : 1, part2.player_id, s.id]
            );

            // ELO history
            for (const pid of [part1.player_id, part2.player_id]) {
                const [r] = await conn.query('SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?', [pid, s.id]);
                await conn.query(
                    'INSERT INTO elo_history (player_id, season_id, match_id, elo_attack, elo_defense, elo_duo, elo_1v1) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [pid, s.id, recordedMatchId, r[0].elo_attack, r[0].elo_defense, r[0].elo_duo, r[0].elo_1v1]
                );
            }
        } else {
            // Double: record as a duo match with ELO
            const [duo1] = await conn.query('SELECT * FROM duos WHERE id = ?', [part1.duo_id]);
            const [duo2] = await conn.query('SELECT * FROM duos WHERE id = ?', [part2.duo_id]);
            const d1 = duo1[0];
            const d2 = duo2[0];

            const ratings = {
                t1_attack: await fetchOrCreateRating(conn, d1.player1_id, s.id),
                t1_defense: await fetchOrCreateRating(conn, d1.player2_id, s.id),
                t2_attack: await fetchOrCreateRating(conn, d2.player1_id, s.id),
                t2_defense: await fetchOrCreateRating(conn, d2.player2_id, s.id),
            };

            const seasonConfig = {
                base_k_factor: s.base_k_factor,
                rank_multiplier: s.rank_multiplier,
                score_multiplier: s.score_multiplier,
                duo_rank_multiplier: s.duo_rank_multiplier,
                mate_rank_multiplier: s.mate_rank_multiplier,
                loss_multiplier: s.loss_multiplier,
                win_streak_multiplier: s.win_streak_multiplier,
                loss_streak_multiplier: s.loss_streak_multiplier,
                winrate_multiplier: s.winrate_multiplier
            };

            const eloChanges = calculateMatchElo({ score_team1: score1, score_team2: score2 }, ratings, seasonConfig);
            const duoEloChanges = calculateDuoEloChange(
                ratings.t1_attack.elo_duo, ratings.t1_defense.elo_duo,
                ratings.t2_attack.elo_duo, ratings.t2_defense.elo_duo,
                score1, score2, seasonConfig,
                0, 0,
                ratings.t1_attack.wins_duo, ratings.t1_attack.losses_duo,
                ratings.t2_attack.wins_duo, ratings.t2_attack.losses_duo
            );

            const [matchResult] = await conn.query(
                `INSERT INTO matches (season_id, match_type, team1_attack, team1_defense, score_team1,
                 team2_attack, team2_defense, score_team2,
                 elo_change_t1_attack, elo_change_t1_defense, elo_change_t2_attack, elo_change_t2_defense,
                 elo_change_duo_t1, elo_change_duo_t2, elo_change_1v1_t1, elo_change_1v1_t2, recorded_by)
                 VALUES (?, 'duo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
                [s.id,
                 d1.player1_id, d1.player2_id, score1,
                 d2.player1_id, d2.player2_id, score2,
                 eloChanges.elo_change_t1_attack, eloChanges.elo_change_t1_defense,
                 eloChanges.elo_change_t2_attack, eloChanges.elo_change_t2_defense,
                 duoEloChanges.elo_change_duo_t1, duoEloChanges.elo_change_duo_t2,
                 req.user.id]
            );
            recordedMatchId = matchResult.insertId;

            const team1Wins = score1 > score2;
            const playerIds = [d1.player1_id, d1.player2_id, d2.player1_id, d2.player2_id];

            const updateRating = async (playerId, eloAttackChange, eloDefenseChange, eloDuoChange, isAttacker, won) => {
                const field_wins = isAttacker ? (won ? 'wins_attack' : 'losses_attack') : (won ? 'wins_defense' : 'losses_defense');
                let query = `UPDATE player_ratings SET
                    elo_attack = GREATEST(0, elo_attack + ?),
                    elo_defense = GREATEST(0, elo_defense + ?),
                    elo_duo = GREATEST(0, elo_duo + ?),
                    ${field_wins} = ${field_wins} + 1,
                    ${won ? 'wins_duo' : 'losses_duo'} = ${won ? 'wins_duo' : 'losses_duo'} + 1
                    WHERE player_id = ? AND season_id = ?`;
                await conn.query(query, [eloAttackChange, eloDefenseChange, eloDuoChange, playerId, s.id]);
            };

            await updateRating(d1.player1_id, eloChanges.elo_change_t1_attack, 0, duoEloChanges.elo_change_duo_t1, true, team1Wins);
            await updateRating(d1.player2_id, 0, eloChanges.elo_change_t1_defense, duoEloChanges.elo_change_duo_t1, false, team1Wins);
            await updateRating(d2.player1_id, eloChanges.elo_change_t2_attack, 0, duoEloChanges.elo_change_duo_t2, true, !team1Wins);
            await updateRating(d2.player2_id, 0, eloChanges.elo_change_t2_defense, duoEloChanges.elo_change_duo_t2, false, !team1Wins);

            for (const pid of playerIds) {
                const [r] = await conn.query('SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?', [pid, s.id]);
                await conn.query(
                    'INSERT INTO elo_history (player_id, season_id, match_id, elo_attack, elo_defense, elo_duo, elo_1v1) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [pid, s.id, recordedMatchId, r[0].elo_attack, r[0].elo_defense, r[0].elo_duo, r[0].elo_1v1]
                );
            }
        }

        // Update tournament match
        await conn.query(
            'UPDATE tournament_matches SET winner_participant_id = ?, match_id = ? WHERE id = ?',
            [winnerId, recordedMatchId, tm.id]
        );

        // Advance winner to next round
        const totalRounds = getTotalRounds(nextPowerOf2(
            (await conn.query('SELECT COUNT(*) as c FROM tournament_participants WHERE tournament_id = ?', [t.id]))[0][0].c
        ));

        if (tm.round < totalRounds) {
            const nextRound = tm.round + 1;
            const nextPos = Math.floor(tm.position / 2);
            const field = tm.position % 2 === 0 ? 'participant1_id' : 'participant2_id';

            await conn.query(
                `UPDATE tournament_matches SET ${field} = ? WHERE tournament_id = ? AND round = ? AND position = ?`,
                [winnerId, t.id, nextRound, nextPos]
            );

            // Check if the next match is now a bye (only one participant and the other slot won't be filled)
            // This doesn't apply in normal flow since byes are only in round 1
        } else {
            // This was the final - tournament is complete
            await conn.query(
                'UPDATE tournaments SET status = ?, completed_at = NOW() WHERE id = ?',
                ['completed', t.id]
            );
        }

        await conn.commit();
        res.json({ message: 'Resultat enregistre', match_id: recordedMatchId });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

// ===== Annuler un tournoi (admin) =====
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [tournaments] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
        if (tournaments.length === 0) {
            return res.status(404).json({ error: 'Tournoi introuvable' });
        }

        await pool.query('UPDATE tournaments SET status = ? WHERE id = ?', ['cancelled', req.params.id]);
        res.json({ message: 'Tournoi annule' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
