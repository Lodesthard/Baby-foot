const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function hasTrailingWhitespace(value) {
    return /\s+$/.test(String(value || ''));
}

// Configure multer for profile photo uploads
const uploadDir = path.join(__dirname, '..', '..', 'frontend', 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Map mimetypes to file extensions so iOS uploads without a usable filename
// (camera captures, HEIC, canvas-generated blobs named "blob") still land on a
// proper extension on disk.
const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/pjpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        let ext = path.extname(file.originalname || '').toLowerCase();
        if (!ext && file.mimetype) ext = mimeToExt[file.mimetype.toLowerCase()] || '';
        if (!ext) ext = '.jpg';
        cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB (iPhone photos peuvent depasser 5-10MB)
    fileFilter: (req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase();
        if (mime.startsWith('image/') && mime !== 'image/svg+xml') return cb(null, true);
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)) return cb(null, true);
        cb(new Error('Format non supporte. Utilisez JPG, PNG, WebP ou HEIC.'));
    }
});

// Inscription
router.post('/register', async (req, res) => {
    try {
        let { identifier, password, display_name } = req.body;
        if (!identifier || !password || !display_name) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        if (hasTrailingWhitespace(identifier)) {
            return res.status(400).json({ error: "L'identifiant ne peut pas finir par un espace" });
        }

        identifier = identifier.trim();
        display_name = display_name.trim();

        if (identifier.length < 2) {
            return res.status(400).json({ error: "L'identifiant doit faire au moins 2 caractères" });
        }

        const [existing] = await pool.query('SELECT id FROM players WHERE identifier = ?', [identifier]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Cet identifiant est déjà pris' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO players (identifier, password_hash, display_name) VALUES (?, ?, ?)',
            [identifier, password_hash, display_name]
        );

        // Créer les ratings pour la saison active
        const [activeSeason] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (activeSeason.length > 0) {
            await pool.query(
                'INSERT INTO player_ratings (player_id, season_id) VALUES (?, ?)',
                [result.insertId, activeSeason[0].id]
            );
        }

        res.status(201).json({ message: 'Compte créé', playerId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Connexion
router.post('/login', async (req, res) => {
    try {
        let { identifier, password } = req.body;
        identifier = (identifier || '').trimEnd();
        const [rows] = await pool.query('SELECT * FROM players WHERE identifier = ?', [identifier]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
        }

        const player = rows[0];
        const valid = await bcrypt.compare(password, player.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
        }

        const token = jwt.sign(
            { id: player.id, identifier: player.identifier, display_name: player.display_name, is_admin: player.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            player: {
                id: player.id,
                identifier: player.identifier,
                display_name: player.display_name,
                is_admin: player.is_admin,
                profile_photo: player.profile_photo
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Profil
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.id, p.identifier, p.display_name, p.is_admin, p.profile_photo,
                    p.theme_preference, p.equipped_title_id, p.equipped_border_id,
                    t.label AS equipped_title_label, t.color AS equipped_title_color,
                    b.image_path AS equipped_border_image
             FROM players p
             LEFT JOIN skin_titles t ON t.id = p.equipped_title_id
             LEFT JOIN skin_borders b ON b.id = p.equipped_border_id
             WHERE p.id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// Changer le pseudo (display_name)
router.put('/display-name', authenticateToken, async (req, res) => {
    try {
        const { display_name } = req.body;
        if (!display_name || display_name.trim().length < 2) {
            return res.status(400).json({ error: 'Le pseudo doit faire au moins 2 caractères' });
        }
        if (display_name.trim().length > 30) {
            return res.status(400).json({ error: 'Le pseudo ne peut pas dépasser 30 caractères' });
        }

        await pool.query('UPDATE players SET display_name = ? WHERE id = ?', [display_name.trim(), req.user.id]);

        // Mettre à jour le localStorage côté client
        const [rows] = await pool.query(
            'SELECT id, identifier, display_name, is_admin, profile_photo FROM players WHERE id = ?',
            [req.user.id]
        );
        res.json({ message: 'Pseudo mis à jour', player: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Upload profile photo
router.post('/profile-photo', authenticateToken, (req, res) => {
    upload.single('photo')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Erreur upload' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier envoyé' });
        }

        try {
            // Delete old photo if exists
            const [oldRows] = await pool.query('SELECT profile_photo FROM players WHERE id = ?', [req.user.id]);
            if (oldRows[0]?.profile_photo) {
                const oldPath = path.join(__dirname, '..', '..', 'frontend', oldRows[0].profile_photo);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const photoPath = '/uploads/avatars/' + req.file.filename;
            await pool.query('UPDATE players SET profile_photo = ? WHERE id = ?', [photoPath, req.user.id]);

            const [rows] = await pool.query(
                'SELECT id, identifier, display_name, is_admin, profile_photo FROM players WHERE id = ?',
                [req.user.id]
            );
            res.json({ message: 'Photo mise à jour', player: rows[0] });
        } catch (dbErr) {
            console.error(dbErr);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });
});

module.exports = router;
