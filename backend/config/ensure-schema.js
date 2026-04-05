async function ensureSchema(connOrPool) {
    const [seasonColumns] = await connOrPool.query('SHOW COLUMNS FROM seasons');
    const seasonColumnNames = new Set(seasonColumns.map((column) => column.Field));

    if (!seasonColumnNames.has('duo_rank_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN duo_rank_multiplier DECIMAL(4,2) DEFAULT 1.30 AFTER score_multiplier'
        );
    }

    if (!seasonColumnNames.has('loss_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN loss_multiplier DECIMAL(4,2) DEFAULT 1.00 AFTER duo_rank_multiplier'
        );
    }

    // === 1v1 support ===
    const [prColumns] = await connOrPool.query('SHOW COLUMNS FROM player_ratings');
    const prColumnNames = new Set(prColumns.map((c) => c.Field));

    if (!prColumnNames.has('elo_1v1')) {
        await connOrPool.query('ALTER TABLE player_ratings ADD COLUMN elo_1v1 INT DEFAULT 1200 AFTER elo_duo');
        await connOrPool.query('ALTER TABLE player_ratings ADD COLUMN wins_1v1 INT DEFAULT 0 AFTER losses_duo');
        await connOrPool.query('ALTER TABLE player_ratings ADD COLUMN losses_1v1 INT DEFAULT 0 AFTER wins_1v1');
    }

    // match_type ENUM: add '1v1'
    const [matchColumns] = await connOrPool.query('SHOW COLUMNS FROM matches');
    const matchTypeCol = matchColumns.find((c) => c.Field === 'match_type');
    if (matchTypeCol && !matchTypeCol.Type.includes('1v1')) {
        await connOrPool.query("ALTER TABLE matches MODIFY COLUMN match_type ENUM('solo','duo','1v1') NOT NULL");
    }

    // elo_change_1v1 columns on matches
    const matchColumnNames = new Set(matchColumns.map((c) => c.Field));
    if (!matchColumnNames.has('elo_change_1v1_t1')) {
        await connOrPool.query('ALTER TABLE matches ADD COLUMN elo_change_1v1_t1 INT DEFAULT 0 AFTER elo_change_duo_t2');
        await connOrPool.query('ALTER TABLE matches ADD COLUMN elo_change_1v1_t2 INT DEFAULT 0 AFTER elo_change_1v1_t1');
    }

    // is_cancelled flag on matches
    if (!matchColumnNames.has('is_cancelled')) {
        await connOrPool.query('ALTER TABLE matches ADD COLUMN is_cancelled TINYINT(1) DEFAULT 0 AFTER recorded_by');
    }

    // elo_1v1 on elo_history
    const [ehColumns] = await connOrPool.query('SHOW COLUMNS FROM elo_history');
    const ehColumnNames = new Set(ehColumns.map((c) => c.Field));
    if (!ehColumnNames.has('elo_1v1')) {
        await connOrPool.query('ALTER TABLE elo_history ADD COLUMN elo_1v1 INT DEFAULT 1200 AFTER elo_duo');
    }

    // === Tournament tables ===
    const [tournamentTables] = await connOrPool.query("SHOW TABLES LIKE 'tournaments'");
    if (tournamentTables.length === 0) {
        await connOrPool.query(`CREATE TABLE tournaments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            season_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            tournament_type ENUM('simple', 'double') NOT NULL,
            status ENUM('registration', 'in_progress', 'completed', 'cancelled') DEFAULT 'registration',
            max_participants INT DEFAULT 16,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP NULL,
            completed_at TIMESTAMP NULL,
            FOREIGN KEY (season_id) REFERENCES seasons(id),
            FOREIGN KEY (created_by) REFERENCES players(id)
        )`);
        await connOrPool.query(`CREATE TABLE tournament_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            player_id INT DEFAULT NULL,
            duo_id INT DEFAULT NULL,
            seed INT DEFAULT NULL,
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_player_tournament (tournament_id, player_id),
            UNIQUE KEY unique_duo_tournament (tournament_id, duo_id),
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (duo_id) REFERENCES duos(id) ON DELETE CASCADE
        )`);
        await connOrPool.query(`CREATE TABLE tournament_matches (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            round INT NOT NULL,
            position INT NOT NULL,
            participant1_id INT DEFAULT NULL,
            participant2_id INT DEFAULT NULL,
            winner_participant_id INT DEFAULT NULL,
            match_id INT DEFAULT NULL,
            is_bye TINYINT(1) DEFAULT 0,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (participant1_id) REFERENCES tournament_participants(id),
            FOREIGN KEY (participant2_id) REFERENCES tournament_participants(id),
            FOREIGN KEY (winner_participant_id) REFERENCES tournament_participants(id),
            FOREIGN KEY (match_id) REFERENCES matches(id)
        )`);
    }
}

module.exports = ensureSchema;
