require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');
const ensureSchema = require('./config/ensure-schema');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir les assets partages et le frontend
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/rankings', require('./routes/rankings'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/duos', require('./routes/duos'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/lobbies', require('./routes/lobbies'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/recaps', require('./routes/recaps'));
app.use('/api/skins', require('./routes/skins'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Middleware d'erreur global : attrape les erreurs multer (fichier trop gros /
// mauvais type) et tout throw synchrone dans une route/middleware. Empeche une
// reponse qui pend ou une stack trace renvoyee au client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Erreur non geree dans une route :', err.message || err);
    if (res.headersSent) return next(err);
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    res.status(status).json({ error: 'Erreur serveur' });
});

let server = null;
let shuttingDown = false;

// Arret propre : on stoppe d'accepter de nouvelles connexions, on ferme le
// pool MySQL, puis on sort en code != 0 pour que le process manager redemarre.
function gracefulShutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    const done = () => process.exit(code);
    const timer = setTimeout(done, 5000); // force apres 5s si ca bloque
    timer.unref();
    if (server) {
        server.close(() => {
            pool.end().then(done).catch(done);
        });
    } else {
        done();
    }
}

// unhandledRejection : souvent recuperable (1 requete), on log et on continue.
process.on('unhandledRejection', (reason) => {
    console.error('Promesse rejetee non geree :', reason);
});
// uncaughtException : etat process potentiellement corrompu -> arret propre +
// exit(1) pour laisser PM2/systemd redemarrer un process sain.
process.on('uncaughtException', (err) => {
    console.error('Exception non capturee, arret propre :', err);
    gracefulShutdown(1);
});
// Signaux process manager (PM2 reload, systemctl stop, Ctrl+C).
process.on('SIGTERM', () => gracefulShutdown(0));
process.on('SIGINT', () => gracefulShutdown(0));

async function startServer() {
    try {
        await ensureSchema(pool);
        server = app.listen(PORT, () => {
            console.log(`Serveur demarre sur le port ${PORT}`);
        });
    } catch (err) {
        console.error('Impossible de demarrer le serveur :', err.message || err);
        process.exit(1);
    }
}

startServer();
