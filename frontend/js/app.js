// ============================================
// App Principal
// ============================================

const RANK_COLORS = {
    'Iron': 'iron', 'Bronze': 'bronze', 'Silver': 'silver', 'Gold': 'gold',
    'Platinum': 'platinum', 'Diamond': 'diamond', 'Master': 'master',
    'Grandmaster': 'grandmaster', 'Challenger': 'challenger'
};

function getRankColorClass(rankName) {
    for (const [key, val] of Object.entries(RANK_COLORS)) {
        if (rankName.startsWith(key)) return val;
    }
    return 'iron';
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatEloChange(val) {
    if (val > 0) return `<span class="elo-positive">+${val}</span>`;
    if (val < 0) return `<span class="elo-negative">${val}</span>`;
    return '<span>0</span>';
}

function formatWinrate(wins, losses) {
    const total = wins + losses;
    if (total === 0) return '-';
    return Math.round((wins / total) * 100) + '%';
}

function getToastStack() {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        document.body.appendChild(stack);
    }
    return stack;
}

function showToast(message, type = 'success') {
    const stack = getToastStack();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 240);
    }, 2600);
}

function syncPlayerCaches(updatedPlayer) {
    allPlayers = allPlayers.map((player) =>
        player.id === updatedPlayer.id ? { ...player, display_name: updatedPlayer.display_name } : player
    );

    allDuos = allDuos.map((duo) => {
        if (duo.player1_id === updatedPlayer.id) {
            return { ...duo, player1_name: updatedPlayer.display_name };
        }
        if (duo.player2_id === updatedPlayer.id) {
            return { ...duo, player2_name: updatedPlayer.display_name };
        }
        return duo;
    });

    Object.keys(selectedPlayers).forEach((key) => {
        if (selectedPlayers[key]?.id === updatedPlayer.id) {
            selectedPlayers[key] = { ...selectedPlayers[key], display_name: updatedPlayer.display_name };
        }
    });

    Object.keys(selected1v1).forEach((key) => {
        if (selected1v1[key]?.id === updatedPlayer.id) {
            selected1v1[key] = { ...selected1v1[key], display_name: updatedPlayer.display_name };
        }
    });

    Object.keys(selectedDuos).forEach((key) => {
        const duo = selectedDuos[key];
        if (!duo) return;
        if (duo.player1_id === updatedPlayer.id) {
            selectedDuos[key] = { ...duo, player1_name: updatedPlayer.display_name };
            return;
        }
        if (duo.player2_id === updatedPlayer.id) {
            selectedDuos[key] = { ...duo, player2_name: updatedPlayer.display_name };
        }
    });
}

function renderSeasonInfo(season) {
    const lossPercent = Math.round(Number(season.loss_multiplier ?? 1) * 100);
    return `
        <div class="season-info">K: ${season.base_k_factor} | Duel direct ATK/DEF: x${season.rank_multiplier} | Equipes / Duo: x${season.duo_rank_multiplier} | Score: x${season.score_multiplier} | Defaite: ${lossPercent}%</div>
        <div class="season-info season-info-secondary">Solo : duel direct + ecart cumule des equipes + score. Double : meme logique ATK/DEF + ELO duo selon l'ecart de rang des duos. Le coeff defaite regle le pourcentage de points perdus.</div>
    `;
}

function renderCoeffHelp() {
    return `
        <div class="coeff-help">
            <div><strong>K Factor</strong> : base des gains et pertes ELO.</div>
            <div><strong>Duel direct ATK/DEF</strong> : poids de l'ecart entre les deux joueurs directement opposes.</div>
            <div><strong>Score Mult</strong> : poids de l'ecart au score.</div>
            <div><strong>Equipes / Duo</strong> : poids de l'ecart cumule des equipes en ATK/DEF, et de l'ecart de rang entre les deux duos en double.</div>
            <div><strong>Coeff defaite</strong> : pourcentage de points perdus par rapport a la perte normale. Exemple : 0.75 = 75% de la perte standard.</div>
        </div>
    `;
}

function renderMatchEloHelp() {
    if (matchMode === 'duo') {
        return `
            <div class="rule-card">
                <div class="rule-card-title">Regles ELO du double</div>
                <div class="rule-card-text">ATK / DEF : duel direct + ecart cumule des deux equipes + score.</div>
                <div class="rule-card-text">ELO duo : ecart de rang entre les deux duos + score.</div>
            </div>
        `;
    }
    if (matchMode === '1v1') {
        return `
            <div class="rule-card">
                <div class="rule-card-title">Regles ELO du 1v1</div>
                <div class="rule-card-text">L'ELO 1v1 depend du duel direct entre les deux joueurs et du score.</div>
            </div>
        `;
    }

    return `
        <div class="rule-card">
            <div class="rule-card-title">Regles ELO du solo</div>
            <div class="rule-card-text">L'ELO attaque et defense depend du duel direct, de l'ecart cumule des deux equipes et du score.</div>
        </div>
    `;
}

// ===== Navigation =====
let currentPage = 'home';

function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-bar button').forEach(b => b.classList.remove('active'));

    const pageEl = document.getElementById('page-' + page);
    const navBtn = document.querySelector(`[data-page="${page}"]`);

    if (pageEl) pageEl.classList.add('active');
    if (navBtn) navBtn.classList.add('active');

    currentPage = page;

    switch(page) {
        case 'home': loadHome(); break;
        case 'match': loadMatchPage(); break;
        case 'rankings': loadRankings(); break;
        case 'tournaments': loadTournaments(); break;
        case 'history': loadHistory(); break;
        case 'profile': loadProfile(); break;
        case 'admin': loadAdmin(); break;
    }
}

// ===== Auth =====
function showLogin() {
    document.getElementById('app-main').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-main').style.display = 'block';

    const player = getPlayer();
    document.getElementById('header-user').textContent = player?.display_name || '';

    const adminBtn = document.querySelector('[data-page="admin"]');
    if (adminBtn) adminBtn.style.display = player?.is_admin ? '' : 'none';

    navigate('home');
}

async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-id').value;
    const password = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';

    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });
        setToken(data.token);
        setPlayer(data.player);
        showApp();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const identifier = document.getElementById('reg-id').value;
    const password = document.getElementById('reg-pass').value;
    const display_name = document.getElementById('reg-name').value;
    const errEl = document.getElementById('reg-error');
    errEl.textContent = '';

    try {
        await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ identifier, password, display_name })
        });
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });
        setToken(data.token);
        setPlayer(data.player);
        showApp();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

function toggleLoginRegister() {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    loginForm.style.display = loginForm.style.display === 'none' ? '' : 'none';
    regForm.style.display = regForm.style.display === 'none' ? '' : 'none';
}

function logout() {
    clearToken();
    showLogin();
}

// ===== Home =====
async function loadHome() {
    const container = document.getElementById('home-content');
    try {
        const player = getPlayer();
        const stats = await api(`/players/${player.id}/stats`);
        const matches = await api(`/players/${player.id}/matches`);
        const season = await api('/seasons/active');

        let html = '';

        if (season) {
            html += `<div class="season-banner">
                <div>
                    <div class="season-name">${season.name}</div>
                    ${renderSeasonInfo(season)}
                </div>
            </div>`;
        }

        if (stats?.ratings) {
            const r = stats.ratings;
            html += `<div class="stats-grid stats-grid-4">
                <div class="stat-box">
                    <div class="label">Attaque</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_attack))}">${r.elo_attack}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_attack))}">${getRankName(r.elo_attack)}</div>
                    <div class="ranking-record">${r.wins_attack}V ${r.losses_attack}D</div>
                    <div class="winrate">WR: ${formatWinrate(r.wins_attack, r.losses_attack)}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Defense</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_defense))}">${r.elo_defense}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_defense))}">${getRankName(r.elo_defense)}</div>
                    <div class="ranking-record">${r.wins_defense}V ${r.losses_defense}D</div>
                    <div class="winrate">WR: ${formatWinrate(r.wins_defense, r.losses_defense)}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Duo</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_duo))}">${r.elo_duo}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_duo))}">${getRankName(r.elo_duo)}</div>
                    <div class="ranking-record">${r.wins_duo}V ${r.losses_duo}D</div>
                    <div class="winrate">WR: ${formatWinrate(r.wins_duo, r.losses_duo)}</div>
                </div>
                <div class="stat-box">
                    <div class="label">1v1</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_1v1))}">${r.elo_1v1}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_1v1))}">${getRankName(r.elo_1v1)}</div>
                    <div class="ranking-record">${r.wins_1v1}V ${r.losses_1v1}D</div>
                    <div class="winrate">WR: ${formatWinrate(r.wins_1v1, r.losses_1v1)}</div>
                </div>
            </div>`;

            // Winrate global
            const totalWins = r.wins_attack + r.wins_defense + r.wins_1v1;
            const totalLosses = r.losses_attack + r.losses_defense + r.losses_1v1;
            const totalGames = totalWins + totalLosses;
            if (totalGames > 0) {
                const wr = Math.round((totalWins / totalGames) * 100);
                html += `<div class="winrate-banner">
                    <span>Winrate global</span>
                    <span class="${wr >= 50 ? 'elo-positive' : 'elo-negative'}">${wr}%</span>
                    <span class="winrate-detail">${totalWins}V ${totalLosses}D (${totalGames} matchs)</span>
                </div>`;
            }
        }

        // Duo
        if (stats?.duo) {
            const d = stats.duo;
            html += `<div class="duo-card">
                <div class="duo-title">Duo de la saison</div>
                ${d.duo_name ? `<div class="duo-names" style="color:var(--gold)">${d.duo_name}</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${d.player1_name} & ${d.player2_name}</div>` : `<div class="duo-names">${d.player1_name} & ${d.player2_name}</div>`}
            </div>`;
        } else {
            html += `<div class="duo-card">
                <div class="duo-title">Pas de duo</div>
                <div style="font-size:13px;color:var(--text-secondary)">Choisissez votre partenaire duo dans l'onglet Profil</div>
            </div>`;
        }

        // Recent matches
        html += `<div class="section-title">Derniers matchs</div>`;
        if (matches.length === 0) {
            html += '<div class="empty-state">Aucun match joue</div>';
        } else {
            const playerId = player.id;
            for (const m of matches.slice(0, 10)) {
                html += renderMatchCard(m, playerId);
            }
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

function renderMatchCard(m, playerId) {
    const is1v1 = m.match_type === '1v1';

    if (is1v1) {
        const isP1 = m.team1_attack === playerId;
        const won = isP1 ? m.score_team1 > m.score_team2 : m.score_team2 > m.score_team1;
        const eloChange = isP1 ? m.elo_change_1v1_t1 : m.elo_change_1v1_t2;

        return `<div class="match-card ${playerId ? (won ? 'win' : 'loss') : ''}">
            <div class="match-header">
                <span class="match-type">1v1</span>
                <span class="match-date">${formatDate(m.played_at)}</span>
            </div>
            <div class="match-teams">
                <div class="match-team">
                    <div class="players">${m.t1_attack_name}</div>
                </div>
                <div class="match-score">${m.score_team1} - ${m.score_team2}</div>
                <div class="match-team">
                    <div class="players">${m.t2_attack_name}</div>
                </div>
            </div>
            ${playerId ? `<div class="match-elo-change">${formatEloChange(eloChange)}</div>` : ''}
        </div>`;
    }

    const isTeam1 = (m.team1_attack === playerId || m.team1_defense === playerId);
    const won = isTeam1 ? m.score_team1 > m.score_team2 : m.score_team2 > m.score_team1;
    let eloChange = 0;
    if (playerId) {
        if (m.team1_attack === playerId) eloChange = m.elo_change_t1_attack;
        else if (m.team1_defense === playerId) eloChange = m.elo_change_t1_defense;
        else if (m.team2_attack === playerId) eloChange = m.elo_change_t2_attack;
        else if (m.team2_defense === playerId) eloChange = m.elo_change_t2_defense;
    }

    return `<div class="match-card ${playerId ? (won ? 'win' : 'loss') : ''}">
        <div class="match-header">
            <span class="match-type">${m.match_type === 'duo' ? 'Duo' : 'Solo'}</span>
            <span class="match-date">${formatDate(m.played_at)}</span>
        </div>
        <div class="match-teams">
            <div class="match-team">
                <div class="players">${m.t1_attack_name}<br><small style="color:var(--text-muted)">${m.t1_defense_name}</small></div>
            </div>
            <div class="match-score">${m.score_team1} - ${m.score_team2}</div>
            <div class="match-team">
                <div class="players">${m.t2_attack_name}<br><small style="color:var(--text-muted)">${m.t2_defense_name}</small></div>
            </div>
        </div>
        ${playerId ? `<div class="match-elo-change">${formatEloChange(eloChange)}</div>` : ''}
    </div>`;
}

// ===== Rank Helper =====
function getRankName(elo) {
    const RANKS = [
        { name: 'Iron', min: 0 }, { name: 'Bronze', min: 400 }, { name: 'Silver', min: 800 },
        { name: 'Gold', min: 1200 }, { name: 'Platinum', min: 1600 }, { name: 'Diamond', min: 2000 },
        { name: 'Master', min: 2400 }, { name: 'Grandmaster', min: 2700 }, { name: 'Challenger', min: 3000 },
    ];
    let rank = RANKS[0];
    for (const r of RANKS) {
        if (elo >= r.min) rank = r;
    }
    const idx = RANKS.indexOf(rank);
    if (rank.min >= 2400) return rank.name;
    const nextMin = RANKS[idx + 1]?.min || rank.min + 400;
    const divSize = (nextMin - rank.min) / 4;
    const divIndex = Math.min(3, Math.floor((elo - rank.min) / divSize));
    return rank.name + ' ' + ['IV', 'III', 'II', 'I'][divIndex];
}

// ===== Match Recording =====
let allPlayers = [];
let allDuos = [];
let matchMode = 'solo'; // 'solo', 'duo', '1v1'
let selectedPlayers = { 't1-attack': null, 't1-defense': null, 't2-attack': null, 't2-defense': null };
let selectedDuos = { team1: null, team2: null };
let selected1v1 = { player1: null, player2: null };
let playerSearchesInitialized = false;

async function loadMatchPage() {
    try {
        [allPlayers, allDuos] = await Promise.all([
            api('/players'),
            api('/duos/all')
        ]);
        renderMatchForm();
    } catch (err) {
        document.getElementById('match-content').innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

function getDuoLabel(d) {
    return d.duo_name || `${d.player1_name} & ${d.player2_name}`;
}

function renderMatchForm() {
    const container = document.getElementById('match-content');

    container.innerHTML = `
        <div class="section-title">Enregistrer un match</div>
        <div class="mode-toggle mode-toggle-3">
            <button class="${matchMode === '1v1' ? 'active' : ''}" onclick="switchMatchMode('1v1')">1v1</button>
            <button class="${matchMode === 'solo' ? 'active' : ''}" onclick="switchMatchMode('solo')">Solo</button>
            <button class="${matchMode === 'duo' ? 'active' : ''}" onclick="switchMatchMode('duo')">Double</button>
        </div>
        ${renderMatchEloHelp()}
        <form id="match-form" onsubmit="submitMatch(event)">
            <div id="match-teams-container"></div>
            <div class="score-input">
                <input type="number" id="score1" min="0" max="20" value="0" inputmode="numeric">
                <span class="score-vs">VS</span>
                <input type="number" id="score2" min="0" max="20" value="0" inputmode="numeric">
            </div>
            <div id="match-error" class="error-msg"></div>
            <button type="submit" class="btn">Enregistrer le match</button>
        </form>
    `;

    renderTeamsContainer();
}

function switchMatchMode(mode) {
    matchMode = mode;
    selectedPlayers = { 't1-attack': null, 't1-defense': null, 't2-attack': null, 't2-defense': null };
    selectedDuos = { team1: null, team2: null };
    selected1v1 = { player1: null, player2: null };
    renderMatchForm();
}

function renderTeamsContainer() {
    const container = document.getElementById('match-teams-container');

    if (matchMode === '1v1') {
        container.innerHTML = `
            <div class="team-select">
                <h3>Joueur 1</h3>
                <div class="form-group">
                    ${render1v1PlayerSearch('player1')}
                </div>
            </div>
            <div class="team-select">
                <h3>Joueur 2</h3>
                <div class="form-group">
                    ${render1v1PlayerSearch('player2')}
                </div>
            </div>
        `;
        initAllPlayerSearches();
    } else if (matchMode === 'solo') {
        container.innerHTML = `
            <div class="team-select">
                <h3>Equipe 1</h3>
                <div class="form-group">
                    <label>Attaquant</label>
                    ${renderPlayerSearch('t1-attack')}
                </div>
                <div class="form-group">
                    <label>Defenseur</label>
                    ${renderPlayerSearch('t1-defense')}
                </div>
            </div>
            <div class="team-select">
                <h3>Equipe 2</h3>
                <div class="form-group">
                    <label>Attaquant</label>
                    ${renderPlayerSearch('t2-attack')}
                </div>
                <div class="form-group">
                    <label>Defenseur</label>
                    ${renderPlayerSearch('t2-defense')}
                </div>
            </div>
        `;
        initAllPlayerSearches();
    } else {
        container.innerHTML = `
            <div class="team-select">
                <h3>Equipe 1</h3>
                <div id="duo-select-1">${renderDuoSelect('team1')}</div>
            </div>
            <div class="team-select">
                <h3>Equipe 2</h3>
                <div id="duo-select-2">${renderDuoSelect('team2')}</div>
            </div>
        `;
    }
}

// ===== Player Search Component =====
function renderPlayerSearch(fieldId) {
    const selected = selectedPlayers[fieldId];
    if (selected) {
        return `<div class="selected-player">
            ${selected.display_name}
            <span class="remove-player" onclick="clearPlayerSearch('${fieldId}')">&times;</span>
        </div>
        <input type="hidden" id="${fieldId}" value="${selected.id}">`;
    }
    return `<div class="player-search-wrapper">
        <input type="text" class="player-search-input" id="search-${fieldId}"
               placeholder="Rechercher un joueur..." autocomplete="off"
               oninput="onPlayerSearch('${fieldId}', this.value)"
               onfocus="onPlayerSearch('${fieldId}', this.value)">
        <div class="player-search-results" id="results-${fieldId}"></div>
        <input type="hidden" id="${fieldId}" value="">
    </div>`;
}

function render1v1PlayerSearch(fieldId) {
    const selected = selected1v1[fieldId];
    if (selected) {
        return `<div class="selected-player">
            ${selected.display_name}
            <span class="remove-player" onclick="clear1v1Player('${fieldId}')">&times;</span>
        </div>`;
    }
    return `<div class="player-search-wrapper">
        <input type="text" class="player-search-input" id="search-${fieldId}"
               placeholder="Rechercher un joueur..." autocomplete="off"
               oninput="on1v1PlayerSearch('${fieldId}', this.value)"
               onfocus="on1v1PlayerSearch('${fieldId}', this.value)">
        <div class="player-search-results" id="results-${fieldId}"></div>
    </div>`;
}

function initAllPlayerSearches() {
    if (playerSearchesInitialized) return;
    playerSearchesInitialized = true;

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.player-search-wrapper')) {
            document.querySelectorAll('.player-search-results').forEach(el => el.classList.remove('open'));
        }
    });
}

function onPlayerSearch(fieldId, query) {
    const resultsEl = document.getElementById('results-' + fieldId);
    if (!resultsEl) return;

    const usedIds = Object.values(selectedPlayers).filter(p => p).map(p => p.id);
    const q = query.toLowerCase().trim();
    const filtered = allPlayers.filter(p =>
        !usedIds.includes(p.id) && (q === '' || p.display_name.toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
        resultsEl.innerHTML = '<div class="player-search-option" style="color:var(--text-muted)">Aucun joueur</div>';
    } else {
        resultsEl.innerHTML = filtered.map(p =>
            `<div class="player-search-option" onclick="selectPlayer('${fieldId}', ${p.id})">${p.display_name}</div>`
        ).join('');
    }
    resultsEl.classList.add('open');
}

function on1v1PlayerSearch(fieldId, query) {
    const resultsEl = document.getElementById('results-' + fieldId);
    if (!resultsEl) return;

    const usedIds = Object.values(selected1v1).filter(p => p).map(p => p.id);
    const q = query.toLowerCase().trim();
    const filtered = allPlayers.filter(p =>
        !usedIds.includes(p.id) && (q === '' || p.display_name.toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
        resultsEl.innerHTML = '<div class="player-search-option" style="color:var(--text-muted)">Aucun joueur</div>';
    } else {
        resultsEl.innerHTML = filtered.map(p =>
            `<div class="player-search-option" onclick="select1v1Player('${fieldId}', ${p.id})">${p.display_name}</div>`
        ).join('');
    }
    resultsEl.classList.add('open');
}

function selectPlayer(fieldId, playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    selectedPlayers[fieldId] = player;
    renderTeamsContainer();
}

function clearPlayerSearch(fieldId) {
    selectedPlayers[fieldId] = null;
    renderTeamsContainer();
}

function select1v1Player(fieldId, playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    selected1v1[fieldId] = player;
    renderTeamsContainer();
}

function clear1v1Player(fieldId) {
    selected1v1[fieldId] = null;
    renderTeamsContainer();
}

// ===== Duo Select Component =====
function renderDuoSelect(teamKey) {
    const otherSelected = teamKey === 'team1' ? selectedDuos.team2 : selectedDuos.team1;
    const currentSelected = selectedDuos[teamKey];

    const availableDuos = allDuos.filter(d => !otherSelected || d.id !== otherSelected.id);

    if (currentSelected) {
        return `<div class="duo-select-item selected" onclick="clearDuo('${teamKey}')">
            <div>
                <div class="duo-select-name">${getDuoLabel(currentSelected)}</div>
                <div class="duo-select-players">${currentSelected.player1_name} (ATK) & ${currentSelected.player2_name} (DEF)</div>
            </div>
            <span style="color:var(--red);font-size:18px;font-weight:700">&times;</span>
        </div>`;
    }

    if (availableDuos.length === 0) {
        return '<div class="empty-state" style="padding:16px">Aucun duo disponible</div>';
    }

    return `<input type="text" class="search-input" placeholder="Rechercher un duo..."
                oninput="filterDuos('${teamKey}', this.value)">
            <div id="duo-list-${teamKey}">
                ${availableDuos.map(d => `
                    <div class="duo-select-item" onclick="selectDuo('${teamKey}', ${d.id})">
                        <div>
                            <div class="duo-select-name">${getDuoLabel(d)}</div>
                            <div class="duo-select-players">${d.player1_name} & ${d.player2_name}</div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
}

function filterDuos(teamKey, query) {
    const otherSelected = teamKey === 'team1' ? selectedDuos.team2 : selectedDuos.team1;
    const q = query.toLowerCase().trim();
    const listEl = document.getElementById('duo-list-' + teamKey);
    if (!listEl) return;

    const availableDuos = allDuos.filter(d =>
        (!otherSelected || d.id !== otherSelected.id) &&
        (q === '' ||
         getDuoLabel(d).toLowerCase().includes(q) ||
         d.player1_name.toLowerCase().includes(q) ||
         d.player2_name.toLowerCase().includes(q))
    );

    listEl.innerHTML = availableDuos.map(d => `
        <div class="duo-select-item" onclick="selectDuo('${teamKey}', ${d.id})">
            <div>
                <div class="duo-select-name">${getDuoLabel(d)}</div>
                <div class="duo-select-players">${d.player1_name} & ${d.player2_name}</div>
            </div>
        </div>
    `).join('') || '<div class="empty-state" style="padding:12px">Aucun duo trouve</div>';
}

function selectDuo(teamKey, duoId) {
    const duo = allDuos.find(d => d.id === duoId);
    if (!duo) return;
    selectedDuos[teamKey] = duo;
    document.getElementById('duo-select-1').innerHTML = renderDuoSelect('team1');
    document.getElementById('duo-select-2').innerHTML = renderDuoSelect('team2');
}

function clearDuo(teamKey) {
    selectedDuos[teamKey] = null;
    document.getElementById('duo-select-1').innerHTML = renderDuoSelect('team1');
    document.getElementById('duo-select-2').innerHTML = renderDuoSelect('team2');
}

async function submitMatch(e) {
    e.preventDefault();
    const errEl = document.getElementById('match-error');
    errEl.textContent = '';

    const score1 = parseInt(document.getElementById('score1').value);
    const score2 = parseInt(document.getElementById('score2').value);

    if (score1 === score2) {
        errEl.textContent = 'Pas de match nul !';
        return;
    }

    if (matchMode === '1v1') {
        if (!selected1v1.player1 || !selected1v1.player2) {
            errEl.textContent = 'Selectionnez les 2 joueurs';
            return;
        }
        if (selected1v1.player1.id === selected1v1.player2.id) {
            errEl.textContent = 'Les 2 joueurs doivent etre differents';
            return;
        }
        try {
            const result = await api('/matches/1v1', {
                method: 'POST',
                body: JSON.stringify({
                    player1: selected1v1.player1.id,
                    player2: selected1v1.player2.id,
                    score_player1: score1,
                    score_player2: score2,
                })
            });
            show1v1EloResult(result);
        } catch (err) {
            errEl.textContent = err.message;
        }
        return;
    }

    let data;

    if (matchMode === 'duo') {
        if (!selectedDuos.team1 || !selectedDuos.team2) {
            errEl.textContent = 'Selectionnez les deux duos';
            return;
        }
        data = {
            team1_attack: selectedDuos.team1.player1_id,
            team1_defense: selectedDuos.team1.player2_id,
            team2_attack: selectedDuos.team2.player1_id,
            team2_defense: selectedDuos.team2.player2_id,
            score_team1: score1,
            score_team2: score2,
        };
    } else {
        const t1a = selectedPlayers['t1-attack'];
        const t1d = selectedPlayers['t1-defense'];
        const t2a = selectedPlayers['t2-attack'];
        const t2d = selectedPlayers['t2-defense'];

        if (!t1a || !t1d || !t2a || !t2d) {
            errEl.textContent = 'Selectionnez les 4 joueurs';
            return;
        }

        data = {
            team1_attack: t1a.id,
            team1_defense: t1d.id,
            team2_attack: t2a.id,
            team2_defense: t2d.id,
            score_team1: score1,
            score_team2: score2,
        };
    }

    const ids = [data.team1_attack, data.team1_defense, data.team2_attack, data.team2_defense];
    if (new Set(ids).size !== 4) {
        errEl.textContent = 'Les 4 joueurs doivent etre differents';
        return;
    }

    try {
        const result = await api('/matches', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        showEloResult(result, data);
    } catch (err) {
        errEl.textContent = err.message;
    }
}

function show1v1EloResult(result) {
    const changes = result.elo_changes;
    const getName = (field) => selected1v1[field]?.display_name || '?';

    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.innerHTML = `
        <div class="elo-result-box">
            <h2>Match 1v1 enregistre !</h2>
            <div class="section-title">Changements ELO 1v1</div>
            <div class="elo-result-item">
                <span>${getName('player1')}</span>
                ${formatEloChange(changes.elo_change_1v1_t1)}
            </div>
            <div class="elo-result-item">
                <span>${getName('player2')}</span>
                ${formatEloChange(changes.elo_change_1v1_t2)}
            </div>
            <button class="btn" style="margin-top:16px" onclick="this.closest('.elo-result-overlay').remove()">OK</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function showEloResult(result, matchData) {
    const changes = result.elo_changes;
    const getName = (id) => allPlayers.find(p => p.id === id)?.display_name || '?';

    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.innerHTML = `
        <div class="elo-result-box">
            <h2>Match enregistre !</h2>
            <div style="font-size:24px;font-weight:800;margin:8px 0;">${matchData.score_team1} - ${matchData.score_team2}</div>
            ${result.is_duo ? '<div style="font-size:11px;color:var(--gold);margin-bottom:8px;">MATCH DUO</div>' : ''}
            <div class="section-title">Changements ELO ATK / DEF</div>
            <div class="result-help">Calcules avec le duel direct, l'ecart cumule des deux equipes et le score.</div>
            <div class="elo-result-item">
                <span>${getName(matchData.team1_attack)} (ATK)</span>
                ${formatEloChange(changes.elo_change_t1_attack)}
            </div>
            <div class="elo-result-item">
                <span>${getName(matchData.team1_defense)} (DEF)</span>
                ${formatEloChange(changes.elo_change_t1_defense)}
            </div>
            <div class="elo-result-item">
                <span>${getName(matchData.team2_attack)} (ATK)</span>
                ${formatEloChange(changes.elo_change_t2_attack)}
            </div>
            <div class="elo-result-item">
                <span>${getName(matchData.team2_defense)} (DEF)</span>
                ${formatEloChange(changes.elo_change_t2_defense)}
            </div>
            ${result.is_duo ? `
                <div class="section-title">ELO Duo</div>
                <div class="result-help">Calcule avec l'ecart de rang entre les deux duos et le score.</div>
                <div class="elo-result-item">
                    <span>Equipe 1</span>
                    ${formatEloChange(changes.elo_change_duo_t1)}
                </div>
                <div class="elo-result-item">
                    <span>Equipe 2</span>
                    ${formatEloChange(changes.elo_change_duo_t2)}
                </div>
            ` : ''}
            <button class="btn" style="margin-top:16px" onclick="this.closest('.elo-result-overlay').remove()">OK</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ===== Rankings =====
let rankingType = 'global';
let rankingData = [];

async function loadRankings() {
    renderRankingTabs();
    await fetchRankings(rankingType);
}

function renderRankingTabs() {
    document.getElementById('ranking-tabs').innerHTML = `
        <button class="${rankingType === 'global' ? 'active' : ''}" onclick="switchRanking('global')">Global</button>
        <button class="${rankingType === 'attack' ? 'active' : ''}" onclick="switchRanking('attack')">Attaque</button>
        <button class="${rankingType === 'defense' ? 'active' : ''}" onclick="switchRanking('defense')">Defense</button>
        <button class="${rankingType === 'duo' ? 'active' : ''}" onclick="switchRanking('duo')">Duo</button>
        <button class="${rankingType === '1v1' ? 'active' : ''}" onclick="switchRanking('1v1')">1v1</button>
    `;
}

async function switchRanking(type) {
    rankingType = type;
    renderRankingTabs();
    await fetchRankings(type);
}

async function fetchRankings(type) {
    const container = document.getElementById('ranking-list');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        rankingData = await api(`/rankings/${type}`);

        const searchEl = document.getElementById('ranking-search');
        if (searchEl) searchEl.value = '';

        renderRankingList(rankingData);
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

function filterRankings(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderRankingList(rankingData);
        return;
    }
    const filtered = rankingData.filter(r => {
        if (rankingType === 'duo') {
            const name = r.duo_name || `${r.player1_name} & ${r.player2_name}`;
            return name.toLowerCase().includes(q) ||
                   r.player1_name.toLowerCase().includes(q) ||
                   r.player2_name.toLowerCase().includes(q);
        }
        return r.display_name.toLowerCase().includes(q);
    });
    renderRankingList(filtered);
}

function renderRankingList(data) {
    const container = document.getElementById('ranking-list');
    if (data.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun resultat</div>';
        return;
    }

    let html = '';
    for (const r of data) {
        const posClass = r.position <= 3 ? `top${r.position}` : '';

        if (rankingType === 'global') {
            const colorClass = getRankColorClass(r.rank.name);
            html += `<div class="ranking-item">
                <div class="ranking-pos ${posClass}">#${r.position}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${r.display_name}</div>
                    <div class="ranking-record">ATK ${r.elo_attack} | DEF ${r.elo_defense} | 1v1 ${r.elo_1v1}</div>
                </div>
                <div class="ranking-elo">
                    <div class="elo-value rank-${colorClass}">${r.elo}</div>
                    <div class="rank-badge badge-${colorClass}">${r.rank.name}</div>
                </div>
            </div>`;
        } else {
            const colorClass = getRankColorClass(r.rank.name);
            const total = r.wins + r.losses;
            const wr = total > 0 ? Math.round((r.wins / total) * 100) + '%' : '-';
            let name;
            if (rankingType === 'duo') {
                name = r.duo_name
                    ? `<span style="color:var(--gold)">${r.duo_name}</span><br><small style="color:var(--text-muted)">${r.player1_name} & ${r.player2_name}</small>`
                    : `${r.player1_name} & ${r.player2_name}`;
            } else {
                name = r.display_name;
            }

            html += `<div class="ranking-item">
                <div class="ranking-pos ${posClass}">#${r.position}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${name}</div>
                    <div class="ranking-record">${r.wins}V ${r.losses}D | WR: ${wr}</div>
                </div>
                <div class="ranking-elo">
                    <div class="elo-value rank-${colorClass}">${r.elo}</div>
                    <div class="rank-badge badge-${colorClass}">${r.rank.name}</div>
                </div>
            </div>`;
        }
    }
    container.innerHTML = html;
}

// ===== History (all matches) =====
let historyPage = 1;

async function loadHistory(page) {
    historyPage = page || 1;
    const container = document.getElementById('history-content');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const data = await api(`/matches/history?page=${historyPage}`);
        const player = getPlayer();

        let html = `<div class="section-title">Historique des matchs (${data.total} total)</div>`;

        if (data.matches.length === 0) {
            html += '<div class="empty-state">Aucun match joue</div>';
        } else {
            for (const m of data.matches) {
                html += renderMatchCard(m, player.id);
            }
        }

        // Pagination
        if (data.totalPages > 1) {
            html += '<div class="pagination">';
            if (historyPage > 1) {
                html += `<button class="btn btn-small btn-secondary" onclick="loadHistory(${historyPage - 1})">Precedent</button>`;
            }
            html += `<span class="pagination-info">Page ${data.page} / ${data.totalPages}</span>`;
            if (historyPage < data.totalPages) {
                html += `<button class="btn btn-small btn-secondary" onclick="loadHistory(${historyPage + 1})">Suivant</button>`;
            }
            html += '</div>';
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

// ===== Profile =====
async function loadProfile() {
    const container = document.getElementById('profile-content');
    try {
        const player = getPlayer();
        const [duo, players, me] = await Promise.all([
            api('/duos/mine'),
            api('/players'),
            api('/auth/me')
        ]);

        // Refresh player data from server
        setPlayer(me);
        document.getElementById('header-user').textContent = me.display_name;

        let html = `<div class="card">
            <div class="card-title">Mon profil</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:4px">${me.display_name}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">ID: ${me.id}</div>
            <form onsubmit="changeDisplayName(event)" style="display:flex;gap:8px;align-items:flex-end">
                <div class="form-group" style="flex:1;margin-bottom:0">
                    <label>Changer de pseudo</label>
                    <input type="text" id="new-display-name" placeholder="Nouveau pseudo" value="${me.display_name}" maxlength="30">
                </div>
                <button type="submit" class="btn btn-small" style="height:40px">OK</button>
            </form>
            <div id="name-msg" class="success-msg" style="margin-top:8px"></div>
        </div>`;

        // Duo
        html += `<div class="card"><div class="card-title">Mon duo de saison</div>`;
        if (duo) {
            html += `<div class="duo-card" style="margin:0">
                ${duo.duo_name ? `<div class="duo-names" style="color:var(--gold)">${duo.duo_name}</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${duo.player1_name} & ${duo.player2_name}</div>` : `<div class="duo-names">${duo.player1_name} & ${duo.player2_name}</div>`}
                <div class="duo-warning">Le duo ne peut pas etre change pendant la saison</div>
            </div>`;
        } else {
            const available = players.filter(p => p.id !== me.id);
            html += `<form onsubmit="createDuo(event)">
                <div class="form-group">
                    <label>Nom du duo</label>
                    <input type="text" id="duo-name" placeholder="Ex: Les Invincibles (optionnel)">
                </div>
                <div class="form-group">
                    <label>Choisir un partenaire</label>
                    <select id="duo-partner">${available.map(p => `<option value="${p.id}">${p.display_name}</option>`).join('')}</select>
                </div>
                <div class="duo-warning" style="margin-bottom:12px">Attention : vous ne pourrez plus changer de duo pour toute la saison !</div>
                <div id="duo-error" class="error-msg"></div>
                <button type="submit" class="btn">Confirmer le duo</button>
            </form>`;
        }
        html += `</div>`;

        html += `<button class="btn btn-secondary" onclick="logout()" style="margin-top:16px">Deconnexion</button>`;

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

async function changeDisplayName(e) {
    e.preventDefault();
    const nameEl = document.getElementById('new-display-name');
    const msgEl = document.getElementById('name-msg');
    msgEl.textContent = '';
    msgEl.className = 'success-msg';

    try {
        const result = await api('/auth/display-name', {
            method: 'PUT',
            body: JSON.stringify({ display_name: nameEl.value.trim() })
        });

        setPlayer(result.player);
        syncPlayerCaches(result.player);
        document.getElementById('header-user').textContent = result.player.display_name;
        showToast('Pseudo mis a jour');
        await loadProfile();
    } catch (err) {
        msgEl.className = 'error-msg';
        msgEl.textContent = err.message;
    }
}

async function createDuo(e) {
    e.preventDefault();
    const errEl = document.getElementById('duo-error');
    errEl.textContent = '';
    const partner_id = parseInt(document.getElementById('duo-partner').value);
    const duo_name = document.getElementById('duo-name').value.trim();

    try {
        await api('/duos', {
            method: 'POST',
            body: JSON.stringify({ partner_id, duo_name: duo_name || undefined })
        });
        loadProfile();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

// ===== Admin =====
async function loadAdmin() {
    const container = document.getElementById('admin-content');
    const player = getPlayer();
    if (!player?.is_admin) {
        container.innerHTML = '<div class="empty-state">Acces refuse</div>';
        return;
    }

    try {
        const [stats, seasons, players, adminMatches, adminDuos] = await Promise.all([
            api('/admin/stats'),
            api('/seasons'),
            api('/admin/players'),
            api('/admin/matches'),
            api('/admin/duos')
        ]);

        let html = '';

        // Stats
        html += `<div class="admin-section">
            <h2>Dashboard</h2>
            <div class="stats-grid">
                <div class="stat-box"><div class="label">Joueurs</div><div class="value">${stats.total_players}</div></div>
                <div class="stat-box"><div class="label">Matchs</div><div class="value">${stats.matches_this_season}</div></div>
                <div class="stat-box"><div class="label">Duos</div><div class="value">${stats.duos_this_season}</div></div>
            </div>
        </div>`;

        // Saisons
        html += `<div class="admin-section"><h2>Saisons</h2>`;
        html += `<form onsubmit="createSeason(event)" style="margin-bottom:16px">
            <div class="form-group"><label>Nouvelle saison</label><input id="new-season-name" placeholder="Nom de la saison" required></div>
            <div class="coeff-grid" style="margin-bottom:12px">
                <div class="form-group"><label>K Factor</label><input id="new-k" type="number" step="0.01" value="32"></div>
                <div class="form-group"><label>Duel direct ATK/DEF</label><input id="new-rank" type="number" step="0.01" value="1.5"></div>
                <div class="form-group"><label>Score Mult</label><input id="new-score" type="number" step="0.01" value="0.1"></div>
                <div class="form-group"><label>Equipes / Duo</label><input id="new-duo-rank" type="number" step="0.01" value="1.3"></div>
                <div class="form-group"><label>Coeff defaite</label><input id="new-loss" type="number" step="0.01" min="0" value="1"></div>
            </div>
            ${renderCoeffHelp()}
            <button type="submit" class="btn btn-small">Creer la saison</button>
        </form>`;

        for (const s of seasons) {
            const lossPercent = Math.round(Number(s.loss_multiplier ?? 1) * 100);
            html += `<div class="card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong>${s.name}</strong> ${s.is_active ? '<span class="admin-badge">Active</span>' : ''}
                    <div style="font-size:11px;color:var(--text-muted)">K:${s.base_k_factor} | Duel:${s.rank_multiplier} | Score:${s.score_multiplier} | Equipes/Duo:${s.duo_rank_multiplier} | Defaite:${lossPercent}%</div>
                </div>
                <div>
                    ${!s.is_active ? `<button class="btn btn-small" onclick="activateSeason(${s.id})">Activer</button>` : ''}
                    ${s.is_active ? `<button class="btn btn-small btn-danger" onclick="endSeason(${s.id})">Terminer</button>` : ''}
                </div>
            </div>`;
        }
        html += `</div>`;

        // Modifier coefficients saison active
        if (stats.active_season) {
            const as = stats.active_season;
            html += `<div class="admin-section"><h2>Coefficients (${as.name})</h2>
                <form onsubmit="updateCoeffs(event, ${as.id})">
                    <div class="form-group"><label>Nom</label><input id="edit-name" value="${as.name}"></div>
                    <div class="coeff-grid" style="margin-bottom:12px">
                        <div class="form-group"><label>K Factor</label><input id="edit-k" type="number" step="0.01" value="${as.base_k_factor}"></div>
                        <div class="form-group"><label>Duel direct ATK/DEF</label><input id="edit-rank" type="number" step="0.01" value="${as.rank_multiplier}"></div>
                        <div class="form-group"><label>Score Mult</label><input id="edit-score" type="number" step="0.01" value="${as.score_multiplier}"></div>
                        <div class="form-group"><label>Equipes / Duo</label><input id="edit-duo-rank" type="number" step="0.01" value="${as.duo_rank_multiplier}"></div>
                        <div class="form-group"><label>Coeff defaite</label><input id="edit-loss" type="number" step="0.01" min="0" value="${as.loss_multiplier ?? 1}"></div>
                    </div>
                    ${renderCoeffHelp()}
                    <button type="submit" class="btn btn-small">Sauvegarder</button>
                </form>
            </div>`;
        }

        // Gestion matchs (annulation)
        html += `<div class="admin-section"><h2>Matchs recents</h2>`;
        for (const m of adminMatches.slice(0, 30)) {
            const is1v1 = m.match_type === '1v1';
            const cancelled = m.is_cancelled;
            html += `<div class="match-admin-item ${cancelled ? 'cancelled' : ''}">
                <div>
                    <span class="match-type">${m.match_type.toUpperCase()}</span>
                    <span class="match-date">${formatDate(m.played_at)}</span>
                    ${cancelled ? '<span class="admin-badge" style="background:rgba(255,70,85,0.2);color:var(--red)">Annule</span>' : ''}
                </div>
                <div style="font-size:13px;margin-top:4px">
                    ${is1v1
                        ? `${m.t1_attack_name} ${m.score_team1} - ${m.score_team2} ${m.t2_attack_name}`
                        : `${m.t1_attack_name} & ${m.t1_defense_name} ${m.score_team1} - ${m.score_team2} ${m.t2_attack_name} & ${m.t2_defense_name}`
                    }
                </div>
                ${!cancelled ? `<button class="btn btn-small btn-danger" style="margin-top:6px" onclick="cancelMatch(${m.id})">Annuler ce match</button>` : ''}
            </div>`;
        }
        html += `</div>`;

        // Joueurs (avec modification ELO et suppression)
        html += `<div class="admin-section"><h2>Joueurs</h2>`;
        for (const p of players) {
            html += `<div class="player-list-item">
                <div>
                    <span class="name">${p.display_name}</span>
                    ${p.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                    <div class="id-badge">${p.identifier}</div>
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
                    <button class="btn btn-small btn-secondary" onclick="toggleAdmin(${p.id}, ${p.is_admin ? 0 : 1})">${p.is_admin ? 'Retirer admin' : 'Promouvoir'}</button>
                    <button class="btn btn-small btn-secondary" onclick="resetPassword(${p.id})">Reset MDP</button>
                    <button class="btn btn-small" onclick="showEditElo(${p.id}, '${p.display_name.replace(/'/g, "\\'")}')">Modifier ELO</button>
                    <button class="btn btn-small btn-danger" onclick="deletePlayer(${p.id}, '${p.display_name.replace(/'/g, "\\'")}')">Supprimer</button>
                </div>
            </div>`;
        }
        html += `</div>`;

        // Duos (avec suppression)
        html += `<div class="admin-section"><h2>Duos</h2>`;
        for (const d of adminDuos) {
            html += `<div class="player-list-item">
                <div>
                    ${d.duo_name ? `<span class="name" style="color:var(--gold)">${d.duo_name}</span> - ` : ''}
                    <span class="name">${d.player1_name} & ${d.player2_name}</span>
                </div>
                <button class="btn btn-small btn-danger" onclick="deleteDuo(${d.id})">Supprimer</button>
            </div>`;
        }
        if (adminDuos.length === 0) {
            html += '<div class="empty-state" style="padding:12px">Aucun duo</div>';
        }
        html += `</div>`;

        html += `<div id="admin-msg" class="success-msg"></div>`;

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

async function createSeason(e) {
    e.preventDefault();
    try {
        await api('/seasons', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('new-season-name').value,
                base_k_factor: parseFloat(document.getElementById('new-k').value),
                rank_multiplier: parseFloat(document.getElementById('new-rank').value),
                score_multiplier: parseFloat(document.getElementById('new-score').value),
                duo_rank_multiplier: parseFloat(document.getElementById('new-duo-rank').value),
                loss_multiplier: parseFloat(document.getElementById('new-loss').value)
            })
        });
        await loadAdmin();
        showToast('Saison creee');
    } catch (err) {
        alert(err.message);
    }
}

async function activateSeason(id) {
    try {
        await api(`/seasons/${id}/activate`, { method: 'PUT' });
        await loadAdmin();
        showToast('Saison activee');
    } catch (err) { alert(err.message); }
}

async function endSeason(id) {
    if (!confirm('Terminer cette saison ?')) return;
    try {
        await api(`/seasons/${id}/end`, { method: 'PUT' });
        await loadAdmin();
        showToast('Saison terminee');
    } catch (err) { alert(err.message); }
}

async function updateCoeffs(e, id) {
    e.preventDefault();
    try {
        await api(`/seasons/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: document.getElementById('edit-name').value,
                base_k_factor: parseFloat(document.getElementById('edit-k').value),
                rank_multiplier: parseFloat(document.getElementById('edit-rank').value),
                score_multiplier: parseFloat(document.getElementById('edit-score').value),
                duo_rank_multiplier: parseFloat(document.getElementById('edit-duo-rank').value),
                loss_multiplier: parseFloat(document.getElementById('edit-loss').value)
            })
        });
        await loadAdmin();
        showToast('Coefficients de saison mis a jour');
    } catch (err) { alert(err.message); }
}

async function toggleAdmin(id, val) {
    try {
        await api(`/admin/players/${id}/admin`, { method: 'PUT', body: JSON.stringify({ is_admin: val }) });
        loadAdmin();
    } catch (err) { alert(err.message); }
}

async function resetPassword(id) {
    const newPass = prompt('Nouveau mot de passe (min 4 car.):');
    if (!newPass) return;
    try {
        await api(`/admin/players/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ new_password: newPass }) });
        alert('Mot de passe reinitialise');
    } catch (err) { alert(err.message); }
}

async function cancelMatch(matchId) {
    if (!confirm('Annuler ce match ? Les changements ELO seront inverses.')) return;
    try {
        await api(`/admin/matches/${matchId}/cancel`, { method: 'PUT' });
        loadAdmin();
    } catch (err) { alert(err.message); }
}

function showEditElo(playerId, playerName) {
    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.innerHTML = `
        <div class="elo-result-box">
            <h2>Modifier ELO</h2>
            <div style="font-size:14px;color:var(--text-secondary);margin-bottom:12px">${playerName}</div>
            <form onsubmit="submitEditElo(event, ${playerId})">
                <div class="form-group">
                    <label>ELO Attaque</label>
                    <input type="number" id="edit-elo-attack" placeholder="Laisser vide pour ne pas modifier">
                </div>
                <div class="form-group">
                    <label>ELO Defense</label>
                    <input type="number" id="edit-elo-defense" placeholder="Laisser vide pour ne pas modifier">
                </div>
                <div class="form-group">
                    <label>ELO Duo</label>
                    <input type="number" id="edit-elo-duo" placeholder="Laisser vide pour ne pas modifier">
                </div>
                <div class="form-group">
                    <label>ELO 1v1</label>
                    <input type="number" id="edit-elo-1v1" placeholder="Laisser vide pour ne pas modifier">
                </div>
                <div id="edit-elo-error" class="error-msg"></div>
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button type="submit" class="btn">Sauvegarder</button>
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.elo-result-overlay').remove()">Annuler</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function submitEditElo(e, playerId) {
    e.preventDefault();
    const data = {};
    const attack = document.getElementById('edit-elo-attack').value;
    const defense = document.getElementById('edit-elo-defense').value;
    const duo = document.getElementById('edit-elo-duo').value;
    const elo1v1 = document.getElementById('edit-elo-1v1').value;

    if (attack !== '') data.elo_attack = parseInt(attack);
    if (defense !== '') data.elo_defense = parseInt(defense);
    if (duo !== '') data.elo_duo = parseInt(duo);
    if (elo1v1 !== '') data.elo_1v1 = parseInt(elo1v1);

    if (Object.keys(data).length === 0) {
        document.getElementById('edit-elo-error').textContent = 'Entrez au moins une valeur';
        return;
    }

    try {
        await api(`/admin/players/${playerId}/elo`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        document.querySelector('.elo-result-overlay')?.remove();
        loadAdmin();
    } catch (err) {
        document.getElementById('edit-elo-error').textContent = err.message;
    }
}

async function deletePlayer(playerId, playerName) {
    if (!confirm(`Supprimer le compte de "${playerName}" ? Cette action est irreversible.`)) return;
    try {
        await api(`/admin/players/${playerId}`, { method: 'DELETE' });
        loadAdmin();
    } catch (err) { alert(err.message); }
}

async function deleteDuo(duoId) {
    if (!confirm('Supprimer ce duo ?')) return;
    try {
        await api(`/admin/duos/${duoId}`, { method: 'DELETE' });
        loadAdmin();
    } catch (err) { alert(err.message); }
}

// ===== Tournaments =====
let currentTournamentView = 'list'; // 'list' or 'detail'
let currentTournamentId = null;

async function loadTournaments() {
    currentTournamentView = 'list';
    currentTournamentId = null;
    const container = document.getElementById('tournaments-content');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const tournaments = await api('/tournaments');
        const player = getPlayer();

        let html = `<div class="section-title">Tournois</div>`;

        if (player?.is_admin) {
            html += `<div class="card">
                <div class="card-title">Creer un tournoi</div>
                <form onsubmit="createTournament(event)">
                    <div class="form-group">
                        <label>Nom du tournoi</label>
                        <input type="text" id="tournament-name" placeholder="Ex: Tournoi de Noel" required>
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <div class="mode-toggle">
                            <button type="button" class="active" id="tourney-type-simple" onclick="setTourneyType('simple')">Simple (1v1)</button>
                            <button type="button" id="tourney-type-double" onclick="setTourneyType('double')">Double (Duo)</button>
                        </div>
                        <input type="hidden" id="tournament-type" value="simple">
                    </div>
                    <div class="form-group">
                        <label>Participants max</label>
                        <select id="tournament-max">
                            <option value="4">4</option>
                            <option value="8" selected>8</option>
                            <option value="16">16</option>
                            <option value="32">32</option>
                        </select>
                    </div>
                    <div id="tournament-create-error" class="error-msg"></div>
                    <button type="submit" class="btn">Creer le tournoi</button>
                </form>
            </div>`;
        }

        if (tournaments.length === 0) {
            html += '<div class="empty-state">Aucun tournoi cette saison</div>';
        } else {
            for (const t of tournaments) {
                const statusLabel = {
                    'registration': 'Inscriptions ouvertes',
                    'in_progress': 'En cours',
                    'completed': 'Termine',
                    'cancelled': 'Annule'
                }[t.status];
                const statusClass = {
                    'registration': 'status-registration',
                    'in_progress': 'status-inprogress',
                    'completed': 'status-completed',
                    'cancelled': 'status-cancelled'
                }[t.status];
                const typeLabel = t.tournament_type === 'simple' ? '1v1' : 'Duo';

                html += `<div class="tournament-card" onclick="viewTournament(${t.id})">
                    <div class="tournament-card-header">
                        <div>
                            <div class="tournament-name">${t.name}</div>
                            <div class="tournament-meta">
                                <span class="tournament-type-badge">${typeLabel}</span>
                                <span>${t.participant_count}/${t.max_participants} participants</span>
                            </div>
                        </div>
                        <span class="tournament-status ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="tournament-card-footer">
                        <span>Par ${t.created_by_name}</span>
                        <span>${formatDate(t.created_at)}</span>
                    </div>
                </div>`;
            }
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

function setTourneyType(type) {
    document.getElementById('tournament-type').value = type;
    document.getElementById('tourney-type-simple').classList.toggle('active', type === 'simple');
    document.getElementById('tourney-type-double').classList.toggle('active', type === 'double');
}

async function createTournament(e) {
    e.preventDefault();
    const errEl = document.getElementById('tournament-create-error');
    errEl.textContent = '';

    try {
        await api('/tournaments', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('tournament-name').value.trim(),
                tournament_type: document.getElementById('tournament-type').value,
                max_participants: parseInt(document.getElementById('tournament-max').value)
            })
        });
        showToast('Tournoi cree');
        loadTournaments();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

async function viewTournament(id) {
    currentTournamentView = 'detail';
    currentTournamentId = id;
    const container = document.getElementById('tournaments-content');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const data = await api(`/tournaments/${id}`);
        const { tournament: t, participants, matches } = data;
        const player = getPlayer();

        const typeLabel = t.tournament_type === 'simple' ? '1v1' : 'Duo';
        const statusLabel = {
            'registration': 'Inscriptions ouvertes',
            'in_progress': 'En cours',
            'completed': 'Termine',
            'cancelled': 'Annule'
        }[t.status];
        const statusClass = {
            'registration': 'status-registration',
            'in_progress': 'status-inprogress',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled'
        }[t.status];

        let html = `<button class="btn btn-small btn-secondary" onclick="loadTournaments()" style="margin-bottom:12px">&larr; Retour</button>`;

        html += `<div class="tournament-detail-header">
            <div>
                <h2 style="margin:0">${t.name}</h2>
                <div class="tournament-meta" style="margin-top:4px">
                    <span class="tournament-type-badge">${typeLabel}</span>
                    <span class="tournament-status ${statusClass}">${statusLabel}</span>
                    <span>${participants.length}/${t.max_participants} participants</span>
                </div>
            </div>
        </div>`;

        // Registration phase
        if (t.status === 'registration') {
            // Check if user is registered
            let isRegistered = false;
            if (t.tournament_type === 'simple') {
                isRegistered = participants.some(p => p.player_id === player.id);
            } else {
                // Check if user's duo is registered
                isRegistered = participants.some(p => p.player1_id === player.id || p.player2_id === player.id);
            }

            if (isRegistered) {
                html += `<div class="card">
                    <div style="color:var(--green);font-weight:600;margin-bottom:8px">Vous etes inscrit !</div>
                    <button class="btn btn-small btn-danger" onclick="unregisterTournament(${t.id})">Se desinscrire</button>
                </div>`;
            } else {
                if (t.tournament_type === 'simple') {
                    html += `<div class="card">
                        <button class="btn" onclick="registerTournament(${t.id})">S'inscrire</button>
                    </div>`;
                } else {
                    // Need to select duo
                    html += `<div class="card" id="tournament-register-duo">`;
                    html += await renderDuoRegistration(t);
                    html += `</div>`;
                }
            }

            // Admin: start tournament button
            if (player?.is_admin && participants.length >= 2) {
                html += `<div class="card">
                    <button class="btn" onclick="startTournament(${t.id})">Lancer le tournoi (${participants.length} participants)</button>
                </div>`;
            }
        }

        // Admin: cancel button
        if (player?.is_admin && t.status !== 'completed' && t.status !== 'cancelled') {
            html += `<button class="btn btn-small btn-danger" onclick="cancelTournament(${t.id})" style="margin-bottom:12px">Annuler le tournoi</button>`;
        }

        // Participants list
        html += `<div class="section-title">Participants</div>`;
        if (participants.length === 0) {
            html += '<div class="empty-state">Aucun participant</div>';
        } else {
            for (const p of participants) {
                if (t.tournament_type === 'simple') {
                    const rankName = getRankName(p.elo_1v1 || 1200);
                    const colorClass = getRankColorClass(rankName);
                    html += `<div class="tournament-participant">
                        <div>
                            ${p.seed ? `<span class="participant-seed">#${p.seed}</span>` : ''}
                            <span class="participant-name">${p.display_name}</span>
                        </div>
                        <div class="rank-badge badge-${colorClass}">${rankName} (${p.elo_1v1 || 1200})</div>
                    </div>`;
                } else {
                    const avgElo = Math.round(((p.elo_duo_p1 || 1200) + (p.elo_duo_p2 || 1200)) / 2);
                    const rankName = getRankName(avgElo);
                    const colorClass = getRankColorClass(rankName);
                    html += `<div class="tournament-participant">
                        <div>
                            ${p.seed ? `<span class="participant-seed">#${p.seed}</span>` : ''}
                            <span class="participant-name">${p.duo_name || (p.player1_name + ' & ' + p.player2_name)}</span>
                            ${p.duo_name ? `<span style="color:var(--text-muted);font-size:12px;margin-left:6px">${p.player1_name} & ${p.player2_name}</span>` : ''}
                        </div>
                        <div class="rank-badge badge-${colorClass}">${rankName} (${avgElo})</div>
                    </div>`;
                }
            }
        }

        // Bracket
        if (matches.length > 0) {
            html += renderBracket(t, participants, matches, player);
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

async function renderDuoRegistration(tournament) {
    try {
        const duo = await api('/duos/mine');
        if (!duo) {
            return `<div style="color:var(--text-muted)">Vous devez avoir un duo pour vous inscrire. Creez-en un dans l'onglet Profil.</div>`;
        }
        const duoLabel = duo.duo_name || `${duo.player1_name} & ${duo.player2_name}`;
        return `<div style="margin-bottom:8px">Votre duo : <strong>${duoLabel}</strong></div>
                <button class="btn" onclick="registerTournamentDuo(${tournament.id}, ${duo.id})">Inscrire mon duo</button>`;
    } catch {
        return `<div style="color:var(--text-muted)">Vous devez avoir un duo pour vous inscrire.</div>`;
    }
}

function renderBracket(tournament, participants, matches, player) {
    // Build participant lookup
    const partMap = {};
    for (const p of participants) {
        partMap[p.id] = p;
    }

    // Group matches by round
    const rounds = {};
    let maxRound = 0;
    for (const m of matches) {
        if (!rounds[m.round]) rounds[m.round] = [];
        rounds[m.round].push(m);
        if (m.round > maxRound) maxRound = m.round;
    }

    const roundNames = [];
    for (let r = 1; r <= maxRound; r++) {
        if (r === maxRound) roundNames.push('Finale');
        else if (r === maxRound - 1) roundNames.push('Demi-finales');
        else if (r === maxRound - 2) roundNames.push('Quarts');
        else roundNames.push(`Tour ${r}`);
    }

    let html = `<div class="section-title">Bracket</div>`;
    html += `<div class="bracket-container">`;

    for (let r = 1; r <= maxRound; r++) {
        const roundMatches = rounds[r] || [];
        html += `<div class="bracket-round">`;
        html += `<div class="bracket-round-title">${roundNames[r - 1]}</div>`;

        for (const m of roundMatches) {
            const p1 = m.participant1_id ? partMap[m.participant1_id] : null;
            const p2 = m.participant2_id ? partMap[m.participant2_id] : null;

            const p1Name = getParticipantName(p1, tournament.tournament_type);
            const p2Name = getParticipantName(p2, tournament.tournament_type);

            const hasResult = m.winner_participant_id !== null;
            const p1Won = hasResult && m.winner_participant_id === m.participant1_id;
            const p2Won = hasResult && m.winner_participant_id === m.participant2_id;

            const isPlayable = !hasResult && !m.is_bye && m.participant1_id && m.participant2_id
                && tournament.status === 'in_progress' && player?.is_admin;

            html += `<div class="bracket-match ${m.is_bye ? 'bracket-bye' : ''}">
                <div class="bracket-player ${p1Won ? 'bracket-winner' : ''} ${hasResult && !p1Won ? 'bracket-loser' : ''}">
                    <span>${p1Name}</span>
                    ${hasResult && m.score_team1 !== null ? `<span class="bracket-score">${m.score_team1}</span>` : ''}
                </div>
                <div class="bracket-player ${p2Won ? 'bracket-winner' : ''} ${hasResult && !p2Won ? 'bracket-loser' : ''}">
                    <span>${p2Name}</span>
                    ${hasResult && m.score_team2 !== null ? `<span class="bracket-score">${m.score_team2}</span>` : ''}
                </div>
                ${isPlayable ? `<button class="btn btn-small bracket-play-btn" onclick="showTournamentMatchForm(${tournament.id}, ${m.id}, '${p1Name.replace(/'/g, "\\'")}', '${p2Name.replace(/'/g, "\\'")}')">Jouer</button>` : ''}
            </div>`;
        }

        html += `</div>`;
    }

    // Show winner
    if (tournament.status === 'completed') {
        const finalMatch = (rounds[maxRound] || [])[0];
        if (finalMatch && finalMatch.winner_participant_id) {
            const winner = partMap[finalMatch.winner_participant_id];
            const winnerName = getParticipantName(winner, tournament.tournament_type);
            html += `<div class="bracket-round bracket-champion">
                <div class="bracket-round-title">Champion</div>
                <div class="bracket-champion-name">${winnerName}</div>
            </div>`;
        }
    }

    html += `</div>`;
    return html;
}

function getParticipantName(participant, type) {
    if (!participant) return 'A determiner';
    if (type === 'simple') return participant.display_name || '?';
    return participant.duo_name || `${participant.player1_name} & ${participant.player2_name}`;
}

async function registerTournament(tournamentId) {
    try {
        await api(`/tournaments/${tournamentId}/register`, { method: 'POST', body: '{}' });
        showToast('Inscription confirmee');
        viewTournament(tournamentId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function registerTournamentDuo(tournamentId, duoId) {
    try {
        await api(`/tournaments/${tournamentId}/register`, {
            method: 'POST',
            body: JSON.stringify({ duo_id: duoId })
        });
        showToast('Duo inscrit');
        viewTournament(tournamentId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function unregisterTournament(tournamentId) {
    try {
        await api(`/tournaments/${tournamentId}/register`, { method: 'DELETE' });
        showToast('Desinscription confirmee');
        viewTournament(tournamentId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function startTournament(tournamentId) {
    if (!confirm('Lancer le tournoi ? Les inscriptions seront fermees et le bracket genere.')) return;
    try {
        await api(`/tournaments/${tournamentId}/start`, { method: 'POST', body: '{}' });
        showToast('Tournoi lance');
        viewTournament(tournamentId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function cancelTournament(tournamentId) {
    if (!confirm('Annuler ce tournoi ?')) return;
    try {
        await api(`/tournaments/${tournamentId}`, { method: 'DELETE' });
        showToast('Tournoi annule');
        loadTournaments();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function showTournamentMatchForm(tournamentId, matchId, p1Name, p2Name) {
    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.innerHTML = `
        <div class="elo-result-box">
            <h2>Match de tournoi</h2>
            <div style="font-size:14px;margin-bottom:16px">
                <strong>${p1Name}</strong> vs <strong>${p2Name}</strong>
            </div>
            <form onsubmit="submitTournamentMatch(event, ${tournamentId}, ${matchId})">
                <div class="score-input">
                    <div>
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${p1Name}</div>
                        <input type="number" id="tourney-score1" min="0" max="20" value="0" inputmode="numeric">
                    </div>
                    <span class="score-vs">VS</span>
                    <div>
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${p2Name}</div>
                        <input type="number" id="tourney-score2" min="0" max="20" value="0" inputmode="numeric">
                    </div>
                </div>
                <div id="tourney-match-error" class="error-msg"></div>
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button type="submit" class="btn">Valider</button>
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.elo-result-overlay').remove()">Annuler</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function submitTournamentMatch(e, tournamentId, matchId) {
    e.preventDefault();
    const errEl = document.getElementById('tourney-match-error');
    errEl.textContent = '';

    const score1 = parseInt(document.getElementById('tourney-score1').value);
    const score2 = parseInt(document.getElementById('tourney-score2').value);

    if (score1 === score2) {
        errEl.textContent = 'Pas de match nul !';
        return;
    }

    try {
        await api(`/tournaments/${tournamentId}/matches/${matchId}/result`, {
            method: 'POST',
            body: JSON.stringify({ score1, score2 })
        });
        document.querySelector('.elo-result-overlay')?.remove();
        showToast('Resultat enregistre');
        viewTournament(tournamentId);
    } catch (err) {
        errEl.textContent = err.message;
    }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    const token = getToken();
    if (token) {
        showApp();
    } else {
        showLogin();
    }
});
