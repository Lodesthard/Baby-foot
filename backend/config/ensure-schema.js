async function ensureSchema(connOrPool) {
    const [seasonColumns] = await connOrPool.query('SHOW COLUMNS FROM seasons');
    const seasonColumnNames = new Set(seasonColumns.map((column) => column.Field));

    if (!seasonColumnNames.has('duo_rank_multiplier')) {
        await connOrPool.query(
            'ALTER TABLE seasons ADD COLUMN duo_rank_multiplier DECIMAL(4,2) DEFAULT 1.30 AFTER score_multiplier'
        );
    }
}

module.exports = ensureSchema;
