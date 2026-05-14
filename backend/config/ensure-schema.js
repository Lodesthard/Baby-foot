async function ensureSchema(connOrPool) {
    const [seasonColumns] = await connOrPool.query('SHOW COLUMNS FROM seasons');
    const seasonColumnNames = new Set(seasonColumns.map((column) => column.Field));

    // Widen coefficient columns from DECIMAL(4,2) or (6,2) to DECIMAL(10,6)
    const baseKCol = seasonColumns.find(c => c.Field === 'base_k_factor');
    if (baseKCol && !baseKCol.Type.includes('10')) {
        const coeffCols = [
            'base_k_factor', 'rank_multiplier', 'score_multiplier',
            'duo_rank_multiplier', 'mate_rank_multiplier', 'loss_multiplier',
            'win_streak_multiplier', 'loss_streak_multiplier', 'winrate_multiplier'
        ];
        for (const col of coeffCols) {
            if (seasonColumnNames.has(col)) {
                await connOrPool.query(`ALTER TABLE seasons MODIFY COLUMN ${col} DECIMAL(10,6)`);
            }
        }
    }

    if (!seasonColumnNames.has('mate_rank_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN mate_rank_multiplier DECIMAL(10,6) DEFAULT 1.50 AFTER duo_rank_multiplier'
        );
    }

    if (!seasonColumnNames.has('duo_rank_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN duo_rank_multiplier DECIMAL(10,6) DEFAULT 1.30 AFTER score_multiplier'
        );
    }

    if (!seasonColumnNames.has('loss_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN loss_multiplier DECIMAL(10,6) DEFAULT 1.00 AFTER duo_rank_multiplier'
        );
    }

    if (!seasonColumnNames.has('win_streak_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN win_streak_multiplier DECIMAL(10,6) DEFAULT 0.05 AFTER loss_multiplier'
        );
    }

    if (!seasonColumnNames.has('loss_streak_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN loss_streak_multiplier DECIMAL(10,6) DEFAULT 0.05 AFTER win_streak_multiplier'
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

    // === Streak columns ===
    if (!prColumnNames.has('current_win_streak')) {
        await connOrPool.query('ALTER TABLE player_ratings ADD COLUMN current_win_streak INT DEFAULT 0');
        await connOrPool.query('ALTER TABLE player_ratings ADD COLUMN current_loss_streak INT DEFAULT 0');
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

    // === Profile photo column ===
    const [playerColumns] = await connOrPool.query('SHOW COLUMNS FROM players');
    const playerColumnNames = new Set(playerColumns.map((c) => c.Field));
    if (!playerColumnNames.has('profile_photo')) {
        await connOrPool.query("ALTER TABLE players ADD COLUMN profile_photo VARCHAR(255) DEFAULT NULL AFTER display_name");
    }

    // === Rules table ===
    const [rulesTables] = await connOrPool.query("SHOW TABLES LIKE 'rules'");
    if (rulesTables.length === 0) {
        await connOrPool.query(`CREATE TABLE rules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            content TEXT NOT NULL,
            updated_by INT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES players(id)
        )`);
    }

    // === winrate_multiplier on seasons ===
    if (!seasonColumnNames.has('winrate_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN winrate_multiplier DECIMAL(10,6) DEFAULT 0.00 AFTER loss_streak_multiplier'
        );
    }

    // === Algorithm selector + TrueSkill2 params on seasons ===
    if (!seasonColumnNames.has('algorithm')) {
        await connOrPool.query(
            "ALTER TABLE seasons ADD COLUMN algorithm ENUM('elo','trueskill2') NOT NULL DEFAULT 'elo' AFTER winrate_multiplier"
        );
    }
    // Defauts calibres pour ~80 pts ELO/match, +/-10 pts par 400 pts d ecart.
    const tsSeasonCols = [
        ['ts_mu', 'DECIMAL(10,6) DEFAULT 25.000000'],
        ['ts_sigma', 'DECIMAL(10,6) DEFAULT 8.333333'],
        ['ts_beta', 'DECIMAL(10,6) DEFAULT 28.666667'],
        ['ts_tau', 'DECIMAL(10,6) DEFAULT 0.083333'],
        ['ts_draw_probability', 'DECIMAL(10,6) DEFAULT 0.000000'],
        ['ts_scale', 'DECIMAL(10,6) DEFAULT 61.000000'],
        ['ts_score_multiplier', 'DECIMAL(10,6) DEFAULT 0.000000'],
    ];
    for (const [col, def] of tsSeasonCols) {
        if (!seasonColumnNames.has(col)) {
            await connOrPool.query(`ALTER TABLE seasons ADD COLUMN ${col} ${def}`);
        }
    }

    // Migration ponctuelle : si les seasons existantes ont encore les anciens
    // defauts TS (beta=4.166667, scale=48, score_mult=0.1), les ramener aux
    // nouveaux defauts calibres. Les seasons deja personnalisees sont preservees.
    await connOrPool.query(`
        UPDATE seasons
        SET ts_beta = 28.666667, ts_scale = 61.000000, ts_score_multiplier = 0.000000
        WHERE ABS(ts_beta - 4.166667) < 0.0001
          AND ABS(ts_scale - 48.000000) < 0.0001
          AND ABS(ts_score_multiplier - 0.100000) < 0.0001
    `);

    // === TrueSkill2 per-player state ===
    const tsRatingCols = [
        ['ts_mu_attack', 'DECIMAL(10,6) DEFAULT 25.000000'],
        ['ts_sigma_attack', 'DECIMAL(10,6) DEFAULT 8.333333'],
        ['ts_mu_defense', 'DECIMAL(10,6) DEFAULT 25.000000'],
        ['ts_sigma_defense', 'DECIMAL(10,6) DEFAULT 8.333333'],
        ['ts_mu_duo', 'DECIMAL(10,6) DEFAULT 25.000000'],
        ['ts_sigma_duo', 'DECIMAL(10,6) DEFAULT 8.333333'],
        ['ts_mu_1v1', 'DECIMAL(10,6) DEFAULT 25.000000'],
        ['ts_sigma_1v1', 'DECIMAL(10,6) DEFAULT 8.333333'],
    ];
    for (const [col, def] of tsRatingCols) {
        if (!prColumnNames.has(col)) {
            await connOrPool.query(`ALTER TABLE player_ratings ADD COLUMN ${col} ${def}`);
        }
    }

    // === Chat last-read marker per player ===
    if (!playerColumnNames.has('chat_last_read_id')) {
        await connOrPool.query(
            'ALTER TABLE players ADD COLUMN chat_last_read_id INT NOT NULL DEFAULT 0'
        );
    }

    // === Chat messages table ===
    const [chatTables] = await connOrPool.query("SHOW TABLES LIKE 'chat_messages'");
    if (chatTables.length === 0) {
        await connOrPool.query(`CREATE TABLE chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            message VARCHAR(500) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        )`);
    }

    // === Theme preference per player (legacy, conserve pour compat) ===
    if (!playerColumnNames.has('theme_preference')) {
        await connOrPool.query(
            "ALTER TABLE players ADD COLUMN theme_preference VARCHAR(32) NOT NULL DEFAULT 'classic'"
        );
    }

    // === Global app settings (theme global impose par les admins) ===
    const [appSettingsTables] = await connOrPool.query("SHOW TABLES LIKE 'app_settings'");
    if (appSettingsTables.length === 0) {
        await connOrPool.query(`CREATE TABLE app_settings (
            \`key\` VARCHAR(64) PRIMARY KEY,
            value VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
        await connOrPool.query(
            "INSERT INTO app_settings (`key`, value) VALUES ('theme', 'classic')"
        );
    }

    // === Equipped skin pointers per player ===
    if (!playerColumnNames.has('equipped_title_id')) {
        await connOrPool.query(
            'ALTER TABLE players ADD COLUMN equipped_title_id INT DEFAULT NULL'
        );
    }
    if (!playerColumnNames.has('equipped_border_id')) {
        await connOrPool.query(
            'ALTER TABLE players ADD COLUMN equipped_border_id INT DEFAULT NULL'
        );
    }

    // === Skin titles ===
    const [titleTables] = await connOrPool.query("SHOW TABLES LIKE 'skin_titles'");
    if (titleTables.length === 0) {
        await connOrPool.query(`CREATE TABLE skin_titles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            label VARCHAR(80) NOT NULL,
            color VARCHAR(20) DEFAULT NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES players(id)
        )`);
    }

    // === Skin borders ===
    const [borderTables] = await connOrPool.query("SHOW TABLES LIKE 'skin_borders'");
    if (borderTables.length === 0) {
        await connOrPool.query(`CREATE TABLE skin_borders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            label VARCHAR(80) NOT NULL,
            image_path VARCHAR(255) NOT NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES players(id)
        )`);
    }

    // === Player owned skins (titles + borders) ===
    const [ownedTables] = await connOrPool.query("SHOW TABLES LIKE 'player_skins'");
    if (ownedTables.length === 0) {
        await connOrPool.query(`CREATE TABLE player_skins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            skin_type ENUM('title','border') NOT NULL,
            title_id INT DEFAULT NULL,
            border_id INT DEFAULT NULL,
            granted_by INT NOT NULL,
            granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_player_title (player_id, title_id),
            UNIQUE KEY uniq_player_border (player_id, border_id),
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (title_id) REFERENCES skin_titles(id) ON DELETE CASCADE,
            FOREIGN KEY (border_id) REFERENCES skin_borders(id) ON DELETE CASCADE,
            FOREIGN KEY (granted_by) REFERENCES players(id)
        )`);
    }

    // === Season recaps (global + per-player) ===
    const [globalRecapTables] = await connOrPool.query("SHOW TABLES LIKE 'season_recaps'");
    if (globalRecapTables.length === 0) {
        await connOrPool.query(`CREATE TABLE season_recaps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            season_id INT NOT NULL UNIQUE,
            data JSON NOT NULL,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
        )`);
    }

    const [playerRecapTables] = await connOrPool.query("SHOW TABLES LIKE 'player_season_recaps'");
    if (playerRecapTables.length === 0) {
        await connOrPool.query(`CREATE TABLE player_season_recaps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            season_id INT NOT NULL,
            data JSON NOT NULL,
            viewed_at TIMESTAMP NULL DEFAULT NULL,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_player_season_recap (player_id, season_id),
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
        )`);
    }

    // === Lobbies table ===
    const [lobbiesTables] = await connOrPool.query("SHOW TABLES LIKE 'lobbies'");
    if (lobbiesTables.length === 0) {
        await connOrPool.query(`CREATE TABLE lobbies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(20) NOT NULL UNIQUE,
            match_type ENUM('solo', 'duo', '1v1') NOT NULL DEFAULT 'solo',
            created_by INT NOT NULL,
            status ENUM('waiting', 'ready', 'completed', 'cancelled') DEFAULT 'waiting',
            slot_t1_attack INT DEFAULT NULL,
            slot_t1_defense INT DEFAULT NULL,
            slot_t2_attack INT DEFAULT NULL,
            slot_t2_defense INT DEFAULT NULL,
            slot_1v1_p1 INT DEFAULT NULL,
            slot_1v1_p2 INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES players(id),
            FOREIGN KEY (slot_t1_attack) REFERENCES players(id),
            FOREIGN KEY (slot_t1_defense) REFERENCES players(id),
            FOREIGN KEY (slot_t2_attack) REFERENCES players(id),
            FOREIGN KEY (slot_t2_defense) REFERENCES players(id),
            FOREIGN KEY (slot_1v1_p1) REFERENCES players(id),
            FOREIGN KEY (slot_1v1_p2) REFERENCES players(id)
        )`);
    } else {
        const [lobbyColumns] = await connOrPool.query('SHOW COLUMNS FROM lobbies');
        const lobbyMatchType = lobbyColumns.find((c) => c.Field === 'match_type');
        if (lobbyMatchType && !lobbyMatchType.Type.includes("'duo'")) {
            await connOrPool.query(
                `ALTER TABLE lobbies
                 MODIFY COLUMN match_type ENUM('solo', 'duo', '1v1') NOT NULL DEFAULT 'solo'`
            );
        }
    }
}

module.exports = ensureSchema;
