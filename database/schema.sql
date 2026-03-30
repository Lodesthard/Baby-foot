-- ============================================
-- BABY-FOOT RANKED - Base de données
-- ============================================

CREATE DATABASE IF NOT EXISTS babyfoot_ranked CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE babyfoot_ranked;

-- ============================================
-- Table des saisons
-- ============================================
CREATE TABLE IF NOT EXISTS seasons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 0,
    base_k_factor DECIMAL(6,2) DEFAULT 32.00,
    rank_multiplier DECIMAL(4,2) DEFAULT 1.50,
    score_multiplier DECIMAL(4,2) DEFAULT 0.10,
    duo_rank_multiplier DECIMAL(4,2) DEFAULT 1.30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table des joueurs
-- ============================================
CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ELO et rangs par joueur et par saison
-- ============================================
CREATE TABLE IF NOT EXISTS player_ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    season_id INT NOT NULL,
    elo_attack INT DEFAULT 1200,
    elo_defense INT DEFAULT 1200,
    elo_duo INT DEFAULT 1200,
    wins_attack INT DEFAULT 0,
    losses_attack INT DEFAULT 0,
    wins_defense INT DEFAULT 0,
    losses_defense INT DEFAULT 0,
    wins_duo INT DEFAULT 0,
    losses_duo INT DEFAULT 0,
    UNIQUE KEY unique_player_season (player_id, season_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
);

-- ============================================
-- Duos fixes par saison
-- ============================================
CREATE TABLE IF NOT EXISTS duos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    season_id INT NOT NULL,
    player1_id INT NOT NULL,
    player2_id INT NOT NULL,
    duo_name VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_player1_season (player1_id, season_id),
    UNIQUE KEY unique_player2_season (player2_id, season_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
    FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ============================================
-- Matchs enregistrés
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    season_id INT NOT NULL,
    match_type ENUM('solo', 'duo') NOT NULL,
    -- Equipe 1
    team1_attack INT NOT NULL,
    team1_defense INT NOT NULL,
    score_team1 INT NOT NULL,
    -- Equipe 2
    team2_attack INT NOT NULL,
    team2_defense INT NOT NULL,
    score_team2 INT NOT NULL,
    -- ELO changes enregistrés
    elo_change_t1_attack INT DEFAULT 0,
    elo_change_t1_defense INT DEFAULT 0,
    elo_change_t2_attack INT DEFAULT 0,
    elo_change_t2_defense INT DEFAULT 0,
    elo_change_duo_t1 INT DEFAULT 0,
    elo_change_duo_t2 INT DEFAULT 0,
    recorded_by INT NOT NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (team1_attack) REFERENCES players(id),
    FOREIGN KEY (team1_defense) REFERENCES players(id),
    FOREIGN KEY (team2_attack) REFERENCES players(id),
    FOREIGN KEY (team2_defense) REFERENCES players(id),
    FOREIGN KEY (recorded_by) REFERENCES players(id)
);

-- ============================================
-- Historique ELO pour graphiques
-- ============================================
CREATE TABLE IF NOT EXISTS elo_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    season_id INT NOT NULL,
    match_id INT NOT NULL,
    elo_attack INT NOT NULL,
    elo_defense INT NOT NULL,
    elo_duo INT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- ============================================
-- Insertion admin par défaut (mdp: admin123)
-- ============================================
-- Le hash sera généré par le backend au premier lancement
