// ============================================
// Systeme ELO Baby-Foot Ranked
// ============================================

const RANKS = [
    { name: 'Iron',         min: 0,    tier: 1 },
    { name: 'Bronze',       min: 400,  tier: 2 },
    { name: 'Silver',       min: 800,  tier: 3 },
    { name: 'Gold',         min: 1200, tier: 4 },
    { name: 'Platinum',     min: 1600, tier: 5 },
    { name: 'Diamond',      min: 2000, tier: 6 },
    { name: 'Master',       min: 2400, tier: 7 },
    { name: 'Grandmaster',  min: 2700, tier: 8 },
    { name: 'Challenger',   min: 3000, tier: 9 },
];

function getRank(elo) {
    let rank = RANKS[0];
    for (const r of RANKS) {
        if (elo >= r.min) rank = r;
    }

    // Divisions IV-I pour les rangs < Master
    let division = '';
    if (rank.tier <= 6) {
        const inRank = elo - rank.min;
        const divSize = (RANKS[RANKS.indexOf(rank) + 1]?.min || rank.min + 400) - rank.min;
        const divIndex = Math.min(3, Math.floor(inRank / (divSize / 4)));
        division = ' ' + ['IV', 'III', 'II', 'I'][divIndex];
    }

    return { name: rank.name + division, tier: rank.tier, fullRank: rank };
}

function getRankTier(elo) {
    return getRank(elo).tier;
}

function getCumulativeRankTier(cumulativeElo) {
    let tier = 1;
    for (const r of RANKS) {
        if (cumulativeElo >= r.min * 2) tier = r.tier;
    }
    return tier;
}

function getExpectedScore(playerElo, opponentElo) {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function getParsedMultiplier(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getLossMultiplier(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function getStreakStepMultiplier(value, fallback = 0.05) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getTierGapMultiplier(tierA, tierB, multiplierValue) {
    const multiplier = getParsedMultiplier(multiplierValue, 1);
    const tierGap = Math.abs(tierA - tierB);
    return 1 + tierGap * (multiplier - 1) / 8;
}

function getScoreBonus(scoreWinner, scoreLoser, scoreMultiplierValue) {
    const scoreMultiplier = getParsedMultiplier(scoreMultiplierValue, 0);
    return 1 + (scoreWinner - scoreLoser) * scoreMultiplier;
}

// Streak coefficient: longer streaks give bigger bonus/penalty.
// The step comes from season config and is capped at 5 stacks.
function getStreakMultiplier(streak, stepMultiplierValue) {
    const s = Math.min(Math.abs(streak), 5);
    return 1 + s * getStreakStepMultiplier(stepMultiplierValue);
}

// Winrate coefficient: scales ELO change based on deviation from 50% WR.
// winrateMultiplier of 0 = disabled, 1 = moderate effect, 2 = strong effect.
// At 50% WR the multiplier is always 1. At 75% WR with multiplier 1 -> 1.25.
function getWinrateMultiplier(wins, losses, winrateMultiplierValue) {
    const mult = getParsedMultiplier(winrateMultiplierValue, 0);
    if (mult === 0) return 1;
    const total = (wins || 0) + (losses || 0);
    if (total < 5) return 1; // Need at least 5 games for winrate to matter
    const winrate = (wins || 0) / total;
    return 1 + (winrate - 0.5) * mult;
}

function calculateRoleDelta(playerElo, opponentElo, ownTeamCumulativeElo, opponentTeamCumulativeElo, didWin, scoreWinner, scoreLoser, seasonConfig, streakCount, playerWins, playerLosses) {
    const baseKFactor = getParsedMultiplier(seasonConfig.base_k_factor, 32);
    const lossMultiplier = getLossMultiplier(seasonConfig.loss_multiplier);
    const expectedScore = getExpectedScore(playerElo, opponentElo);
    const directOpponentBonus = getTierGapMultiplier(
        getRankTier(playerElo),
        getRankTier(opponentElo),
        seasonConfig.rank_multiplier
    );
    const cumulativeTeamsBonus = getTierGapMultiplier(
        getCumulativeRankTier(ownTeamCumulativeElo),
        getCumulativeRankTier(opponentTeamCumulativeElo),
        seasonConfig.duo_rank_multiplier
    );
    const scoreBonus = getScoreBonus(scoreWinner, scoreLoser, seasonConfig.score_multiplier);
    const streakMultiplier = getStreakMultiplier(
        streakCount || 0,
        didWin ? seasonConfig.win_streak_multiplier : seasonConfig.loss_streak_multiplier
    );
    const winrateMultiplier = getWinrateMultiplier(playerWins, playerLosses, seasonConfig.winrate_multiplier);

    const baseDelta = didWin
        ? baseKFactor * (1 - expectedScore)
        : baseKFactor * expectedScore;

    const totalDelta = Math.round(
        baseDelta
        * directOpponentBonus
        * cumulativeTeamsBonus
        * scoreBonus
        * streakMultiplier
        * winrateMultiplier
        * (didWin ? 1 : lossMultiplier)
    );
    return didWin ? totalDelta : -totalDelta;
}

function calculateMatchElo(match, ratings, seasonConfig, streaks) {
    const { score_team1, score_team2 } = match;
    const team1Wins = score_team1 > score_team2;
    const scoreWinner = team1Wins ? score_team1 : score_team2;
    const scoreLoser = team1Wins ? score_team2 : score_team1;

    const t1a = ratings.t1_attack;
    const t1d = ratings.t1_defense;
    const t2a = ratings.t2_attack;
    const t2d = ratings.t2_defense;

    const team1CumulativeElo = t1a.elo_attack + t1d.elo_defense;
    const team2CumulativeElo = t2a.elo_attack + t2d.elo_defense;

    // Get streak counts for each player
    const s = streaks || {};

    return {
        // Attaquants : l'opposition directe se fait contre le defenseur adverse.
        elo_change_t1_attack: calculateRoleDelta(
            t1a.elo_attack,
            t2d.elo_defense,
            team1CumulativeElo,
            team2CumulativeElo,
            team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig,
            team1Wins ? (s.t1_attack_win || 0) : (s.t1_attack_loss || 0),
            t1a.wins_attack, t1a.losses_attack
        ),
        elo_change_t2_attack: calculateRoleDelta(
            t2a.elo_attack,
            t1d.elo_defense,
            team2CumulativeElo,
            team1CumulativeElo,
            !team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig,
            !team1Wins ? (s.t2_attack_win || 0) : (s.t2_attack_loss || 0),
            t2a.wins_attack, t2a.losses_attack
        ),

        // Defenseurs : l'opposition directe se fait contre l'attaquant adverse.
        elo_change_t1_defense: calculateRoleDelta(
            t1d.elo_defense,
            t2a.elo_attack,
            team1CumulativeElo,
            team2CumulativeElo,
            team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig,
            team1Wins ? (s.t1_defense_win || 0) : (s.t1_defense_loss || 0),
            t1d.wins_defense, t1d.losses_defense
        ),
        elo_change_t2_defense: calculateRoleDelta(
            t2d.elo_defense,
            t1a.elo_attack,
            team2CumulativeElo,
            team1CumulativeElo,
            !team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig,
            !team1Wins ? (s.t2_defense_win || 0) : (s.t2_defense_loss || 0),
            t2d.wins_defense, t2d.losses_defense
        ),
    };
}

function calculateDuoEloDelta(teamDuoElo, opponentDuoElo, didWin, scoreWinner, scoreLoser, seasonConfig, streakCount, teamDuoWins, teamDuoLosses) {
    const baseKFactor = getParsedMultiplier(seasonConfig.base_k_factor, 32);
    const lossMultiplier = getLossMultiplier(seasonConfig.loss_multiplier);
    const expectedScore = getExpectedScore(teamDuoElo, opponentDuoElo);
    const duoRankBonus = getTierGapMultiplier(
        getRankTier(teamDuoElo),
        getRankTier(opponentDuoElo),
        seasonConfig.duo_rank_multiplier
    );
    const scoreBonus = getScoreBonus(scoreWinner, scoreLoser, seasonConfig.score_multiplier);
    const streakMultiplier = getStreakMultiplier(
        streakCount || 0,
        didWin ? seasonConfig.win_streak_multiplier : seasonConfig.loss_streak_multiplier
    );

    const baseDelta = didWin
        ? baseKFactor * (1 - expectedScore)
        : baseKFactor * expectedScore;

    const winrateMultiplier = getWinrateMultiplier(teamDuoWins, teamDuoLosses, seasonConfig.winrate_multiplier);

    const totalDelta = Math.round(baseDelta * duoRankBonus * scoreBonus * streakMultiplier * winrateMultiplier * (didWin ? 1 : lossMultiplier));
    return didWin ? totalDelta : -totalDelta;
}

function calculateDuoEloChange(
    t1AttackDuoElo,
    t1DefenseDuoElo,
    t2AttackDuoElo,
    t2DefenseDuoElo,
    scoreT1,
    scoreT2,
    seasonConfig,
    team1Streak = 0,
    team2Streak = 0,
    team1DuoWins = 0,
    team1DuoLosses = 0,
    team2DuoWins = 0,
    team2DuoLosses = 0
) {
    const team1DuoElo = Math.round((t1AttackDuoElo + t1DefenseDuoElo) / 2);
    const team2DuoElo = Math.round((t2AttackDuoElo + t2DefenseDuoElo) / 2);
    const team1Wins = scoreT1 > scoreT2;
    const scoreWinner = team1Wins ? scoreT1 : scoreT2;
    const scoreLoser = team1Wins ? scoreT2 : scoreT1;

    return {
        // En duo, seule la difference de rang entre les deux duos est prise en compte.
        elo_change_duo_t1: calculateDuoEloDelta(
            team1DuoElo,
            team2DuoElo,
            team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig,
            team1Streak,
            team1DuoWins, team1DuoLosses
        ),
        elo_change_duo_t2: calculateDuoEloDelta(
            team2DuoElo,
            team1DuoElo,
            !team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig,
            team2Streak,
            team2DuoWins, team2DuoLosses
        ),
    };
}

function calculate1v1EloChange(player1Elo, player2Elo, scoreP1, scoreP2, seasonConfig, streak1, streak2, p1Wins1v1 = 0, p1Losses1v1 = 0, p2Wins1v1 = 0, p2Losses1v1 = 0) {
    const baseKFactor = getParsedMultiplier(seasonConfig.base_k_factor, 32);
    const lossMultiplier = getLossMultiplier(seasonConfig.loss_multiplier);
    const p1Wins = scoreP1 > scoreP2;
    const scoreWinner = p1Wins ? scoreP1 : scoreP2;
    const scoreLoser = p1Wins ? scoreP2 : scoreP1;

    const expectedP1 = getExpectedScore(player1Elo, player2Elo);
    const rankBonus = getTierGapMultiplier(
        getRankTier(player1Elo),
        getRankTier(player2Elo),
        seasonConfig.rank_multiplier
    );
    const scoreBonus = getScoreBonus(scoreWinner, scoreLoser, seasonConfig.score_multiplier);
    const streak1Mult = getStreakMultiplier(
        streak1 || 0,
        p1Wins ? seasonConfig.win_streak_multiplier : seasonConfig.loss_streak_multiplier
    );
    const streak2Mult = getStreakMultiplier(
        streak2 || 0,
        !p1Wins ? seasonConfig.win_streak_multiplier : seasonConfig.loss_streak_multiplier
    );
    const winrateMult1 = getWinrateMultiplier(p1Wins1v1, p1Losses1v1, seasonConfig.winrate_multiplier);
    const winrateMult2 = getWinrateMultiplier(p2Wins1v1, p2Losses1v1, seasonConfig.winrate_multiplier);

    const baseDeltaP1 = p1Wins
        ? baseKFactor * (1 - expectedP1)
        : baseKFactor * expectedP1;

    const totalP1 = Math.round(baseDeltaP1 * rankBonus * scoreBonus * streak1Mult * winrateMult1 * (p1Wins ? 1 : lossMultiplier));

    const expectedP2 = getExpectedScore(player2Elo, player1Elo);
    const baseDeltaP2 = !p1Wins
        ? baseKFactor * (1 - expectedP2)
        : baseKFactor * expectedP2;

    const totalP2 = Math.round(baseDeltaP2 * rankBonus * scoreBonus * streak2Mult * winrateMult2 * (!p1Wins ? 1 : lossMultiplier));

    return {
        elo_change_1v1_t1: p1Wins ? totalP1 : -totalP1,
        elo_change_1v1_t2: !p1Wins ? totalP2 : -totalP2,
    };
}

module.exports = { calculateMatchElo, calculateDuoEloChange, calculate1v1EloChange, getRank, RANKS, getStreakMultiplier };
