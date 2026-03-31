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

function getTierGapMultiplier(tierA, tierB, multiplierValue) {
    const multiplier = getParsedMultiplier(multiplierValue, 1);
    const tierGap = Math.abs(tierA - tierB);
    return 1 + tierGap * (multiplier - 1) / 8;
}

function getScoreBonus(scoreWinner, scoreLoser, scoreMultiplierValue) {
    const scoreMultiplier = getParsedMultiplier(scoreMultiplierValue, 0);
    return 1 + (scoreWinner - scoreLoser) * scoreMultiplier;
}

function calculateRoleDelta(playerElo, opponentElo, ownTeamCumulativeElo, opponentTeamCumulativeElo, didWin, scoreWinner, scoreLoser, seasonConfig) {
    const baseKFactor = getParsedMultiplier(seasonConfig.base_k_factor, 32);
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

    const baseDelta = didWin
        ? baseKFactor * (1 - expectedScore)
        : baseKFactor * expectedScore;

    const totalDelta = Math.round(baseDelta * directOpponentBonus * cumulativeTeamsBonus * scoreBonus);
    return didWin ? totalDelta : -totalDelta;
}

function calculateMatchElo(match, ratings, seasonConfig) {
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
            seasonConfig
        ),
        elo_change_t2_attack: calculateRoleDelta(
            t2a.elo_attack,
            t1d.elo_defense,
            team2CumulativeElo,
            team1CumulativeElo,
            !team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig
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
            seasonConfig
        ),
        elo_change_t2_defense: calculateRoleDelta(
            t2d.elo_defense,
            t1a.elo_attack,
            team2CumulativeElo,
            team1CumulativeElo,
            !team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig
        ),
    };
}

function calculateDuoEloDelta(teamDuoElo, opponentDuoElo, didWin, scoreWinner, scoreLoser, seasonConfig) {
    const baseKFactor = getParsedMultiplier(seasonConfig.base_k_factor, 32);
    const expectedScore = getExpectedScore(teamDuoElo, opponentDuoElo);
    const duoRankBonus = getTierGapMultiplier(
        getRankTier(teamDuoElo),
        getRankTier(opponentDuoElo),
        seasonConfig.duo_rank_multiplier
    );
    const scoreBonus = getScoreBonus(scoreWinner, scoreLoser, seasonConfig.score_multiplier);

    const baseDelta = didWin
        ? baseKFactor * (1 - expectedScore)
        : baseKFactor * expectedScore;

    const totalDelta = Math.round(baseDelta * duoRankBonus * scoreBonus);
    return didWin ? totalDelta : -totalDelta;
}

function calculateDuoEloChange(t1AttackDuoElo, t1DefenseDuoElo, t2AttackDuoElo, t2DefenseDuoElo, scoreT1, scoreT2, seasonConfig) {
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
            seasonConfig
        ),
        elo_change_duo_t2: calculateDuoEloDelta(
            team2DuoElo,
            team1DuoElo,
            !team1Wins,
            scoreWinner,
            scoreLoser,
            seasonConfig
        ),
    };
}

function calculate1v1EloChange(player1Elo, player2Elo, scoreP1, scoreP2, seasonConfig) {
    const baseKFactor = getParsedMultiplier(seasonConfig.base_k_factor, 32);
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

    const baseDeltaP1 = p1Wins
        ? baseKFactor * (1 - expectedP1)
        : baseKFactor * expectedP1;

    const totalP1 = Math.round(baseDeltaP1 * rankBonus * scoreBonus);

    const expectedP2 = getExpectedScore(player2Elo, player1Elo);
    const baseDeltaP2 = !p1Wins
        ? baseKFactor * (1 - expectedP2)
        : baseKFactor * expectedP2;

    const totalP2 = Math.round(baseDeltaP2 * rankBonus * scoreBonus);

    return {
        elo_change_1v1_t1: p1Wins ? totalP1 : -totalP1,
        elo_change_1v1_t2: !p1Wins ? totalP2 : -totalP2,
    };
}

module.exports = { calculateMatchElo, calculateDuoEloChange, calculate1v1EloChange, getRank, RANKS };
