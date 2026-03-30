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

function renderSeasonInfo(season) {
    return `
        <div class="season-info">K: ${season.base_k_factor} | Duel direct ATK/DEF: x${season.rank_multiplier} | Equipes / Duo: x${season.duo_rank_multiplier} | Score: x${season.score_multiplier}</div>
        <div class="season-info season-info-secondary">Solo : duel direct + ecart cumule des equipes + score. Double : meme logique ATK/DEF + ELO duo selon l'ecart de rang des duos.</div>
    `;
}

function renderCoeffHelp() {
    return `
        <div class="coeff-help">
            <div><strong>K Factor</strong> : base des gains et pertes ELO.</div>
            <div><strong>Duel direct ATK/DEF</strong> : poids de l'ecart entre les deux joueurs directement opposes.</div>
            <div><strong>Score Mult</strong> : poids de l'ecart au score.</div>
            <div><strong>Equipes / Duo</strong> : poids de l'ecart cumule des equipes en ATK/DEF, et de l'ecart de rang entre les deux duos en double.</div>
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

    // Charger les données de la page
    switch(page) {
        case 'home': loadHome(); break;
        case 'match': loadMatchPage(); break;
        case 'rankings': loadRankings(); break;
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

    // Afficher/cacher le bouton admin
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
        // Auto login
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
            html += `<div class="stats-grid">
                <div class="stat-box">
                    <div class="label">Attaque</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_attack))}">${r.elo_attack}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_attack))}">${getRankName(r.elo_attack)}</div>
                    <div class="ranking-record">${r.wins_attack}V ${r.losses_attack}D</div>
                </div>
                <div class="stat-box">
                    <div class="label">Defense</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_defense))}">${r.elo_defense}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_defense))}">${getRankName(r.elo_defense)}</div>
                    <div class="ranking-record">${r.wins_defense}V ${r.losses_defense}D</div>
                </div>
                <div class="stat-box">
                    <div class="label">Duo</div>
                    <div class="value rank-${getRankColorClass(getRankName(r.elo_duo))}">${r.elo_duo}</div>
                    <div class="rank-name rank-${getRankColorClass(getRankName(r.elo_duo))}">${getRankName(r.elo_duo)}</div>
                    <div class="ranking-record">${r.wins_duo}V ${r.losses_duo}D</div>
                </div>
            </div>`;
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
                const isTeam1 = (m.team1_attack === playerId || m.team1_defense === playerId);
                const won = isTeam1 ? m.score_team1 > m.score_team2 : m.score_team2 > m.score_team1;
                let eloChange = 0;
                if (m.team1_attack === playerId) eloChange = m.elo_change_t1_attack;
                else if (m.team1_defense === playerId) eloChange = m.elo_change_t1_defense;
                else if (m.team2_attack === playerId) eloChange = m.elo_change_t2_attack;
                else if (m.team2_defense === playerId) eloChange = m.elo_change_t2_defense;

                html += `<div class="match-card ${won ? 'win' : 'loss'}">
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
                    <div class="match-elo-change">${formatEloChange(eloChange)}</div>
                </div>`;
            }
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
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
let matchMode = 'solo'; // 'solo' ou 'duo'
let selectedPlayers = { 't1-attack': null, 't1-defense': null, 't2-attack': null, 't2-defense': null };
let selectedDuos = { team1: null, team2: null };

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
        <div class="mode-toggle">
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
    renderMatchForm();
}

function renderTeamsContainer() {
    const container = document.getElementById('match-teams-container');

    if (matchMode === 'solo') {
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

function initAllPlayerSearches() {
    // Fermer les résultats quand on clique ailleurs
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

    // Search + list
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
    // Re-render both duo selects
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
            score_team1: parseInt(document.getElementById('score1').value),
            score_team2: parseInt(document.getElementById('score2').value),
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
            score_team1: parseInt(document.getElementById('score1').value),
            score_team2: parseInt(document.getElementById('score2').value),
        };
    }

    if (data.score_team1 === data.score_team2) {
        errEl.textContent = 'Pas de match nul !';
        return;
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
let rankingType = 'attack';
let rankingData = [];

async function loadRankings() {
    renderRankingTabs();
    await fetchRankings(rankingType);
}

function renderRankingTabs() {
    document.getElementById('ranking-tabs').innerHTML = `
        <button class="${rankingType === 'attack' ? 'active' : ''}" onclick="switchRanking('attack')">Attaque</button>
        <button class="${rankingType === 'defense' ? 'active' : ''}" onclick="switchRanking('defense')">Defense</button>
        <button class="${rankingType === 'duo' ? 'active' : ''}" onclick="switchRanking('duo')">Duo</button>
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
        const colorClass = getRankColorClass(r.rank.name);
        const posClass = r.position <= 3 ? `top${r.position}` : '';
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
                <div class="ranking-record">${r.wins}V ${r.losses}D</div>
            </div>
            <div class="ranking-elo">
                <div class="elo-value rank-${colorClass}">${r.elo}</div>
                <div class="rank-badge badge-${colorClass}">${r.rank.name}</div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

// ===== Profile =====
async function loadProfile() {
    const container = document.getElementById('profile-content');
    try {
        const player = getPlayer();
        const duo = await api('/duos/mine');
        const players = await api('/players');

        let html = `<div class="card">
            <div class="card-title">Mon profil</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:4px">${player.display_name}</div>
            <div style="font-size:13px;color:var(--text-muted)">ID: ${player.id}</div>
        </div>`;

        // Duo
        html += `<div class="card"><div class="card-title">Mon duo de saison</div>`;
        if (duo) {
            html += `<div class="duo-card" style="margin:0">
                ${duo.duo_name ? `<div class="duo-names" style="color:var(--gold)">${duo.duo_name}</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${duo.player1_name} & ${duo.player2_name}</div>` : `<div class="duo-names">${duo.player1_name} & ${duo.player2_name}</div>`}
                <div class="duo-warning">Le duo ne peut pas etre change pendant la saison</div>
            </div>`;
        } else {
            const available = players.filter(p => p.id !== player.id);
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
        const [stats, seasons, players] = await Promise.all([
            api('/admin/stats'),
            api('/seasons'),
            api('/admin/players')
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
            </div>
            ${renderCoeffHelp()}
            <button type="submit" class="btn btn-small">Creer la saison</button>
        </form>`;

        for (const s of seasons) {
            html += `<div class="card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong>${s.name}</strong> ${s.is_active ? '<span class="admin-badge">Active</span>' : ''}
                    <div style="font-size:11px;color:var(--text-muted)">K:${s.base_k_factor} | Duel:${s.rank_multiplier} | Score:${s.score_multiplier} | Equipes/Duo:${s.duo_rank_multiplier}</div>
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
                    </div>
                    ${renderCoeffHelp()}
                    <button type="submit" class="btn btn-small">Sauvegarder</button>
                </form>
            </div>`;
        }

        // Joueurs
        html += `<div class="admin-section"><h2>Joueurs</h2>`;
        for (const p of players) {
            html += `<div class="player-list-item">
                <div>
                    <span class="name">${p.display_name}</span>
                    ${p.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                    <div class="id-badge">${p.identifier}</div>
                </div>
                <div style="display:flex;gap:4px">
                    <button class="btn btn-small btn-secondary" onclick="toggleAdmin(${p.id}, ${p.is_admin ? 0 : 1})">${p.is_admin ? 'Retirer admin' : 'Promouvoir'}</button>
                    <button class="btn btn-small btn-secondary" onclick="resetPassword(${p.id})">Reset MDP</button>
                </div>
            </div>`;
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
                duo_rank_multiplier: parseFloat(document.getElementById('new-duo-rank').value)
            })
        });
        loadAdmin();
    } catch (err) {
        alert(err.message);
    }
}

async function activateSeason(id) {
    try {
        await api(`/seasons/${id}/activate`, { method: 'PUT' });
        loadAdmin();
    } catch (err) { alert(err.message); }
}

async function endSeason(id) {
    if (!confirm('Terminer cette saison ?')) return;
    try {
        await api(`/seasons/${id}/end`, { method: 'PUT' });
        loadAdmin();
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
                duo_rank_multiplier: parseFloat(document.getElementById('edit-duo-rank').value)
            })
        });
        document.getElementById('admin-msg').textContent = 'Coefficients mis a jour';
        setTimeout(() => { const el = document.getElementById('admin-msg'); if(el) el.textContent = ''; }, 2000);
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

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    const token = getToken();
    if (token) {
        showApp();
    } else {
        showLogin();
    }
});
