const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generateRecapsForSeason } = require('../utils/seasonRecap');

const router = express.Router();

router.get('/active', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM seasons WHERE is_active = 1');
        res.json(rows[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM seasons ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

function normalizeAlgorithm(value) {
    return value === 'trueskill2' ? 'trueskill2' : 'elo';
}

// Defauts TrueSkill2 calibres pour ~80 pts ELO par match en moyenne,
// avec une variation d environ +/-10 pts par 400 pts de difference d ELO.
// Verifie numeriquement : even=80, gap+400=70, gap-400=90.
const TS_DEFAULTS = {
    ts_mu: 25,
    ts_sigma: 25 / 3,          // 8.333333
    ts_beta: 86 / 3,           // 28.666667 — bruit de performance eleve = updates moins sensibles au gap
    ts_tau: 25 / 300,          // 0.083333
    ts_scale: 61,              // mu -> ELO affiche
    ts_score_multiplier: 0,    // pas de bonus d ecart au score (gain stable ~80)
};

// Accepte un nombre uniquement s il est fini (rejette NaN issu d un parseFloat("")).
function safeNum(value, fallback) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

// Resout les params TrueSkill avec les defauts si non fournis ou invalides.
function withTsDefaults(body) {
    return {
        ts_mu: safeNum(body.ts_mu, TS_DEFAULTS.ts_mu),
        ts_sigma: safeNum(body.ts_sigma, TS_DEFAULTS.ts_sigma),
        ts_beta: safeNum(body.ts_beta, TS_DEFAULTS.ts_beta),
        ts_tau: safeNum(body.ts_tau, TS_DEFAULTS.ts_tau),
        ts_scale: safeNum(body.ts_scale, TS_DEFAULTS.ts_scale),
        ts_score_multiplier: safeNum(body.ts_score_multiplier, TS_DEFAULTS.ts_score_multiplier),
    };
}

// Valeurs ELO partagees entre creation et mise a jour d une saison.
function buildSeasonCoefs(b) {
    return [
        safeNum(b.base_k_factor, 32),
        safeNum(b.rank_multiplier, 1.5),
        safeNum(b.score_multiplier, 0.1),
        safeNum(b.duo_rank_multiplier, 1.3),
        safeNum(b.mate_rank_multiplier, 1.5),
        safeNum(b.loss_multiplier, 1),
        safeNum(b.win_streak_multiplier, 0.05),
        safeNum(b.loss_streak_multiplier, 0.05),
        safeNum(b.winrate_multiplier, 0),
    ];
}

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const b = req.body;
        if (!b.name) {
            return res.status(400).json({ error: 'Nom requis' });
        }
        const ts = withTsDefaults(b);

        const [result] = await pool.query(
            `INSERT INTO seasons (
                name, start_date, base_k_factor, rank_multiplier, score_multiplier,
                duo_rank_multiplier, mate_rank_multiplier, loss_multiplier,
                win_streak_multiplier, loss_streak_multiplier, winrate_multiplier,
                algorithm, ts_mu, ts_sigma, ts_beta, ts_tau, ts_scale, ts_score_multiplier
            ) VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                b.name,
                ...buildSeasonCoefs(b),
                normalizeAlgorithm(b.algorithm),
                ts.ts_mu, ts.ts_sigma, ts.ts_beta, ts.ts_tau, ts.ts_scale, ts.ts_score_multiplier,
            ]
        );

        res.status(201).json({ message: 'Saison creee', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Activation : full carryover ELO + mu/sigma depuis derniere saison non-active.
// Reset compteurs (wins/losses/streaks) pour la nouvelle saison.
// Genere les recaps pour la saison qui se termine.
router.put('/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const newSeasonId = parseInt(req.params.id);

        const [previousActive] = await conn.query(
            'SELECT id FROM seasons WHERE is_active = 1 AND id <> ?',
            [newSeasonId]
        );
        const previousSeasonId = previousActive[0]?.id || null;

        if (previousSeasonId) {
            await conn.query(
                'UPDATE seasons SET is_active = 0, end_date = COALESCE(end_date, CURDATE()) WHERE id = ?',
                [previousSeasonId]
            );
            await generateRecapsForSeason(conn, previousSeasonId);
        }

        await conn.query('UPDATE seasons SET is_active = 0 WHERE id <> ?', [newSeasonId]);
        await conn.query('UPDATE seasons SET is_active = 1 WHERE id = ?', [newSeasonId]);

        await conn.query(
            `INSERT IGNORE INTO player_ratings (player_id, season_id)
             SELECT id, ? FROM players`,
            [newSeasonId]
        );

        if (previousSeasonId) {
            // Carryover: copie ELO + mu/sigma de l ancienne saison vers la nouvelle.
            // Reset compteurs (wins/losses/streaks) au passage.
            await conn.query(
                `UPDATE player_ratings new_pr
                 JOIN player_ratings old_pr
                   ON old_pr.player_id = new_pr.player_id AND old_pr.season_id = ?
                 SET new_pr.elo_attack = old_pr.elo_attack,
                     new_pr.elo_defense = old_pr.elo_defense,
                     new_pr.elo_duo = old_pr.elo_duo,
                     new_pr.elo_1v1 = old_pr.elo_1v1,
                     new_pr.ts_mu_attack = old_pr.ts_mu_attack,
                     new_pr.ts_sigma_attack = old_pr.ts_sigma_attack,
                     new_pr.ts_mu_defense = old_pr.ts_mu_defense,
                     new_pr.ts_sigma_defense = old_pr.ts_sigma_defense,
                     new_pr.ts_mu_duo = old_pr.ts_mu_duo,
                     new_pr.ts_sigma_duo = old_pr.ts_sigma_duo,
                     new_pr.ts_mu_1v1 = old_pr.ts_mu_1v1,
                     new_pr.ts_sigma_1v1 = old_pr.ts_sigma_1v1,
                     new_pr.wins_attack = 0, new_pr.losses_attack = 0,
                     new_pr.wins_defense = 0, new_pr.losses_defense = 0,
                     new_pr.wins_duo = 0, new_pr.losses_duo = 0,
                     new_pr.wins_1v1 = 0, new_pr.losses_1v1 = 0,
                     new_pr.current_win_streak = 0,
                     new_pr.current_loss_streak = 0
                 WHERE new_pr.season_id = ?`,
                [previousSeasonId, newSeasonId]
            );
        }

        await conn.commit();
        res.json({ message: 'Saison activee', previous_season_id: previousSeasonId });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const b = req.body;
        const ts = withTsDefaults(b);

        await pool.query(
            `UPDATE seasons
             SET base_k_factor = ?,
                 rank_multiplier = ?,
                 score_multiplier = ?,
                 duo_rank_multiplier = ?,
                 mate_rank_multiplier = ?,
                 loss_multiplier = ?,
                 win_streak_multiplier = ?,
                 loss_streak_multiplier = ?,
                 winrate_multiplier = ?,
                 algorithm = ?,
                 ts_mu = ?,
                 ts_sigma = ?,
                 ts_beta = ?,
                 ts_tau = ?,
                 ts_scale = ?,
                 ts_score_multiplier = ?,
                 name = ?
             WHERE id = ?`,
            [
                ...buildSeasonCoefs(b),
                normalizeAlgorithm(b.algorithm),
                ts.ts_mu, ts.ts_sigma, ts.ts_beta, ts.ts_tau, ts.ts_scale, ts.ts_score_multiplier,
                b.name,
                req.params.id,
            ]
        );

        res.json({ message: 'Saison mise a jour' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/algorithm', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const algorithm = normalizeAlgorithm(req.body?.algorithm);
        await pool.query('UPDATE seasons SET algorithm = ? WHERE id = ?', [algorithm, req.params.id]);
        res.json({ message: 'Algorithme mis a jour', algorithm });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/end', authenticateToken, requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE seasons SET is_active = 0, end_date = CURDATE() WHERE id = ?', [req.params.id]);
        await generateRecapsForSeason(conn, parseInt(req.params.id));
        await conn.commit();
        res.json({ message: 'Saison terminee' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

module.exports = router;
