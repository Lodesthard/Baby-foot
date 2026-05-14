const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generateRecapsForSeason } = require('../utils/seasonRecap');

const router = express.Router();

function parseRecapData(raw) {
    if (raw && typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

// Wrapper async pour eviter de repeter try/catch dans chaque route.
function asyncRoute(handler) {
    return (req, res) => {
        Promise.resolve(handler(req, res)).catch((err) => {
            console.error(err);
            res.status(500).json({ error: 'Erreur serveur' });
        });
    };
}

function mapPersonalRow(row) {
    return {
        season_id: row.season_id,
        season_name: row.season_name,
        end_date: row.end_date,
        viewed_at: row.viewed_at,
        generated_at: row.generated_at,
        data: parseRecapData(row.data),
    };
}

// Liste des saisons ayant un recap global disponible
router.get('/seasons', authenticateToken, asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT sr.season_id, s.name, s.start_date, s.end_date, sr.generated_at
         FROM season_recaps sr
         JOIN seasons s ON s.id = sr.season_id
         ORDER BY s.end_date DESC, s.id DESC`
    );
    res.json(rows);
}));

// Recap global d une saison (consultable par tous).
// Lazy migration : si le JSON stocke est anterieur a une evolution de schema
// (ex: ajout de top_solo), on regenere a la volee avant de servir.
router.get('/seasons/:id', authenticateToken, asyncRoute(async (req, res) => {
    const seasonId = parseInt(req.params.id);
    const [rows] = await pool.query(
        'SELECT data, generated_at FROM season_recaps WHERE season_id = ?',
        [seasonId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Recap introuvable' });

    let data = parseRecapData(rows[0].data);
    let generatedAt = rows[0].generated_at;

    // Detection de schema obsolete : top_solo absent.
    const stale = !data || !Array.isArray(data.top_solo);
    if (stale) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await generateRecapsForSeason(conn, seasonId);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            console.error('Recap regen failed', err);
        } finally {
            conn.release();
        }
        const [fresh] = await pool.query(
            'SELECT data, generated_at FROM season_recaps WHERE season_id = ?',
            [seasonId]
        );
        if (fresh.length > 0) {
            data = parseRecapData(fresh[0].data);
            generatedAt = fresh[0].generated_at;
        }
    }

    res.json({ data, generated_at: generatedAt });
}));

// Recap perso de la saison terminee la plus recente, si pas encore vu
router.get('/me/pending', authenticateToken, asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT psr.season_id, psr.data, psr.generated_at, s.name AS season_name, s.end_date
         FROM player_season_recaps psr
         JOIN seasons s ON s.id = psr.season_id
         WHERE psr.player_id = ? AND psr.viewed_at IS NULL
         ORDER BY psr.generated_at DESC
         LIMIT 1`,
        [req.user.id]
    );
    if (rows.length === 0) return res.json(null);
    res.json(mapPersonalRow(rows[0]));
}));

// Tous les recaps perso (pour reconsultation depuis profil)
router.get('/me', authenticateToken, asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT psr.season_id, psr.data, psr.viewed_at, psr.generated_at, s.name AS season_name, s.end_date
         FROM player_season_recaps psr
         JOIN seasons s ON s.id = psr.season_id
         WHERE psr.player_id = ?
         ORDER BY s.end_date DESC, s.id DESC`,
        [req.user.id]
    );
    res.json(rows.map(mapPersonalRow));
}));

// Marquer un recap perso comme vu
router.post('/me/:seasonId/seen', authenticateToken, asyncRoute(async (req, res) => {
    await pool.query(
        `UPDATE player_season_recaps SET viewed_at = CURRENT_TIMESTAMP
         WHERE player_id = ? AND season_id = ? AND viewed_at IS NULL`,
        [req.user.id, req.params.seasonId]
    );
    res.json({ message: 'Recap marque comme vu' });
}));

// Regeneration manuelle (admin) - utile en cas de correction post-saison
router.post('/admin/regenerate/:seasonId', authenticateToken, requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await generateRecapsForSeason(conn, parseInt(req.params.seasonId));
        await conn.commit();
        res.json({ message: 'Recaps regeneres', ...result });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

module.exports = router;
