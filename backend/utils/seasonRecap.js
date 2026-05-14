// ============================================
// Generation des recaps saison (Spotify-Wrapped)
// ============================================
// Fournit deux jeux de donnees :
//   - recap global (visible par tous) : nombre total de matchs joues + top 3 de chaque classement
//   - recap par joueur : stats personnelles + nemesis / victime favorite, etc.
// Le recap est genere une seule fois lors du end-of-season et stocke en JSON.

// Sous-requete reutilisee : tous les player_id ayant joue un match non-annule de la saison.
const PARTICIPANTS_SUBQUERY = `
    SELECT team1_attack AS pid FROM matches WHERE season_id = ? AND is_cancelled = 0
    UNION
    SELECT team1_defense FROM matches WHERE season_id = ? AND is_cancelled = 0
    UNION
    SELECT team2_attack FROM matches WHERE season_id = ? AND is_cancelled = 0
    UNION
    SELECT team2_defense FROM matches WHERE season_id = ? AND is_cancelled = 0
`;

async function generatePlayerRecap(conn, seasonId, playerId) {
    const [matches] = await conn.query(
        `SELECT id, match_type, team1_attack, team1_defense, team2_attack, team2_defense,
                score_team1, score_team2,
                elo_change_t1_attack, elo_change_t1_defense,
                elo_change_t2_attack, elo_change_t2_defense,
                elo_change_duo_t1, elo_change_duo_t2,
                elo_change_1v1_t1, elo_change_1v1_t2,
                played_at
         FROM matches
         WHERE season_id = ? AND is_cancelled = 0
           AND (team1_attack = ? OR team1_defense = ? OR team2_attack = ? OR team2_defense = ?)
         ORDER BY played_at ASC`,
        [seasonId, playerId, playerId, playerId, playerId]
    );

    let wins = 0;
    let losses = 0;
    let bestWinElo = { value: 0, matchId: null };
    let worstLossElo = { value: 0, matchId: null };
    let totalEloDelta = 0;
    let bestStreak = 0;
    let currentStreak = 0;
    const opponentRecord = new Map(); // opponentId -> { wins, losses }
    const teammateRecord = new Map(); // teammateId -> { wins, losses }
    const matchTypeBreakdown = { solo: 0, duo: 0, '1v1': 0 };

    for (const m of matches) {
        matchTypeBreakdown[m.match_type] = (matchTypeBreakdown[m.match_type] || 0) + 1;

        let won;
        let myDelta = 0;
        let teammates = [];
        let opponents = [];

        if (m.match_type === '1v1') {
            const isP1 = m.team1_attack === playerId;
            won = isP1 ? m.score_team1 > m.score_team2 : m.score_team2 > m.score_team1;
            myDelta = isP1 ? m.elo_change_1v1_t1 : m.elo_change_1v1_t2;
            opponents = [isP1 ? m.team2_attack : m.team1_attack];
        } else {
            const onTeam1 = m.team1_attack === playerId || m.team1_defense === playerId;
            const isAttacker = m.team1_attack === playerId || m.team2_attack === playerId;
            won = onTeam1 ? m.score_team1 > m.score_team2 : m.score_team2 > m.score_team1;

            const roleDelta = isAttacker
                ? (onTeam1 ? m.elo_change_t1_attack : m.elo_change_t2_attack)
                : (onTeam1 ? m.elo_change_t1_defense : m.elo_change_t2_defense);
            const duoDelta = m.match_type === 'duo'
                ? (onTeam1 ? m.elo_change_duo_t1 : m.elo_change_duo_t2)
                : 0;
            myDelta = roleDelta + duoDelta;

            if (onTeam1) {
                teammates = [isAttacker ? m.team1_defense : m.team1_attack];
                opponents = [m.team2_attack, m.team2_defense];
            } else {
                teammates = [isAttacker ? m.team2_defense : m.team2_attack];
                opponents = [m.team1_attack, m.team1_defense];
            }
        }

        totalEloDelta += myDelta;

        if (won) {
            wins++;
            currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
            if (myDelta > bestWinElo.value) {
                bestWinElo = { value: myDelta, matchId: m.id };
            }
        } else {
            losses++;
            currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
            if (myDelta < worstLossElo.value) {
                worstLossElo = { value: myDelta, matchId: m.id };
            }
        }
        if (Math.abs(currentStreak) > Math.abs(bestStreak)) {
            bestStreak = currentStreak;
        }

        function bumpRecord(map, id) {
            if (!id) return;
            const rec = map.get(id) || { wins: 0, losses: 0 };
            if (won) rec.wins++; else rec.losses++;
            map.set(id, rec);
        }
        opponents.forEach((oppId) => bumpRecord(opponentRecord, oppId));
        teammates.forEach((tmId) => bumpRecord(teammateRecord, tmId));
    }

    const opponentIds = [...opponentRecord.keys(), ...teammateRecord.keys()];
    const idToName = new Map();
    if (opponentIds.length > 0) {
        const [people] = await conn.query(
            'SELECT id, display_name, profile_photo FROM players WHERE id IN (?)',
            [opponentIds]
        );
        for (const p of people) idToName.set(p.id, { name: p.display_name, photo: p.profile_photo });
    }

    function pickTop(map, comparator) {
        let bestId = null;
        let bestRec = null;
        for (const [id, rec] of map.entries()) {
            if (!bestRec || comparator(rec, bestRec) > 0) {
                bestId = id;
                bestRec = rec;
            }
        }
        if (!bestId) return null;
        const meta = idToName.get(bestId) || { name: 'Inconnu', photo: null };
        return { player_id: bestId, ...meta, ...bestRec };
    }

    const mostBeaten = pickTop(opponentRecord, (a, b) => a.wins - b.wins);
    const nemesis = pickTop(opponentRecord, (a, b) => a.losses - b.losses);
    const bestTeammate = pickTop(teammateRecord, (a, b) => a.wins - b.wins);

    const [ratingRows] = await conn.query(
        'SELECT * FROM player_ratings WHERE player_id = ? AND season_id = ?',
        [playerId, seasonId]
    );
    const ratings = ratingRows[0] || null;

    return {
        season_id: seasonId,
        player_id: playerId,
        total_matches: matches.length,
        wins,
        losses,
        winrate: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
        match_type_breakdown: matchTypeBreakdown,
        total_elo_delta: totalEloDelta,
        best_win_elo: bestWinElo.value > 0 ? bestWinElo : null,
        worst_loss_elo: worstLossElo.value < 0 ? worstLossElo : null,
        best_streak: bestStreak,
        most_beaten: mostBeaten && mostBeaten.wins > 0 ? mostBeaten : null,
        nemesis: nemesis && nemesis.losses > 0 ? nemesis : null,
        best_teammate: bestTeammate && bestTeammate.wins > 0 ? bestTeammate : null,
        final_ratings: ratings ? {
            elo_attack: ratings.elo_attack,
            elo_defense: ratings.elo_defense,
            elo_duo: ratings.elo_duo,
            elo_1v1: ratings.elo_1v1,
        } : null,
    };
}

async function generateGlobalRecap(conn, seasonId) {
    const [season] = await conn.query('SELECT * FROM seasons WHERE id = ?', [seasonId]);
    if (season.length === 0) return null;

    const [matchCount] = await conn.query(
        'SELECT COUNT(*) AS total FROM matches WHERE season_id = ? AND is_cancelled = 0',
        [seasonId]
    );

    const [playerCount] = await conn.query(
        `SELECT COUNT(DISTINCT pid) AS total FROM (${PARTICIPANTS_SUBQUERY}) t`,
        [seasonId, seasonId, seasonId, seasonId]
    );

    async function topByColumn(eloCol, winsCol, lossesCol) {
        const [rows] = await conn.query(
            `SELECT pr.player_id, p.display_name, p.profile_photo,
                    pr.${eloCol} AS elo, pr.${winsCol} AS wins, pr.${lossesCol} AS losses
             FROM player_ratings pr
             JOIN players p ON p.id = pr.player_id
             WHERE pr.season_id = ?
             ORDER BY pr.${eloCol} DESC, p.display_name ASC
             LIMIT 3`,
            [seasonId]
        );
        return rows;
    }

    const topAttack = await topByColumn('elo_attack', 'wins_attack', 'losses_attack');
    const topDefense = await topByColumn('elo_defense', 'wins_defense', 'losses_defense');
    const top1v1 = await topByColumn('elo_1v1', 'wins_1v1', 'losses_1v1');
    const topDuo = await topByColumn('elo_duo', 'wins_duo', 'losses_duo');

    // Top solo: somme attaque + defense (meme calcul que le classement solo)
    const [topSolo] = await conn.query(
        `SELECT pr.player_id, p.display_name, p.profile_photo,
                (pr.elo_attack + pr.elo_defense) AS elo,
                (pr.wins_attack + pr.wins_defense) AS wins,
                (pr.losses_attack + pr.losses_defense) AS losses
         FROM player_ratings pr
         JOIN players p ON p.id = pr.player_id
         WHERE pr.season_id = ?
         ORDER BY (pr.elo_attack + pr.elo_defense) DESC, p.display_name ASC
         LIMIT 3`,
        [seasonId]
    );

    const [topGlobal] = await conn.query(
        `SELECT p.id AS player_id, p.display_name, p.profile_photo,
                (pr.elo_attack + pr.elo_defense + pr.elo_1v1 +
                 CASE WHEN EXISTS (
                    SELECT 1 FROM duos d WHERE d.season_id = pr.season_id
                      AND (d.player1_id = pr.player_id OR d.player2_id = pr.player_id)
                 ) THEN pr.elo_duo ELSE 1200 END
                ) AS total_elo
         FROM player_ratings pr
         JOIN players p ON p.id = pr.player_id
         WHERE pr.season_id = ?
         ORDER BY total_elo DESC, p.display_name ASC
         LIMIT 3`,
        [seasonId]
    );

    return {
        season_id: seasonId,
        season_name: season[0].name,
        start_date: season[0].start_date,
        end_date: season[0].end_date,
        total_matches: matchCount[0].total,
        active_players: playerCount[0].total,
        top_global: topGlobal,
        top_solo: topSolo,
        top_attack: topAttack,
        top_defense: topDefense,
        top_1v1: top1v1,
        top_duo: topDuo,
    };
}

async function generateRecapsForSeason(conn, seasonId) {
    const globalData = await generateGlobalRecap(conn, seasonId);
    if (globalData) {
        await conn.query(
            `INSERT INTO season_recaps (season_id, data) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), generated_at = CURRENT_TIMESTAMP`,
            [seasonId, JSON.stringify(globalData)]
        );
    }

    const [participants] = await conn.query(
        `SELECT DISTINCT pid FROM (${PARTICIPANTS_SUBQUERY}) t`,
        [seasonId, seasonId, seasonId, seasonId]
    );

    for (const row of participants) {
        const playerId = row.pid;
        if (!playerId) continue;
        const data = await generatePlayerRecap(conn, seasonId, playerId);
        await conn.query(
            `INSERT INTO player_season_recaps (player_id, season_id, data) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), generated_at = CURRENT_TIMESTAMP`,
            [playerId, seasonId, JSON.stringify(data)]
        );
    }

    return { generated_count: participants.length };
}

module.exports = {
    generatePlayerRecap,
    generateGlobalRecap,
    generateRecapsForSeason,
};
