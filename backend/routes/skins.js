const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Wrapper async pour eviter de repeter try/catch dans chaque route.
function asyncRoute(handler) {
    return (req, res) => {
        Promise.resolve(handler(req, res)).catch((err) => {
            console.error(err);
            res.status(500).json({ error: 'Erreur serveur' });
        });
    };
}

const SKIN_COLUMNS = {
    title: { ownership: 'title_id', equipped: 'equipped_title_id' },
    border: { ownership: 'border_id', equipped: 'equipped_border_id' },
};

// Upload bordures dans /frontend/uploads/borders
const borderUploadDir = path.join(__dirname, '..', '..', 'frontend', 'uploads', 'borders');
if (!fs.existsSync(borderUploadDir)) {
    fs.mkdirSync(borderUploadDir, { recursive: true });
}

const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/gif': '.gif',
};

const borderStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, borderUploadDir),
    filename: (req, file, cb) => {
        let ext = path.extname(file.originalname || '').toLowerCase();
        if (!ext && file.mimetype) ext = mimeToExt[file.mimetype.toLowerCase()] || '';
        if (!ext) ext = '.png';
        cb(null, `border_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
});

const borderUpload = multer({
    storage: borderStorage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase();
        if (mime.startsWith('image/')) return cb(null, true);
        cb(new Error('Format non supporte. Utilisez PNG, SVG, WebP, JPG ou GIF.'));
    }
});

// =============== TITRES ===============
router.get('/titles', authenticateToken, asyncRoute(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM skin_titles ORDER BY created_at DESC');
    res.json(rows);
}));

router.post('/titles', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    const label = String(req.body?.label || '').trim();
    const color = req.body?.color ? String(req.body.color).trim() : null;
    if (!label) return res.status(400).json({ error: 'Libelle requis' });
    if (label.length > 80) return res.status(400).json({ error: 'Libelle trop long' });
    const [result] = await pool.query(
        'INSERT INTO skin_titles (label, color, created_by) VALUES (?, ?, ?)',
        [label, color, req.user.id]
    );
    res.status(201).json({ id: result.insertId, label, color });
}));

router.delete('/titles/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM skin_titles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Titre supprime' });
}));

// =============== BORDURES ===============
router.get('/borders', authenticateToken, asyncRoute(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM skin_borders ORDER BY created_at DESC');
    res.json(rows);
}));

router.post('/borders', authenticateToken, requireAdmin, (req, res) => {
    borderUpload.single('image')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Erreur upload' });
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoye' });
        const label = String(req.body?.label || '').trim();
        if (!label) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(400).json({ error: 'Libelle requis' });
        }
        try {
            const imagePath = '/uploads/borders/' + req.file.filename;
            const [result] = await pool.query(
                'INSERT INTO skin_borders (label, image_path, created_by) VALUES (?, ?, ?)',
                [label, imagePath, req.user.id]
            );
            res.status(201).json({ id: result.insertId, label, image_path: imagePath });
        } catch (dbErr) {
            console.error(dbErr);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });
});

router.delete('/borders/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    const [rows] = await pool.query('SELECT image_path FROM skin_borders WHERE id = ?', [req.params.id]);
    if (rows[0]?.image_path) {
        const filePath = path.join(__dirname, '..', '..', 'frontend', rows[0].image_path);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
    }
    await pool.query('DELETE FROM skin_borders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Bordure supprimee' });
}));

// =============== ATTRIBUTION (admin) ===============
router.post('/grant', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    const { player_id, skin_type, skin_id } = req.body || {};
    const cols = SKIN_COLUMNS[skin_type];
    if (!player_id || !cols || !skin_id) {
        return res.status(400).json({ error: 'Parametres invalides' });
    }
    await pool.query(
        `INSERT IGNORE INTO player_skins (player_id, skin_type, ${cols.ownership}, granted_by)
         VALUES (?, ?, ?, ?)`,
        [player_id, skin_type, skin_id, req.user.id]
    );
    res.json({ message: 'Skin attribue' });
}));

router.post('/revoke', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    const { player_id, skin_type, skin_id } = req.body || {};
    const cols = SKIN_COLUMNS[skin_type];
    if (!player_id || !cols || !skin_id) {
        return res.status(400).json({ error: 'Parametres invalides' });
    }
    await pool.query(
        `DELETE FROM player_skins WHERE player_id = ? AND skin_type = ? AND ${cols.ownership} = ?`,
        [player_id, skin_type, skin_id]
    );
    // Demonter si actuellement equipe
    await pool.query(
        `UPDATE players SET ${cols.equipped} = NULL WHERE id = ? AND ${cols.equipped} = ?`,
        [player_id, skin_id]
    );
    res.json({ message: 'Skin retire' });
}));

// Inventaire d un joueur (titres + bordures detenus). Param ordering: ASC pour admin, DESC pour soi-meme.
async function loadPlayerInventory(playerId, { withGrantedAtOrder } = {}) {
    const orderClause = withGrantedAtOrder ? 'ORDER BY ps.granted_at DESC' : '';
    const [titles] = await pool.query(
        `SELECT t.id, t.label, t.color
         FROM player_skins ps JOIN skin_titles t ON t.id = ps.title_id
         WHERE ps.player_id = ? AND ps.skin_type = 'title'
         ${orderClause}`,
        [playerId]
    );
    const [borders] = await pool.query(
        `SELECT b.id, b.label, b.image_path
         FROM player_skins ps JOIN skin_borders b ON b.id = ps.border_id
         WHERE ps.player_id = ? AND ps.skin_type = 'border'
         ${orderClause}`,
        [playerId]
    );
    return { titles, borders };
}

// =============== INVENTAIRE PERSO ===============
router.get('/me', authenticateToken, asyncRoute(async (req, res) => {
    const { titles, borders } = await loadPlayerInventory(req.user.id, { withGrantedAtOrder: true });
    const [me] = await pool.query(
        'SELECT equipped_title_id, equipped_border_id FROM players WHERE id = ?',
        [req.user.id]
    );
    res.json({
        titles,
        borders,
        equipped_title_id: me[0]?.equipped_title_id || null,
        equipped_border_id: me[0]?.equipped_border_id || null,
    });
}));

// Inventaire d un autre joueur (lecture seule)
router.get('/players/:id', authenticateToken, asyncRoute(async (req, res) => {
    const playerId = parseInt(req.params.id);
    const [me] = await pool.query(
        `SELECT p.equipped_title_id, p.equipped_border_id,
                t.label AS title_label, t.color AS title_color,
                b.image_path AS border_image
         FROM players p
         LEFT JOIN skin_titles t ON t.id = p.equipped_title_id
         LEFT JOIN skin_borders b ON b.id = p.equipped_border_id
         WHERE p.id = ?`,
        [playerId]
    );
    res.json(me[0] || null);
}));

router.put('/me/equip', authenticateToken, asyncRoute(async (req, res) => {
    const { skin_type, skin_id } = req.body || {};
    const cols = SKIN_COLUMNS[skin_type];
    if (!cols) return res.status(400).json({ error: 'Type invalide' });

    if (skin_id === null || skin_id === undefined || skin_id === 0) {
        await pool.query(`UPDATE players SET ${cols.equipped} = NULL WHERE id = ?`, [req.user.id]);
        return res.json({ message: 'Skin retire' });
    }

    const [owned] = await pool.query(
        `SELECT id FROM player_skins
         WHERE player_id = ? AND skin_type = ? AND ${cols.ownership} = ?`,
        [req.user.id, skin_type, skin_id]
    );
    if (owned.length === 0) {
        return res.status(403).json({ error: 'Vous ne possedez pas ce skin' });
    }
    await pool.query(`UPDATE players SET ${cols.equipped} = ? WHERE id = ?`, [skin_id, req.user.id]);
    res.json({ message: 'Skin equipe' });
}));

// Liste des skins detenus par un joueur (admin -> peut revoquer)
router.get('/admin/players/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
    res.json(await loadPlayerInventory(parseInt(req.params.id)));
}));

module.exports = router;
