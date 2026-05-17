const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'babyfoot_ranked',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Empeche un crash process si MySQL coupe une connexion idle (wait_timeout,
// reseau). Sans ce listener, un event 'error' non gere fait throw Node.
pool.on('error', (err) => {
    console.error('Erreur pool MySQL (connexion perdue, recuperation auto) :', err.code || err.message || err);
});

module.exports = pool;
