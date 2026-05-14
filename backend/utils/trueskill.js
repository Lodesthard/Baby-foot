// ============================================
// Algorithme TrueSkill2 (simplifie) pour Baby-Foot
// ============================================
// Parametres modifiables par les admins via les coefficients de saison :
//   - ts_mu           (mu initial, defaut 25)
//   - ts_sigma        (sigma initial, defaut 25/3)
//   - ts_beta         (bruit de performance, defaut sigma/2)
//   - ts_tau          (derive dynamique, defaut sigma/300)
//   - ts_scale        (conversion mu -> ELO affiche, defaut 48)
//   - ts_score_multiplier (amplification selon l ecart au score)
// L affichage ELO continue d utiliser les colonnes elo_attack, elo_defense,
// elo_duo et elo_1v1 ; en mode trueskill2 on recalcule mu/sigma et on deduit
// le nouveau ELO affiche = round(mu * scale).

function pdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Approximation Abramowitz & Stegun (7.1.26) de la CDF normale centree reduite
function cdf(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * ax);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return 0.5 * (1.0 + sign * y);
}

function vWin(t) {
    const denom = cdf(t);
    if (denom < 1e-12) return -t; // fallback pour eviter la division par zero
    return pdf(t) / denom;
}

function wWin(t) {
    const v = vWin(t);
    return v * (v + t);
}

function parseNum(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

// Defauts calibres : ~80 pts ELO par match, +/-10 pts par 400 pts d ecart.
function getTsConfig(seasonConfig) {
    return {
        mu: parseNum(seasonConfig?.ts_mu, 25),
        sigma: parseNum(seasonConfig?.ts_sigma, 25 / 3),
        beta: parseNum(seasonConfig?.ts_beta, 86 / 3),
        tau: parseNum(seasonConfig?.ts_tau, 25 / 300),
        scale: parseNum(seasonConfig?.ts_scale, 61),
        scoreMult: parseNum(seasonConfig?.ts_score_multiplier, 0),
    };
}

// Met a jour deux equipes via un update TrueSkill a marge nulle.
// winners / losers : tableaux d objets { mu, sigma } mutes en place.
// Retourne directement les references pour un usage pratique.
function updateTeams(winners, losers, cfg, scoreDiff) {
    const all = [...winners, ...losers];
    const tau2 = cfg.tau * cfg.tau;
    for (const p of all) {
        p.sigma = Math.sqrt(p.sigma * p.sigma + tau2);
    }
    const totalPlayers = all.length;
    const sumSigma2 = all.reduce((sum, p) => sum + p.sigma * p.sigma, 0);
    const c2 = sumSigma2 + totalPlayers * cfg.beta * cfg.beta;
    const c = Math.sqrt(c2);
    const muW = winners.reduce((s, p) => s + p.mu, 0);
    const muL = losers.reduce((s, p) => s + p.mu, 0);
    const t = (muW - muL) / c;

    // Bonus selon l ecart au score : amplifie la confiance de la mise a jour.
    // Cap a 3x pour empecher des mises a jour explosives si scoreMult est mal regle.
    const rawBoost = 1 + Math.max(0, scoreDiff || 0) * cfg.scoreMult;
    const scoreBoost = Math.min(3, Math.max(1, rawBoost));

    const v = vWin(t) * scoreBoost;
    const w = Math.min(1, Math.max(0, wWin(t)));

    const apply = (team, sign) => {
        for (const p of team) {
            const sigma2 = p.sigma * p.sigma;
            const newMu = p.mu + sign * (sigma2 / c) * v;
            const factor = Math.max(0.0001, 1 - (sigma2 / c2) * w);
            const newSigma = Math.sqrt(sigma2 * factor);
            p.mu = newMu;
            p.sigma = newSigma;
        }
    };
    apply(winners, +1);
    apply(losers, -1);
    return { winners, losers };
}

function muFromRating(rating, role, cfg) {
    const col = `ts_mu_${role}`;
    const raw = parseFloat(rating?.[col]);
    // Mu peut legitimement etre proche de 0 ou negatif apres une longue serie
    // de defaites : on ne reinitialise que si la valeur n est pas un nombre.
    return Number.isFinite(raw) ? raw : cfg.mu;
}

function sigmaFromRating(rating, role, cfg) {
    const col = `ts_sigma_${role}`;
    const raw = parseFloat(rating?.[col]);
    // Sigma doit rester strictement positif. Plancher pour empecher les NaN
    // si une valeur corrompue (0/negatif) traine en base.
    return Number.isFinite(raw) && raw > 1e-6 ? raw : cfg.sigma;
}

function eloDelta(oldMu, newMu, cfg) {
    return Math.round((newMu - oldMu) * cfg.scale);
}

// 2v2 solo / duo : chaque role (attack/defense) est traite comme un duel
// 1v1 TrueSkill separe sur la dimension correspondante. Symetrique a la
// logique ELO existante ou attaquants et defenseurs ont leur propre rating.
function calculateMatchTrueskill(match, ratings, seasonConfig) {
    const cfg = getTsConfig(seasonConfig);
    const { score_team1, score_team2 } = match;
    const team1Wins = score_team1 > score_team2;
    const scoreDiff = Math.abs(score_team1 - score_team2);

    const roles = [
        { key: 'attack', t1: ratings.t1_attack, t2: ratings.t2_attack },
        { key: 'defense', t1: ratings.t1_defense, t2: ratings.t2_defense },
    ];

    const result = { ts_new: {} };
    for (const role of roles) {
        const team1 = [{ mu: muFromRating(role.t1, role.key, cfg), sigma: sigmaFromRating(role.t1, role.key, cfg) }];
        const team2 = [{ mu: muFromRating(role.t2, role.key, cfg), sigma: sigmaFromRating(role.t2, role.key, cfg) }];
        const oldMuT1 = team1[0].mu;
        const oldMuT2 = team2[0].mu;

        const winners = team1Wins ? team1 : team2;
        const losers = team1Wins ? team2 : team1;
        updateTeams(winners, losers, cfg, scoreDiff);

        result[`elo_change_t1_${role.key}`] = eloDelta(oldMuT1, team1[0].mu, cfg);
        result[`elo_change_t2_${role.key}`] = eloDelta(oldMuT2, team2[0].mu, cfg);
        result.ts_new[`t1_${role.key}`] = { mu: team1[0].mu, sigma: team1[0].sigma };
        result.ts_new[`t2_${role.key}`] = { mu: team2[0].mu, sigma: team2[0].sigma };
    }
    return result;
}

function calculateDuoTrueskill(ratings, scoreT1, scoreT2, seasonConfig) {
    const cfg = getTsConfig(seasonConfig);
    const team1Wins = scoreT1 > scoreT2;
    const scoreDiff = Math.abs(scoreT1 - scoreT2);

    const makePlayer = (rating) => ({
        mu: muFromRating(rating, 'duo', cfg),
        sigma: sigmaFromRating(rating, 'duo', cfg),
    });
    const t1 = [makePlayer(ratings.t1_attack), makePlayer(ratings.t1_defense)];
    const t2 = [makePlayer(ratings.t2_attack), makePlayer(ratings.t2_defense)];
    const oldMu = { t1a: t1[0].mu, t1d: t1[1].mu, t2a: t2[0].mu, t2d: t2[1].mu };

    const winners = team1Wins ? t1 : t2;
    const losers = team1Wins ? t2 : t1;
    updateTeams(winners, losers, cfg, scoreDiff);

    const d1a = eloDelta(oldMu.t1a, t1[0].mu, cfg);
    const d1d = eloDelta(oldMu.t1d, t1[1].mu, cfg);
    const d2a = eloDelta(oldMu.t2a, t2[0].mu, cfg);
    const d2d = eloDelta(oldMu.t2d, t2[1].mu, cfg);

    return {
        elo_change_duo_t1: Math.round((d1a + d1d) / 2),
        elo_change_duo_t2: Math.round((d2a + d2d) / 2),
        ts_new: {
            t1_attack: { mu: t1[0].mu, sigma: t1[0].sigma },
            t1_defense: { mu: t1[1].mu, sigma: t1[1].sigma },
            t2_attack: { mu: t2[0].mu, sigma: t2[0].sigma },
            t2_defense: { mu: t2[1].mu, sigma: t2[1].sigma },
        },
    };
}

function calculate1v1Trueskill(r1, r2, score1, score2, seasonConfig) {
    const cfg = getTsConfig(seasonConfig);
    const p1Wins = score1 > score2;
    const scoreDiff = Math.abs(score1 - score2);

    const p1 = [{ mu: muFromRating(r1, '1v1', cfg), sigma: sigmaFromRating(r1, '1v1', cfg) }];
    const p2 = [{ mu: muFromRating(r2, '1v1', cfg), sigma: sigmaFromRating(r2, '1v1', cfg) }];
    const oldMu1 = p1[0].mu;
    const oldMu2 = p2[0].mu;

    const winners = p1Wins ? p1 : p2;
    const losers = p1Wins ? p2 : p1;
    updateTeams(winners, losers, cfg, scoreDiff);

    return {
        elo_change_1v1_t1: eloDelta(oldMu1, p1[0].mu, cfg),
        elo_change_1v1_t2: eloDelta(oldMu2, p2[0].mu, cfg),
        ts_new: {
            p1: { mu: p1[0].mu, sigma: p1[0].sigma },
            p2: { mu: p2[0].mu, sigma: p2[0].sigma },
        },
    };
}

module.exports = {
    getTsConfig,
    calculateMatchTrueskill,
    calculateDuoTrueskill,
    calculate1v1Trueskill,
};
