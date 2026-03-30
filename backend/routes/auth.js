const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Inscription
router.post('/register', async (req, res) => {
    try {
        const { identifier, password, display_name } = req.body;
        if (!identifier || !password || !display_name) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
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
        const { identifier, password } = req.body;
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

        res.json({ token, player: { id: player.id, display_name: player.display_name, is_admin: player.is_admin } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Profil
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, identifier, display_name, is_admin FROM players WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
