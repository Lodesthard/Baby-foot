const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");
const ensureSchema = require("../config/ensure-schema");

async function initDB() {
	const adminUser = (process.env.ADMIN_USER || "admin").trim();
	const adminPassword = process.env.ADMIN_PASSWORD?.trim();

	if (!adminPassword) {
		throw new Error(
			"ADMIN_PASSWORD est manquant dans backend/.env. Definis ADMIN_USER et ADMIN_PASSWORD avant de lancer init-db.",
		);
	}

	const conn = await mysql.createConnection({
		host: process.env.DB_HOST || "localhost",
		user: process.env.DB_USER || "root",
		password: process.env.DB_PASSWORD || "",
		multipleStatements: true,
	});

	console.log("Connexion a MySQL...");

	// Lire et executer le schema
	const schema = fs.readFileSync(
		path.join(__dirname, "..", "..", "database", "schema.sql"),
		"utf8",
	);
	await conn.query(schema);
	await conn.query("USE babyfoot_ranked");
	await ensureSchema(conn);
	console.log("Schema cree.");

	// Creer l'admin par defaut
	const hash = await bcrypt.hash(adminPassword, 10);
	await conn.query(
		`INSERT IGNORE INTO players (identifier, password_hash, display_name, is_admin)
         VALUES (?, ?, 'Administrateur', 1)`,
		[adminUser, hash],
	);
	console.log("Compte admin créé");

	// Creer la premiere saison
	await conn.query(
		`INSERT INTO seasons (name, start_date, is_active, base_k_factor, rank_multiplier, score_multiplier, duo_rank_multiplier, loss_multiplier)
         SELECT 'Saison 1', CURDATE(), 1, 32.00, 1.50, 0.10, 1.30, 1.00
         WHERE NOT EXISTS (SELECT 1 FROM seasons LIMIT 1)`,
	);
	console.log("Saison 1 creee et activee.");

	await conn.end();
	console.log("Base de donnees initialisee avec succes !");
}

initDB().catch((err) => {
	console.error("Erreur:", err.message || err);
	console.error(err);
	process.exit(1);
});
