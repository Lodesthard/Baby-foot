const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const QRCode = require('qrcode');
const crypto = require('crypto');

const router = express.Router();

function generateCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function getActiveSeasonId(connOrPool) {
    const [season] = await connOrPool.query('SELECT id FROM seasons WHERE is_active = 1 LIMIT 1');
    return season[0]?.id || null;
}

async function getRegisteredDuo(connOrPool, seasonId, playerA, playerB) {
    if (!seasonId || !playerA || !playerB) return null;

    const [rows] = await connOrPool.query(
        `SELECT d.*,
                p1.display_name AS player1_name,
                p2.display_name AS player2_name
         FROM duos d
         JOIN players p1 ON d.player1_id = p1.id
         JOIN players p2 ON d.player2_id = p2.id
         WHERE d.season_id = ?
           AND (
                (d.player1_id = ? AND d.player2_id = ?)
                OR
                (d.player1_id = ? AND d.player2_id = ?)
           )
         LIMIT 1`,
        [seasonId, playerA, playerB, playerB, playerA]
    );

    return rows[0] || null;
}

async function getPlayerActiveDuo(connOrPool, seasonId, playerId) {
    if (!seasonId || !playerId) return null;

    const [rows] = await connOrPool.query(
        `SELECT d.*,
                p1.display_name AS player1_name,
                p2.display_name AS player2_name
         FROM duos d
         JOIN players p1 ON d.player1_id = p1.id
         JOIN players p2 ON d.player2_id = p2.id
         WHERE d.season_id = ?
           AND (d.player1_id = ? OR d.player2_id = ?)
         LIMIT 1`,
        [seasonId, playerId, playerId]
    );

    return rows[0] || null;
}

function getDuoTeamFields(teamKey) {
    return teamKey === 'team1'
        ? ['slot_t1_attack', 'slot_t1_defense']
        : ['slot_t2_attack', 'slot_t2_defense'];
}

function getTeamOccupants(lobby, fields) {
    return fields.map((field) => lobby[field]).filter((id) => id !== null);
}

function teamOccupantsMatchDuo(occupants, duo) {
    const duoIds = [duo.player1_id, duo.player2_id];
    return occupants.length > 0 && occupants.every((id) => duoIds.includes(id));
}

async function decorateLobby(connOrPool, lobby) {
    if (!lobby || lobby.match_type !== 'duo') {
        return lobby;
    }

    const seasonId = await getActiveSeasonId(connOrPool);
    const team1Ready = lobby.slot_t1_attack !== null && lobby.slot_t1_defense !== null;
    const team2Ready = lobby.slot_t2_attack !== null && lobby.slot_t2_defense !== null;

    const duoTeam1 = team1Ready
        ? await getRegisteredDuo(connOrPool, seasonId, lobby.slot_t1_attack, lobby.slot_t1_defense)
        : null;
    const duoTeam2 = team2Ready
        ? await getRegisteredDuo(connOrPool, seasonId, lobby.slot_t2_attack, lobby.slot_t2_defense)
        : null;

    return {
        ...lobby,
        duo_team1: duoTeam1,
        duo_team2: duoTeam2,
        duo_team1_valid: Boolean(duoTeam1),
        duo_team2_valid: Boolean(duoTeam2),
        duo_valid: Boolean(duoTeam1 && duoTeam2),
    };
}

async function isLobbyReady(connOrPool, lobby) {
    if (!lobby) return false;

    if (lobby.match_type === '1v1') {
        return lobby.slot_1v1_p1 !== null && lobby.slot_1v1_p2 !== null;
    }

    const slotsFilled = lobby.slot_t1_attack !== null
        && lobby.slot_t1_defense !== null
        && lobby.slot_t2_attack !== null
        && lobby.slot_t2_defense !== null;

    if (!slotsFilled) return false;
    if (lobby.match_type !== 'duo') return true;

    const decoratedLobby = await decorateLobby(connOrPool, lobby);
    return Boolean(decoratedLobby.duo_valid);
}

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { match_type } = req.body;
        if (!['solo', 'duo', '1v1'].includes(match_type)) {
            return res.status(400).json({ error: 'Type de match invalide (solo, duo ou 1v1)' });
        }

        const code = generateCode();
        const [result] = await pool.query(
            'INSERT INTO lobbies (code, match_type, created_by) VALUES (?, ?, ?)',
            [code, match_type, req.user.id]
        );

        res.status(201).json({
            id: result.insertId,
            code,
            match_type,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/code/:code', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT l.*,
                    p.display_name AS created_by_name,
                    p1a.display_name AS t1_attack_name,
                    p1d.display_name AS t1_defense_name,
                    p2a.display_name AS t2_attack_name,
                    p2d.display_name AS t2_defense_name,
                    pp1.display_name AS p1_name,
                    pp2.display_name AS p2_name
             FROM lobbies l
             JOIN players p ON l.created_by = p.id
             LEFT JOIN players p1a ON l.slot_t1_attack = p1a.id
             LEFT JOIN players p1d ON l.slot_t1_defense = p1d.id
             LEFT JOIN players p2a ON l.slot_t2_attack = p2a.id
             LEFT JOIN players p2d ON l.slot_t2_defense = p2d.id
             LEFT JOIN players pp1 ON l.slot_1v1_p1 = pp1.id
             LEFT JOIN players pp2 ON l.slot_1v1_p2 = pp2.id
             WHERE l.code = ? AND l.status IN ('waiting', 'ready')`,
            [req.params.code]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable ou termine' });
        }

        res.json(await decorateLobby(pool, rows[0]));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT l.*,
                    p.display_name AS created_by_name,
                    p1a.display_name AS t1_attack_name,
                    p1d.display_name AS t1_defense_name,
                    p2a.display_name AS t2_attack_name,
                    p2d.display_name AS t2_defense_name,
                    pp1.display_name AS p1_name,
                    pp2.display_name AS p2_name
             FROM lobbies l
             JOIN players p ON l.created_by = p.id
             LEFT JOIN players p1a ON l.slot_t1_attack = p1a.id
             LEFT JOIN players p1d ON l.slot_t1_defense = p1d.id
             LEFT JOIN players p2a ON l.slot_t2_attack = p2a.id
             LEFT JOIN players p2d ON l.slot_t2_defense = p2d.id
             LEFT JOIN players pp1 ON l.slot_1v1_p1 = pp1.id
             LEFT JOIN players pp2 ON l.slot_1v1_p2 = pp2.id
             WHERE l.id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable' });
        }

        res.json(await decorateLobby(pool, rows[0]));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/:id/qr', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT code FROM lobbies WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable' });
        }

        const basePath = req.query.basePath || '';
        const baseUrl = `${req.protocol}://${req.get('host')}${basePath}`;
        const lobbyUrl = `${baseUrl}/?lobby=${rows[0].code}`;
        const qrDataUrl = await QRCode.toDataURL(lobbyUrl, {
            width: 300,
            margin: 2,
            color: { dark: '#f8f9fd', light: '#05070c' },
        });

        res.json({ qr: qrDataUrl, code: rows[0].code, url: lobbyUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/join', authenticateToken, async (req, res) => {
    try {
        const { slot } = req.body;
        const lobbyId = req.params.id;
        const playerId = req.user.id;

        const [rows] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND status IN ("waiting", "ready")',
            [lobbyId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable ou termine' });
        }

        const lobby = rows[0];

        // Pour solo et 1v1 : libere tout autre slot ou le joueur est deja place,
        // refuse si le slot cible est occupe par quelqu un d autre, sinon assigne.
        const claimSlotForPlayer = async (validSlots) => {
            if (!validSlots.includes(slot)) {
                return { error: 'Slot invalide' };
            }
            for (const currentSlot of validSlots) {
                if (lobby[currentSlot] === playerId && currentSlot !== slot) {
                    await pool.query(`UPDATE lobbies SET ${currentSlot} = NULL WHERE id = ?`, [lobbyId]);
                }
            }
            if (lobby[slot] !== null && lobby[slot] !== playerId) {
                return { error: 'Ce slot est deja pris' };
            }
            await pool.query(`UPDATE lobbies SET ${slot} = ? WHERE id = ?`, [playerId, lobbyId]);
            return null;
        };

        if (lobby.match_type === '1v1') {
            const err = await claimSlotForPlayer(['slot_1v1_p1', 'slot_1v1_p2']);
            if (err) return res.status(400).json({ error: err.error });
        } else if (lobby.match_type === 'duo') {
            if (!['team1', 'team2'].includes(slot)) {
                return res.status(400).json({ error: 'Equipe invalide' });
            }

            const seasonId = await getActiveSeasonId(pool);
            if (!seasonId) {
                return res.status(400).json({ error: 'Aucune saison active' });
            }

            const duo = await getPlayerActiveDuo(pool, seasonId, playerId);
            if (!duo) {
                return res.status(400).json({ error: 'Vous devez avoir un duo de saison pour rejoindre un lobby double' });
            }

            const targetFields = getDuoTeamFields(slot);
            const otherFields = getDuoTeamFields(slot === 'team1' ? 'team2' : 'team1');
            const targetOccupants = getTeamOccupants(lobby, targetFields);
            const otherOccupants = getTeamOccupants(lobby, otherFields);

            if (targetOccupants.length > 0 && !teamOccupantsMatchDuo(targetOccupants, duo)) {
                return res.status(400).json({ error: 'Cette equipe est deja prise par un autre duo' });
            }
            if (otherOccupants.some((id) => id === duo.player1_id || id === duo.player2_id)
                && !teamOccupantsMatchDuo(otherOccupants, duo)) {
                return res.status(400).json({ error: 'Ce duo est deja partiellement place dans le lobby' });
            }

            const updates = {};
            if (teamOccupantsMatchDuo(otherOccupants, duo)) {
                updates[otherFields[0]] = null;
                updates[otherFields[1]] = null;
            }
            updates[targetFields[0]] = duo.player1_id;
            updates[targetFields[1]] = duo.player2_id;

            const updateFields = Object.keys(updates);
            await pool.query(
                `UPDATE lobbies SET ${updateFields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
                [...updateFields.map((field) => updates[field]), lobbyId]
            );
        } else {
            const err = await claimSlotForPlayer(['slot_t1_attack', 'slot_t1_defense', 'slot_t2_attack', 'slot_t2_defense']);
            if (err) return res.status(400).json({ error: err.error });
        }

        const [updated] = await pool.query('SELECT * FROM lobbies WHERE id = ?', [lobbyId]);
        const isFull = await isLobbyReady(pool, updated[0]);

        if (isFull) {
            await pool.query('UPDATE lobbies SET status = "ready" WHERE id = ?', [lobbyId]);
        } else {
            await pool.query('UPDATE lobbies SET status = "waiting" WHERE id = ?', [lobbyId]);
        }

        res.json({ message: 'Rejoint le lobby', full: isFull });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/leave', authenticateToken, async (req, res) => {
    try {
        const lobbyId = req.params.id;
        const playerId = req.user.id;

        const [rows] = await pool.query(
            'SELECT * FROM lobbies WHERE id = ? AND status IN ("waiting", "ready")',
            [lobbyId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable' });
        }

        const lobby = rows[0];
        if (lobby.match_type === 'duo') {
            const teamFields = [getDuoTeamFields('team1'), getDuoTeamFields('team2')];
            for (const fields of teamFields) {
                if (fields.some((field) => lobby[field] === playerId)) {
                    await pool.query(
                        `UPDATE lobbies
                         SET ${fields[0]} = NULL,
                             ${fields[1]} = NULL,
                             status = 'waiting'
                         WHERE id = ?`,
                        [lobbyId]
                    );
                }
            }
        } else {
            const allSlots = ['slot_t1_attack', 'slot_t1_defense', 'slot_t2_attack', 'slot_t2_defense', 'slot_1v1_p1', 'slot_1v1_p2'];
            for (const slot of allSlots) {
                if (lobby[slot] === playerId) {
                    await pool.query(`UPDATE lobbies SET ${slot} = NULL, status = 'waiting' WHERE id = ?`, [lobbyId]);
                }
            }
        }

        res.json({ message: 'Quitte le lobby' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM lobbies WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable' });
        }

        if (rows[0].created_by !== req.user.id) {
            return res.status(403).json({ error: 'Seul le createur peut annuler le lobby' });
        }

        await pool.query('UPDATE lobbies SET status = "cancelled" WHERE id = ?', [req.params.id]);
        res.json({ message: 'Lobby annule' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.put('/:id/complete', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM lobbies WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable' });
        }

        if (rows[0].created_by !== req.user.id) {
            return res.status(403).json({ error: 'Seul le createur peut clore le lobby' });
        }

        await pool.query('UPDATE lobbies SET status = "completed" WHERE id = ?', [req.params.id]);
        res.json({ message: 'Lobby termine' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/:id/duo-check', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM lobbies WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lobby introuvable' });
        }
        if (rows[0].match_type !== 'duo') {
            return res.json({ duo_valid: true, duo_team1_valid: true, duo_team2_valid: true });
        }

        const decoratedLobby = await decorateLobby(pool, rows[0]);
        res.json({
            duo_valid: decoratedLobby.duo_valid,
            duo_team1_valid: decoratedLobby.duo_team1_valid,
            duo_team2_valid: decoratedLobby.duo_team2_valid,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
