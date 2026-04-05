function didPlayerParticipate(match, playerId) {
    return [
        match.team1_attack,
        match.team1_defense,
        match.team2_attack,
        match.team2_defense,
    ].includes(playerId);
}

function didPlayerWinMatch(match, playerId) {
    const isTeam1 = match.team1_attack === playerId || match.team1_defense === playerId;
    const isTeam2 = match.team2_attack === playerId || match.team2_defense === playerId;

    if (!isTeam1 && !isTeam2) {
        return null;
    }

    const team1Won = match.score_team1 > match.score_team2;
    return isTeam1 ? team1Won : !team1Won;
}

function getRelevantStreakValue(rating, didWin) {
    if (!rating) return 0;
    return didWin ? (rating.current_win_streak || 0) : (rating.current_loss_streak || 0);
}

async function recomputeCurrentStreak(connOrPool, seasonId, playerId) {
    const [matches] = await connOrPool.query(
        `SELECT team1_attack, team1_defense, team2_attack, team2_defense, score_team1, score_team2
         FROM matches
         WHERE season_id = ? AND is_cancelled = 0
           AND (
                team1_attack = ? OR team1_defense = ?
             OR team2_attack = ? OR team2_defense = ?
           )
         ORDER BY played_at DESC, id DESC`,
        [seasonId, playerId, playerId, playerId, playerId]
    );

    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const match of matches) {
        if (!didPlayerParticipate(match, playerId)) {
            continue;
        }

        const didWin = didPlayerWinMatch(match, playerId);
        if (didWin === null) {
            continue;
        }

        if (didWin) {
            if (currentLossStreak > 0) break;
            currentWinStreak += 1;
        } else {
            if (currentWinStreak > 0) break;
            currentLossStreak += 1;
        }
    }

    await connOrPool.query(
        `UPDATE player_ratings
         SET current_win_streak = ?, current_loss_streak = ?
         WHERE player_id = ? AND season_id = ?`,
        [currentWinStreak, currentLossStreak, playerId, seasonId]
    );

    return { current_win_streak: currentWinStreak, current_loss_streak: currentLossStreak };
}

async function recomputeCurrentStreaks(connOrPool, seasonId, playerIds) {
    const uniqueIds = [...new Set((playerIds || []).filter(Boolean).map((id) => Number(id)))];
    for (const playerId of uniqueIds) {
        await recomputeCurrentStreak(connOrPool, seasonId, playerId);
    }
}

module.exports = {
    didPlayerParticipate,
    didPlayerWinMatch,
    getRelevantStreakValue,
    recomputeCurrentStreak,
    recomputeCurrentStreaks,
};
