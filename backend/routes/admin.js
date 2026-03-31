const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Dashboard admin
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [players] = await pool.query('SELECT COUNT(*) as count FROM players');
        const [season] = await pool.query('SELECT * FROM seasons WHERE is_active = 1');
        const seasonId = season[0]?.id;
        let matchCount = 0;
        let duoCount = 0;
        if (seasonId) {
            const [m] = await pool.query('SELECT COUNT(*) as count FROM matches WHERE season_id = ? AND is_cancelled = 0', [seasonId]);
            matchCount = m[0].count;
            const [d] = await pool.query('SELECT COUNT(*) as count FROM duos WHERE season_id = ?', [seasonId]);
            duoCount = d[0].count;
        }

        res.json({
            total_players: players[0].count,
            active_season: season[0] || null,
            matches_this_season: matchCount,
            duos_this_season: duoCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Promouvoir/rétrograder admin
router.put('/players/:id/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { is_admin } = req.body;
        await pool.query('UPDATE players SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, req.params.id]);
        res.json({ message: 'Mis à jour' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Reset mot de passe d'un joueur (admin)
router.put('/players/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 4) {
            return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
        }
        const hash = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE players SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
        res.json({ message: 'Mot de passe réinitialisé' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer un duo (admin)
router.delete('/duos/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM duos WHERE id = ?', [req.params.id]);
        res.json({ message: 'Duo supprimé' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste tous les joueurs avec détails (admin)
router.get('/players', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, identifier, display_name, is_admin, created_at FROM players ORDER BY display_name'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Annuler un match (admin) - inverse les changements ELO
router.put('/matches/:id/cancel', authenticateToken, requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [matchRows] = await conn.query('SELECT * FROM matches WHERE id = ?', [req.params.id]);
        if (matchRows.length === 0) {
            return res.status(404).json({ error: 'Match introuvable' });
        }
        const m = matchRows[0];

        if (m.is_cancelled) {
            return res.status(400).json({ error: 'Ce match est déjà annulé' });
        }

        if (m.match_type === '1v1') {
            // Inverser ELO 1v1
            const p1Wins = m.score_team1 > m.score_team2;
            await conn.query(
                `UPDATE player_ratings SET
                    elo_1v1 = GREATEST(0, elo_1v1 - ?),
                    wins_1v1 = GREATEST(0, wins_1v1 - ?),
                    losses_1v1 = GREATEST(0, losses_1v1 - ?)
                 WHERE player_id = ? AND season_id = ?`,
                [m.elo_change_1v1_t1, p1Wins ? 1 : 0, p1Wins ? 0 : 1, m.team1_attack, m.season_id]
            );
            await conn.query(
                `UPDATE player_ratings SET
                    elo_1v1 = GREATEST(0, elo_1v1 - ?),
                    wins_1v1 = GREATEST(0, wins_1v1 - ?),
                    losses_1v1 = GREATEST(0, losses_1v1 - ?)
                 WHERE player_id = ? AND season_id = ?`,
                [m.elo_change_1v1_t2, !p1Wins ? 1 : 0, !p1Wins ? 0 : 1, m.team2_attack, m.season_id]
            );
        } else {
            // Inverser ELO attaque/defense pour les 4 joueurs
            const team1Wins = m.score_team1 > m.score_team2;
            const isDuo = m.match_type === 'duo';

            const revertPlayer = async (playerId, eloAttackChange, eloDefenseChange, eloDuoChange, isAttacker, won) => {
                const field_wins = isAttacker ? (won ? 'wins_attack' : 'losses_attack') : (won ? 'wins_defense' : 'losses_defense');
                let query = `UPDATE player_ratings SET
                    elo_attack = GREATEST(0, elo_attack - ?),
                    elo_defense = GREATEST(0, elo_defense - ?),
                    elo_duo = GREATEST(0, elo_duo - ?),
                    ${field_wins} = GREATEST(0, ${field_wins} - 1)`;
                if (isDuo) {
                    query += `, ${won ? 'wins_duo' : 'losses_duo'} = GREATEST(0, ${won ? 'wins_duo' : 'losses_duo'} - 1)`;
                }
                query += ` WHERE player_id = ? AND season_id = ?`;
                await conn.query(query, [eloAttackChange, eloDefenseChange, eloDuoChange, playerId, m.season_id]);
            };

            await revertPlayer(m.team1_attack, m.elo_change_t1_attack, 0, m.elo_change_duo_t1, true, team1Wins);
            await revertPlayer(m.team1_defense, 0, m.elo_change_t1_defense, m.elo_change_duo_t1, false, team1Wins);
            await revertPlayer(m.team2_attack, m.elo_change_t2_attack, 0, m.elo_change_duo_t2, true, !team1Wins);
            await revertPlayer(m.team2_defense, 0, m.elo_change_t2_defense, m.elo_change_duo_t2, false, !team1Wins);
        }

        // Supprimer l'historique ELO de ce match
        await conn.query('DELETE FROM elo_history WHERE match_id = ?', [m.id]);

        // Marquer le match comme annulé
        await conn.query('UPDATE matches SET is_cancelled = 1 WHERE id = ?', [m.id]);

        await conn.commit();
        res.json({ message: 'Match annulé et ELO inversé' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

// Modifier manuellement les points d'un joueur (admin)
router.put('/players/:id/elo', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { elo_attack, elo_defense, elo_duo, elo_1v1 } = req.body;
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) {
            return res.status(400).json({ error: 'Aucune saison active' });
        }

        const updates = [];
        const values = [];

        if (elo_attack !== undefined) { updates.push('elo_attack = ?'); values.push(Math.max(0, parseInt(elo_attack))); }
        if (elo_defense !== undefined) { updates.push('elo_defense = ?'); values.push(Math.max(0, parseInt(elo_defense))); }
        if (elo_duo !== undefined) { updates.push('elo_duo = ?'); values.push(Math.max(0, parseInt(elo_duo))); }
        if (elo_1v1 !== undefined) { updates.push('elo_1v1 = ?'); values.push(Math.max(0, parseInt(elo_1v1))); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Aucune valeur à modifier' });
        }

        values.push(req.params.id, season[0].id);
        await pool.query(
            `UPDATE player_ratings SET ${updates.join(', ')} WHERE player_id = ? AND season_id = ?`,
            values
        );

        res.json({ message: 'ELO mis à jour' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer un compte joueur (admin)
router.delete('/players/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const playerId = parseInt(req.params.id);
        if (playerId === req.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        }

        // Vérifier que le joueur existe
        const [player] = await pool.query('SELECT id, display_name FROM players WHERE id = ?', [playerId]);
        if (player.length === 0) {
            return res.status(404).json({ error: 'Joueur introuvable' });
        }

        // CASCADE supprimera player_ratings, duos, elo_history
        await pool.query('DELETE FROM players WHERE id = ?', [playerId]);
        res.json({ message: `Joueur "${player[0].display_name}" supprimé` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste des matchs récents pour la gestion admin
router.get('/matches', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json([]);

        const [matches] = await pool.query(
            `SELECT m.*,
                p1a.display_name as t1_attack_name, p1d.display_name as t1_defense_name,
                p2a.display_name as t2_attack_name, p2d.display_name as t2_defense_name
             FROM matches m
             JOIN players p1a ON m.team1_attack = p1a.id
             JOIN players p1d ON m.team1_defense = p1d.id
             JOIN players p2a ON m.team2_attack = p2a.id
             JOIN players p2d ON m.team2_defense = p2d.id
             WHERE m.season_id = ?
             ORDER BY m.played_at DESC LIMIT 50`,
            [season[0].id]
        );
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste des duos pour la gestion admin
router.get('/duos', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [season] = await pool.query('SELECT id FROM seasons WHERE is_active = 1');
        if (season.length === 0) return res.json([]);

        const [duos] = await pool.query(
            `SELECT d.*, p1.display_name as player1_name, p2.display_name as player2_name
             FROM duos d
             JOIN players p1 ON d.player1_id = p1.id
             JOIN players p2 ON d.player2_id = p2.id
             WHERE d.season_id = ?
             ORDER BY d.created_at DESC`,
            [season[0].id]
        );
        res.json(duos);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
