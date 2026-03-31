async function ensureSchema(connOrPool) {
    const [seasonColumns] = await connOrPool.query('SHOW COLUMNS FROM seasons');
    const seasonColumnNames = new Set(seasonColumns.map((column) => column.Field));

    if (!seasonColumnNames.has('duo_rank_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN duo_rank_multiplier DECIMAL(4,2) DEFAULT 1.30 AFTER score_multiplier'
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
}

module.exports = ensureSchema;
