// ============================================
// App Principal
// ============================================

const DEFAULT_RANK_KEY = 'Iron';
const RANK_META = {
    Iron: { colorClass: 'iron', asset: 'iron.png' },
    Bronze: { colorClass: 'bronze', asset: 'bronze.png' },
    Silver: { colorClass: 'silver', asset: 'silver.png' },
    Gold: { colorClass: 'gold', asset: 'gold.png' },
    Platinum: { colorClass: 'platinum', asset: 'platine.png' },
    Emerald: { colorClass: 'emerald', asset: 'emerald.png' },
    Diamond: { colorClass: 'diamond', asset: 'diamond.png' },
    Master: { colorClass: 'master', asset: 'master.png' },
    Grandmaster: { colorClass: 'grandmaster', asset: 'grandmaster.png' },
    Challenger: { colorClass: 'challenger', asset: 'challenger.png' },
};

const APP_BASE_PATH = (() => {
    const scriptSrc = document.currentScript?.src;
    if (scriptSrc) {
        return new URL('..', scriptSrc).pathname.replace(/\/$/, '');
    }
    const pathname = window.location.pathname || '/';
    return pathname === '/' ? '' : pathname.replace(/\/$/, '').replace(/\/[^/]+$/, '');
})();

function withAppBasePath(path) {
    const rawPath = String(path || '');
    if (!rawPath) return '';
    if (/^(?:[a-z]+:)?\/\//i.test(rawPath) || rawPath.startsWith('data:') || rawPath.startsWith('blob:')) {
        return rawPath;
    }
    const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    return APP_BASE_PATH ? `${APP_BASE_PATH}${normalizedPath}` : normalizedPath;
}

function getRankBaseName(rankName) {
    const normalizedRankName = String(rankName || '');
    return Object.keys(RANK_META).find((key) => normalizedRankName.startsWith(key)) || DEFAULT_RANK_KEY;
}

function getRankMeta(rankName) {
    return RANK_META[getRankBaseName(rankName)] || RANK_META[DEFAULT_RANK_KEY];
}

function getRankColorClass(rankName) {
    return getRankMeta(rankName).colorClass;
}

function getRankIconUrl(rankName) {
    return withAppBasePath(`/assets/${getRankMeta(rankName).asset}`);
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

function fmtCoeff(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '0';
    return parseFloat(n.toFixed(6)).toString();
}

function formatWinrate(wins, losses) {
    const total = wins + losses;
    if (total === 0) return '-';
    return Math.round((wins / total) * 100) + '%';
}

function getStreakStepValue(season, type) {
    const key = type === 'win' ? 'win_streak_multiplier' : 'loss_streak_multiplier';
    const parsed = parseFloat(season?.[key]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.05;
}

function getStreakStepPercent(season, type) {
    return Math.round(getStreakStepValue(season, type) * 100);
}

function getStreakBonusPercent(season, type, streakCount) {
    return Math.round(Math.min(Math.abs(streakCount || 0), 5) * getStreakStepValue(season, type) * 100);
}

function buildGlobalSummary(ratings) {
    const totalWins = (ratings?.wins_attack || 0) + (ratings?.wins_defense || 0) + (ratings?.wins_1v1 || 0);
    const totalLosses = (ratings?.losses_attack || 0) + (ratings?.losses_defense || 0) + (ratings?.losses_1v1 || 0);
    const totalGames = totalWins + totalLosses;
    const winrate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
    const averageElo = Math.round(((ratings?.elo_attack || 0) + (ratings?.elo_defense || 0) + (ratings?.elo_1v1 || 0)) / 3);
    const rankName = getRankName(averageElo);

    return {
        totalWins,
        totalLosses,
        totalGames,
        winrate,
        averageElo,
        rankName,
        colorClass: getRankColorClass(rankName),
    };
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

function renderRankIcon(rankName, size, extraClass) {
    const iconSize = size || 52;
    const className = extraClass ? ` ${extraClass}` : '';
    return `<img src="${getRankIconUrl(rankName)}" alt="${rankName}" class="rank-icon${className}" loading="lazy" decoding="async" style="width:${iconSize}px;height:${iconSize}px;">`;
}

function renderStatBox(label, elo, wins, losses) {
    const rankName = getRankName(elo);
    const colorClass = getRankColorClass(rankName);

    return `<div class="stat-box rank-stat-box">
        <div class="label">${label}</div>
        <div class="rank-stat-icon-wrap">${renderRankIcon(rankName, 54, 'rank-stat-icon')}</div>
        <div class="value rank-${colorClass}">${elo}</div>
        <div class="rank-name rank-${colorClass}">${rankName}</div>
        <div class="ranking-record">${wins}V ${losses}D</div>
        <div class="winrate">WR: ${formatWinrate(wins, losses)}</div>
    </div>`;
}

function renderCompactStatBox(label, elo) {
    const rankName = getRankName(elo);
    const colorClass = getRankColorClass(rankName);

    return `<div class="stat-box rank-stat-box rank-stat-box-compact">
        <div class="label">${label}</div>
        <div class="rank-stat-icon-wrap">${renderRankIcon(rankName, 42, 'rank-stat-icon')}</div>
        <div class="value rank-${colorClass}" style="font-size:18px">${elo}</div>
        <div class="rank-name rank-${colorClass}" style="font-size:10px">${rankName}</div>
    </div>`;
}

function renderGlobalRankBanner(ratings, globalRank, totalPlayers, options = {}) {
    const summary = buildGlobalSummary(ratings);
    const label = options.label || 'RANG GLOBAL';
    const iconSize = options.iconSize || 74;
    const compact = options.compact ? ' compact' : '';

    return `<div class="global-rank-banner${compact}">
        <div class="global-rank-left">
            <div class="global-rank-visual">
                <div class="global-rank-icon">${renderRankIcon(summary.rankName, iconSize, 'global-rank-image')}</div>
                <div>
                    <div class="global-rank-label">${label}</div>
                    <div class="global-rank-position">#${globalRank || '?'} <span style="color:var(--text-secondary);font-size:14px">/ ${totalPlayers || '?'}</span></div>
                    <div class="rank-badge badge-${summary.colorClass}" style="margin-top:6px">${summary.rankName}</div>
                </div>
            </div>
        </div>
        <div class="global-rank-right">
            <div class="global-wr-value ${summary.winrate >= 50 ? 'elo-positive' : 'elo-negative'}">${summary.winrate}%</div>
            <div class="global-wr-label">WINRATE GLOBAL</div>
            <div style="font-size:12px;color:var(--text-secondary)">${summary.totalWins}V ${summary.totalLosses}D</div>
        </div>
    </div>`;
}

function syncPlayerCaches(updatedPlayer) {
    allPlayers = allPlayers.map((player) =>
        player.id === updatedPlayer.id
            ? { ...player, display_name: updatedPlayer.display_name, profile_photo: updatedPlayer.profile_photo ?? player.profile_photo }
            : player
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
    const winStreakPercent = getStreakStepPercent(season, 'win');
    const lossStreakPercent = getStreakStepPercent(season, 'loss');
    const wrMult = Number(season.winrate_multiplier ?? 0);
    const wrInfo = wrMult > 0 ? ` | WR: x${fmtCoeff(wrMult)}` : '';
    return `
        <div class="season-info">K: ${fmtCoeff(season.base_k_factor)} | Duel direct ATK/DEF: x${fmtCoeff(season.rank_multiplier)} | Equipes / Duo: x${fmtCoeff(season.duo_rank_multiplier)} | Score: x${fmtCoeff(season.score_multiplier)} | Defaite: ${lossPercent}% | Serie V:+${winStreakPercent}% | Serie D:+${lossStreakPercent}%${wrInfo}</div>
        <div class="season-info season-info-secondary">Solo : duel direct + ecart cumule des equipes + score + serie. Double : meme logique ATK/DEF + ELO duo selon l'ecart de rang des duos, le score et la serie moyenne. Le coeff defaite regle le pourcentage de points perdus.${wrMult > 0 ? ' Le coeff winrate ajuste les gains/pertes selon l\'ecart du WR a 50%.' : ''}</div>
    `;
}

function renderCoeffHelp(season) {
    const winStreakPercent = getStreakStepPercent(season, 'win');
    const lossStreakPercent = getStreakStepPercent(season, 'loss');
    return `
        <div class="coeff-help">
            <div><strong>K Factor</strong> : base des gains et pertes ELO.</div>
            <div><strong>Duel direct ATK/DEF</strong> : poids de l'ecart entre les deux joueurs directement opposes.</div>
            <div><strong>Score Mult</strong> : poids de l'ecart au score.</div>
            <div><strong>Equipes / Duo</strong> : poids de l'ecart cumule des equipes en ATK/DEF, et de l'ecart de rang entre les deux duos en double.</div>
            <div><strong>Coeff defaite</strong> : pourcentage de points perdus par rapport a la perte normale. Exemple : 0.75 = 75% de la perte standard.</div>
            <div><strong>Serie victoire</strong> : +${winStreakPercent}% par victoire consecutive, capee a 5 piles.</div>
            <div><strong>Serie defaite</strong> : +${lossStreakPercent}% par defaite consecutive, capee a 5 piles.</div>
            <div><strong>Coeff winrate</strong> : ajuste les gains/pertes ELO selon l'ecart du winrate a 50%. A 0 = desactive. Exemple : x1, un joueur a 70% WR verra ses gains/pertes multiplies par 1.2. Actif apres 5 matchs.</div>
        </div>
    `;
}

function renderMatchEloHelp() {
    if (matchMode === 'duo') {
        return `
            <div class="rule-card">
                <div class="rule-card-title">Regles ELO du double</div>
                <div class="rule-card-text">ATK / DEF : duel direct + ecart cumule des deux equipes + score + serie.</div>
                <div class="rule-card-text">ELO duo : ecart de rang entre les deux duos + score + serie moyenne de l'equipe.</div>
            </div>
        `;
    }
    if (matchMode === '1v1') {
        return `
            <div class="rule-card">
                <div class="rule-card-title">Regles ELO du 1v1</div>
                <div class="rule-card-text">L'ELO 1v1 depend du duel direct entre les deux joueurs, du score et de la serie.</div>
            </div>
        `;
    }

    return `
        <div class="rule-card">
            <div class="rule-card-title">Regles ELO du solo</div>
            <div class="rule-card-text">L'ELO attaque et defense depend du duel direct, de l'ecart cumule des deux equipes, du score et de la serie.</div>
        </div>
    `;
}

function avatarHtml(photoUrl, size) {
    size = size || 40;
    if (photoUrl) {
        return `<img src="${withAppBasePath(photoUrl)}" class="avatar" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
    }
    return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.4)}px;color:var(--text-muted);">?</div>`;
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

    const fab = document.getElementById('fab-chat');
    if (fab) fab.classList.toggle('hidden', page === 'chat');

    switch(page) {
        case 'home': loadHome(); break;
        case 'match': loadMatchPage(); break;
        case 'rankings': loadRankings(); break;
        case 'tournaments': loadTournaments(); break;
        case 'chat': loadChat(); break;
        case 'history': loadHistory(); break;
        case 'rules': loadRules(); break;
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

    // Check if we arrived via lobby QR code
    const params = new URLSearchParams(window.location.search);
    const lobbyCode = params.get('lobby');
    if (lobbyCode) {
        window.history.replaceState({}, '', APP_BASE_PATH || '/');
        navigate('match');
        setTimeout(() => joinLobbyByCode(lobbyCode), 500);
        return;
    }

    navigate('home');
}

async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-id').value.trimEnd();
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
    const identifier = document.getElementById('reg-id').value.trimEnd();
    const password = document.getElementById('reg-pass').value;
    const display_name = document.getElementById('reg-name').value.trim();
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
        const [stats, matches, season] = await Promise.all([
            api(`/players/${player.id}/stats`),
            api(`/players/${player.id}/matches`),
            api('/seasons/active')
        ]);

        let html = '';

        if (season) {
            html += `<div class="season-banner">
                <div>
                    <div class="season-name">${season.name}</div>
                </div>
            </div>`;
        }

        // Global rank + winrate banner
        if (stats?.ratings) {
            const r = stats.ratings;
            html += renderGlobalRankBanner(r, stats.global_rank, stats.total_players);

            // Streak display
            if (r.current_win_streak > 1) {
                html += `<div class="streak-banner streak-win">${r.current_win_streak} victoires d'affilée (+${getStreakBonusPercent(season, 'win', r.current_win_streak)}% bonus ELO)</div>`;
            } else if (r.current_loss_streak > 1) {
                html += `<div class="streak-banner streak-loss">${r.current_loss_streak} defaites d'affilée (+${getStreakBonusPercent(season, 'loss', r.current_loss_streak)}% perte ELO)</div>`;
            }

            html += `<div class="stats-grid stats-grid-4">
                ${renderStatBox('Attaque', r.elo_attack, r.wins_attack, r.losses_attack)}
                ${renderStatBox('Defense', r.elo_defense, r.wins_defense, r.losses_defense)}
                ${renderStatBox('Duo', r.elo_duo, r.wins_duo, r.losses_duo)}
                ${renderStatBox('1v1', r.elo_1v1, r.wins_1v1, r.losses_1v1)}
            </div>`;
        }

        // Player search
        html += `<div class="section-title">Rechercher un joueur</div>
            <div class="player-search-wrapper" style="margin-bottom:16px">
                <input type="text" class="search-input" id="home-player-search"
                    placeholder="Rechercher un profil..." autocomplete="off"
                    oninput="onHomePlayerSearch(this.value)"
                    style="margin-bottom:0">
                <div class="player-search-results" id="home-search-results"></div>
            </div>`;

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

// Home player search
async function onHomePlayerSearch(query) {
    const resultsEl = document.getElementById('home-search-results');
    if (!resultsEl) return;
    const q = query.trim();
    if (q.length < 1) {
        resultsEl.classList.remove('open');
        return;
    }

    try {
        const players = await api(`/players/search?q=${encodeURIComponent(q)}`);
        if (players.length === 0) {
            resultsEl.innerHTML = '<div class="player-search-option" style="color:var(--text-muted)">Aucun joueur</div>';
        } else {
            resultsEl.innerHTML = players.map(p =>
                `<div class="player-search-option player-search-option-rich" onclick="showPlayerProfile(${p.id})">
                    ${avatarHtml(p.profile_photo, 24)}
                    <div>
                        <div>${p.display_name}</div>
                        ${p.identifier ? `<div class="player-search-subtitle">@${p.identifier}</div>` : ''}
                    </div>
                </div>`
            ).join('');
        }
        resultsEl.classList.add('open');
    } catch (err) {
        resultsEl.classList.remove('open');
    }
}

// Show a player's profile overlay
async function showPlayerProfile(playerId) {
    const overlay = document.getElementById('player-profile-overlay');
    const box = document.getElementById('player-profile-box');
    overlay.style.display = 'flex';
    box.innerHTML = '<div class="loading">Chargement...</div>';

    // Close search results
    document.querySelectorAll('.player-search-results').forEach(el => el.classList.remove('open'));

    try {
        const me = getPlayer();
        const [stats, matches, h2h] = await Promise.all([
            api(`/players/${playerId}/stats`),
            api(`/players/${playerId}/matches`),
            me && me.id !== playerId ? api(`/players/${me.id}/vs/${playerId}`) : Promise.resolve(null)
        ]);

        const p = stats.player;
        const r = stats.ratings;

        let html = `<div class="player-profile-header">
            <div class="player-profile-avatar">${avatarHtml(p.profile_photo, 64)}</div>
            <div class="player-profile-headings">
                <div style="font-size:20px;font-weight:800">${p.display_name}</div>
                ${p.identifier ? `<div class="player-profile-identifier">@${p.identifier}</div>` : ''}
                ${stats.global_rank ? `<div style="font-size:13px;color:var(--text-secondary)">Rang global #${stats.global_rank} / ${stats.total_players}</div>` : ''}
            </div>
        </div>`;

        if (r) {
            html += renderGlobalRankBanner(r, stats.global_rank, stats.total_players, {
                compact: true,
                label: 'RANG ACTUEL',
                iconSize: 60,
            });

            html += `<div class="stats-grid stats-grid-4" style="margin-bottom:12px">
                ${renderCompactStatBox('ATK', r.elo_attack)}
                ${renderCompactStatBox('DEF', r.elo_defense)}
                ${renderCompactStatBox('DUO', r.elo_duo)}
                ${renderCompactStatBox('1v1', r.elo_1v1)}
            </div>`;

            if (r.current_win_streak > 0) {
                html += `<div class="streak-banner streak-win compact">${r.current_win_streak} victoires de suite en cours</div>`;
            } else if (r.current_loss_streak > 0) {
                html += `<div class="streak-banner streak-loss compact">${r.current_loss_streak} defaites de suite en cours</div>`;
            }
        }

        if (h2h) {
            html += `<div class="h2h-banner">
                <div class="h2h-label">WINRATE GLOBAL CONTRE CE PROFIL</div>
                ${h2h.total > 0
                    ? `<div class="h2h-value ${h2h.winrate >= 50 ? 'elo-positive' : 'elo-negative'}">${h2h.winrate}%</div>
                       <div class="h2h-detail">${h2h.wins}V ${h2h.losses}D (${h2h.total} matchs)</div>`
                    : `<div class="h2h-detail">Aucun match en commun</div>`}
            </div>`;
        }

        if (matches.length > 0) {
            html += `<div class="section-title">Derniers matchs</div>`;
            for (const match of matches.slice(0, 4)) {
                html += renderMatchCard(match, playerId);
            }
        }

        html += `<button class="btn btn-secondary btn-small" style="margin-top:12px" onclick="document.getElementById('player-profile-overlay').style.display='none'">Fermer</button>`;

        box.innerHTML = html;
    } catch (err) {
        box.innerHTML = `<div class="empty-state">${err.message}</div><button class="btn btn-secondary btn-small" style="margin-top:12px" onclick="document.getElementById('player-profile-overlay').style.display='none'">Fermer</button>`;
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
let currentLobby = null;
let lobbyRefreshTimer = null;

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

        <div class="section-title" style="margin-top:24px">OU</div>
        <div class="lobby-section">
            <button class="btn btn-secondary" onclick="showCreateLobby()">Creer un lobby QR Code</button>
            <button class="btn btn-secondary" style="margin-top:8px" onclick="showJoinLobby()">Rejoindre un lobby</button>
        </div>
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

function swapTeams() {
    if (matchMode === '1v1') {
        const tmp = selected1v1.player1;
        selected1v1.player1 = selected1v1.player2;
        selected1v1.player2 = tmp;
    } else if (matchMode === 'solo') {
        const tmpAtk = selectedPlayers['t1-attack'];
        const tmpDef = selectedPlayers['t1-defense'];
        selectedPlayers['t1-attack'] = selectedPlayers['t2-attack'];
        selectedPlayers['t1-defense'] = selectedPlayers['t2-defense'];
        selectedPlayers['t2-attack'] = tmpAtk;
        selectedPlayers['t2-defense'] = tmpDef;
    } else {
        const tmp = selectedDuos.team1;
        selectedDuos.team1 = selectedDuos.team2;
        selectedDuos.team2 = tmp;
    }
    const s1 = document.getElementById('score1');
    const s2 = document.getElementById('score2');
    if (s1 && s2) {
        const tmp = s1.value;
        s1.value = s2.value;
        s2.value = tmp;
    }
    renderTeamsContainer();
}

function swapPositions(team) {
    const atkKey = `${team}-attack`;
    const defKey = `${team}-defense`;
    const tmp = selectedPlayers[atkKey];
    selectedPlayers[atkKey] = selectedPlayers[defKey];
    selectedPlayers[defKey] = tmp;
    renderTeamsContainer();
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
            <div class="swap-teams-btn">
                <button type="button" onclick="swapTeams()" title="Inverser les joueurs">&#8646;</button>
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
                <div class="swap-positions-btn">
                    <button type="button" onclick="swapPositions('t1')" title="Inverser ATK/DEF">&#8645;</button>
                </div>
                <div class="form-group">
                    <label>Defenseur</label>
                    ${renderPlayerSearch('t1-defense')}
                </div>
            </div>
            <div class="swap-teams-btn">
                <button type="button" onclick="swapTeams()" title="Inverser les equipes">&#8646;</button>
            </div>
            <div class="team-select">
                <h3>Equipe 2</h3>
                <div class="form-group">
                    <label>Attaquant</label>
                    ${renderPlayerSearch('t2-attack')}
                </div>
                <div class="swap-positions-btn">
                    <button type="button" onclick="swapPositions('t2')" title="Inverser ATK/DEF">&#8645;</button>
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
            <div class="swap-teams-btn">
                <button type="button" onclick="swapTeams()" title="Inverser les equipes">&#8646;</button>
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
            <div class="result-help">Calcules avec le duel direct, l'ecart cumule des deux equipes, le score et la serie.</div>
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

// ===== Lobby System =====
function showCreateLobby() {
    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.id = 'lobby-create-overlay';
    overlay.innerHTML = `
        <div class="elo-result-box">
            <h2>Creer un lobby</h2>
            <div class="form-group">
                <label>Type de match</label>
                <div class="mode-toggle">
                    <button type="button" class="active" id="lobby-type-solo" onclick="setCreateLobbyType('solo')">Solo 2v2</button>
                    <button type="button" id="lobby-type-duo" onclick="setCreateLobbyType('duo')">Double</button>
                    <button type="button" id="lobby-type-1v1" onclick="setCreateLobbyType('1v1')">1v1</button>
                </div>
                <input type="hidden" id="lobby-match-type" value="solo">
            </div>
            <div class="lobby-score-help" style="margin-bottom:12px">En mode double, chaque equipe est occupee par un seul duo de saison.</div>
            <div id="lobby-create-error" class="error-msg"></div>
            <button class="btn" onclick="createLobby()">Creer</button>
            <button class="btn btn-secondary" style="margin-top:8px" onclick="this.closest('.elo-result-overlay').remove()">Annuler</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function setCreateLobbyType(type) {
    ['solo', 'duo', '1v1'].forEach((value) => {
        const button = document.getElementById(`lobby-type-${value}`);
        if (button) button.classList.toggle('active', value === type);
    });
    document.getElementById('lobby-match-type').value = type;
}

async function createLobby() {
    const matchType = document.getElementById('lobby-match-type').value;
    const errEl = document.getElementById('lobby-create-error');
    errEl.textContent = '';

    try {
        const lobby = await api('/lobbies', {
            method: 'POST',
            body: JSON.stringify({ match_type: matchType })
        });
        document.getElementById('lobby-create-overlay')?.remove();
        showLobbyView(lobby.id);
    } catch (err) {
        errEl.textContent = err.message;
    }
}

function showJoinLobby() {
    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.id = 'lobby-join-overlay';
    overlay.innerHTML = `
        <div class="elo-result-box">
            <h2>Rejoindre un lobby</h2>
            <div class="form-group">
                <label>Code du lobby</label>
                <input type="text" id="lobby-join-code" placeholder="Ex: A1B2C3D4" maxlength="8" style="text-transform:uppercase;text-align:center;font-size:20px;letter-spacing:4px">
            </div>
            <div id="lobby-join-error" class="error-msg"></div>
            <button class="btn" onclick="joinLobbyManual()">Rejoindre</button>
            <button class="btn btn-secondary" style="margin-top:8px" onclick="this.closest('.elo-result-overlay').remove()">Annuler</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function joinLobbyManual() {
    const code = document.getElementById('lobby-join-code').value.trim().toUpperCase();
    const errEl = document.getElementById('lobby-join-error');
    errEl.textContent = '';

    if (!code) {
        errEl.textContent = 'Entrez un code';
        return;
    }

    try {
        const lobby = await api(`/lobbies/code/${code}`);
        document.getElementById('lobby-join-overlay')?.remove();
        showLobbyView(lobby.id);
    } catch (err) {
        errEl.textContent = err.message;
    }
}

async function joinLobbyByCode(code) {
    try {
        const lobby = await api(`/lobbies/code/${code}`);
        showLobbyView(lobby.id);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function startLobbyAutoRefresh() {
    stopLobbyAutoRefresh();
    lobbyRefreshTimer = setInterval(() => {
        if (!currentLobby || !document.getElementById('lobby-view-overlay')) {
            stopLobbyAutoRefresh();
            return;
        }
        refreshLobbyView(true);
    }, 4000);
}

function stopLobbyAutoRefresh() {
    if (lobbyRefreshTimer) {
        clearInterval(lobbyRefreshTimer);
        lobbyRefreshTimer = null;
    }
}

async function showLobbyView(lobbyId) {
    currentLobby = lobbyId;
    stopLobbyAutoRefresh();

    // Remove any existing overlay
    document.querySelectorAll('#lobby-view-overlay').forEach(e => e.remove());

    const overlay = document.createElement('div');
    overlay.className = 'elo-result-overlay';
    overlay.id = 'lobby-view-overlay';
    overlay.innerHTML = '<div class="elo-result-box"><div class="loading">Chargement...</div></div>';
    document.body.appendChild(overlay);

    await refreshLobbyView();
    startLobbyAutoRefresh();
}

function renderLobbyScorePanel(lobby, me) {
    const isCreator = lobby.created_by === me.id;
    const canStart = lobby.status === 'ready' && isCreator;

    if (lobby.status === 'completed') {
        return `<div class="lobby-score-panel">
            <div class="lobby-score-title">Match termine</div>
            <div class="lobby-score-help">Ce lobby a deja servi a enregistrer un match.</div>
        </div>`;
    }

    if (lobby.status !== 'ready') {
        return `<div class="lobby-score-panel">
            <div class="lobby-score-title">En attente</div>
            <div class="lobby-score-help">${lobby.match_type === 'duo'
                ? 'Les duos rejoignent encore leur equipe. Le match pourra etre lance quand les deux equipes seront remplies.'
                : 'Les joueurs choisissent encore leur role. Le match pourra etre lance quand tous les slots seront remplis.'}</div>
        </div>`;
    }

    if (!isCreator) {
        return `<div class="lobby-score-panel">
            <div class="lobby-score-title">Lobby pret</div>
            <div class="lobby-score-help">Le createur du lobby peut maintenant saisir le score et lancer l'enregistrement du match.</div>
        </div>`;
    }

    return `<form class="lobby-score-panel" onsubmit="lobbyStartMatch(event)">
        <div class="lobby-score-title">Enregistrer le score</div>
        <div class="score-input lobby-score-inputs">
            <input type="number" id="lobby-score1" min="0" max="20" value="0" inputmode="numeric">
            <span class="score-vs">VS</span>
            <input type="number" id="lobby-score2" min="0" max="20" value="0" inputmode="numeric">
        </div>
        <div class="lobby-score-help">${lobby.match_type === 'duo'
            ? 'Ce score sera enregistre comme match double avec un duo de saison par equipe.'
            : 'Ce score utilisera le nouveau mode lobby sans enlever l\'ancien enregistrement manuel.'}</div>
        <div id="lobby-score-error" class="error-msg"></div>
        ${canStart ? `<button type="submit" class="btn">Lancer le match</button>` : ''}
    </form>`;
}

async function refreshLobbyView(isSilent) {
    if (!currentLobby) return;
    const overlay = document.getElementById('lobby-view-overlay');
    if (!overlay) return;

    try {
        const [lobby, qr] = await Promise.all([
            api(`/lobbies/${currentLobby}`),
            api(`/lobbies/${currentLobby}/qr?basePath=${encodeURIComponent(APP_BASE_PATH || '')}`)
        ]);

        const me = getPlayer();
        const isSoloLobby = lobby.match_type === 'solo';
        const isDuoLobby = lobby.match_type === 'duo';
        const isCreator = lobby.created_by === me.id;

        let slotsHtml = '';
        if (isSoloLobby) {
            slotsHtml = `
                <div class="lobby-teams">
                    <div class="lobby-team">
                        <div class="lobby-team-title">Equipe 1</div>
                        ${renderLobbySlot(lobby, 'slot_t1_attack', 'ATK', lobby.t1_attack_name, lobby.slot_t1_attack, me.id)}
                        ${renderLobbySlot(lobby, 'slot_t1_defense', 'DEF', lobby.t1_defense_name, lobby.slot_t1_defense, me.id)}
                    </div>
                    <div class="lobby-team">
                        <div class="lobby-team-title">Equipe 2</div>
                        ${renderLobbySlot(lobby, 'slot_t2_attack', 'ATK', lobby.t2_attack_name, lobby.slot_t2_attack, me.id)}
                        ${renderLobbySlot(lobby, 'slot_t2_defense', 'DEF', lobby.t2_defense_name, lobby.slot_t2_defense, me.id)}
                    </div>
                </div>`;
        } else if (isDuoLobby) {
            slotsHtml = `
                <div class="lobby-teams">
                    <div class="lobby-team">
                        <div class="lobby-team-title">Equipe 1</div>
                        ${renderLobbyDuoSlot(lobby, 'team1', me.id)}
                    </div>
                    <div class="lobby-team">
                        <div class="lobby-team-title">Equipe 2</div>
                        ${renderLobbyDuoSlot(lobby, 'team2', me.id)}
                    </div>
                </div>`;
        } else {
            slotsHtml = `
                <div class="lobby-teams">
                    ${renderLobbySlot(lobby, 'slot_1v1_p1', 'Joueur 1', lobby.p1_name, lobby.slot_1v1_p1, me.id)}
                    ${renderLobbySlot(lobby, 'slot_1v1_p2', 'Joueur 2', lobby.p2_name, lobby.slot_1v1_p2, me.id)}
                </div>`;
        }

        const box = overlay.querySelector('.elo-result-box');
        box.innerHTML = `
            <h2>Lobby ${lobby.match_type === 'solo' ? 'Solo 2v2' : lobby.match_type === 'duo' ? 'Double' : '1v1'}</h2>
            <div class="lobby-meta">
                <div style="text-align:center">
                    <img src="${qr.qr}" class="lobby-qr" alt="QR Code du lobby">
                    <div style="font-size:24px;font-weight:800;letter-spacing:6px;margin-top:8px;color:var(--gold)">${lobby.code}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Scannez le QR code ou entrez le code</div>
                </div>
                <div class="lobby-details">
                    <div class="lobby-status-badge lobby-status-${lobby.status}">${lobby.status === 'ready' ? 'Pret' : lobby.status === 'completed' ? 'Termine' : 'En attente'}</div>
                    <div class="lobby-score-help">Createur: ${lobby.created_by_name}</div>
                    <div class="lobby-score-help">${lobby.match_type === 'duo'
                        ? (isCreator ? 'Vous pouvez fermer le lobby et lancer le match quand les deux duos sont en place.' : 'Rejoignez une equipe avec votre duo de saison puis attendez le createur.')
                        : (isCreator ? 'Vous pouvez fermer le lobby et lancer le match.' : 'Rejoignez un role puis attendez que le createur valide le score.')}</div>
                    ${lobby.match_type === 'duo' ? `<div class="lobby-score-help ${lobby.duo_valid ? 'elo-positive' : 'elo-negative'}">${lobby.duo_valid ? 'Chaque equipe contient bien un duo de saison.' : 'Chaque equipe doit etre rejointe par un seul duo de saison.'}</div>` : ''}
                    <div class="lobby-link-box">${window.location.origin}${APP_BASE_PATH || ''}/?lobby=${lobby.code}</div>
                </div>
            </div>
            ${slotsHtml}
            ${renderLobbyScorePanel(lobby, me)}
            <div class="lobby-actions">
                <button class="btn btn-secondary" onclick="refreshLobbyView()">Rafraichir</button>
                <button class="btn btn-secondary" onclick="leaveLobby()">Quitter</button>
                ${isCreator ? `<button class="btn btn-danger" onclick="cancelLobby()">Fermer le lobby</button>` : ''}
            </div>
        `;
    } catch (err) {
        if (isSilent) return;
        const box = overlay.querySelector('.elo-result-box');
        box.innerHTML = `<div class="error-msg">${err.message}</div><button class="btn btn-secondary" style="margin-top:12px" onclick="closeLobbyView()">Fermer</button>`;
    }
}

function renderLobbySlot(lobby, slotField, label, playerName, playerId, myId) {
    const taken = playerId !== null;
    const isMe = playerId === myId;

    if (taken) {
        return `<div class="lobby-slot taken ${isMe ? 'is-me' : ''}">
            <span class="lobby-slot-label">${label}</span>
            <span class="lobby-slot-name">${playerName}</span>
            ${isMe ? `<span class="lobby-slot-leave" onclick="leaveSlot(${lobby.id})">x</span>` : ''}
        </div>`;
    }
    return `<div class="lobby-slot empty" onclick="joinSlot(${lobby.id}, '${slotField}')">
        <span class="lobby-slot-label">${label}</span>
        <span class="lobby-slot-name" style="color:var(--text-muted)">Libre - Cliquez pour rejoindre</span>
    </div>`;
}

function renderLobbyDuoSlot(lobby, teamKey, myId) {
    const isTeam1 = teamKey === 'team1';
    const duo = isTeam1 ? lobby.duo_team1 : lobby.duo_team2;
    const attackName = isTeam1 ? lobby.t1_attack_name : lobby.t2_attack_name;
    const defenseName = isTeam1 ? lobby.t1_defense_name : lobby.t2_defense_name;
    const attackId = isTeam1 ? lobby.slot_t1_attack : lobby.slot_t2_attack;
    const defenseId = isTeam1 ? lobby.slot_t1_defense : lobby.slot_t2_defense;
    const taken = attackId !== null || defenseId !== null;
    const isMe = attackId === myId || defenseId === myId;

    if (taken) {
        const duoTitle = duo?.duo_name || ((attackName && defenseName) ? `${attackName} & ${defenseName}` : 'Duo incomplet');
        const duoPlayers = attackName && defenseName
            ? `${attackName} (ATK) & ${defenseName} (DEF)`
            : 'Composition en attente';

        return `<div class="lobby-slot taken ${isMe ? 'is-me' : ''}">
            <span class="lobby-slot-label">Duo</span>
            <span class="lobby-slot-name" style="display:block">
                <span style="display:block">${duoTitle}</span>
                <small style="display:block;color:var(--text-muted);margin-top:2px">${duoPlayers}</small>
                ${duo ? '' : '<small style="display:block;color:var(--red);margin-top:4px">Duo non valide</small>'}
            </span>
            ${isMe ? `<span class="lobby-slot-leave" onclick="leaveSlot(${lobby.id})">x</span>` : ''}
        </div>`;
    }

    return `<div class="lobby-slot empty" onclick="joinSlot(${lobby.id}, '${teamKey}')">
        <span class="lobby-slot-label">Duo</span>
        <span class="lobby-slot-name" style="color:var(--text-muted)">Libre - Rejoindre avec mon duo</span>
    </div>`;
}

async function joinSlot(lobbyId, slot) {
    try {
        await api(`/lobbies/${lobbyId}/join`, {
            method: 'PUT',
            body: JSON.stringify({ slot })
        });
        await refreshLobbyView();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function leaveSlot(lobbyId) {
    try {
        await api(`/lobbies/${lobbyId}/leave`, { method: 'PUT', body: '{}' });
        await refreshLobbyView();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function leaveLobby() {
    if (currentLobby) {
        try { await api(`/lobbies/${currentLobby}/leave`, { method: 'PUT', body: '{}' }); } catch(e) {}
    }
    closeLobbyView();
}

async function cancelLobby() {
    if (!currentLobby) return;
    if (!confirm('Fermer ce lobby ?')) return;

    try {
        await api(`/lobbies/${currentLobby}`, { method: 'DELETE' });
        closeLobbyView();
        showToast('Lobby ferme');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function closeLobbyView() {
    stopLobbyAutoRefresh();
    currentLobby = null;
    document.getElementById('lobby-view-overlay')?.remove();
}

async function lobbyStartMatch(e) {
    if (e) e.preventDefault();

    try {
        const lobby = await api(`/lobbies/${currentLobby}`);
        const me = getPlayer();
        const errEl = document.getElementById('lobby-score-error');
        if (errEl) errEl.textContent = '';

        if (lobby.created_by !== me.id) {
            showToast('Seul le createur du lobby peut lancer le match.', 'error');
            return;
        }
        if (lobby.status !== 'ready') {
            if (errEl) errEl.textContent = 'Le lobby doit etre complet avant de lancer le match.';
            return;
        }
        if (lobby.match_type === 'duo' && !lobby.duo_valid) {
            if (errEl) errEl.textContent = 'Chaque equipe doit correspondre a un duo de saison valide.';
            return;
        }

        const score1 = parseInt(document.getElementById('lobby-score1')?.value || '', 10);
        const score2 = parseInt(document.getElementById('lobby-score2')?.value || '', 10);
        if (!Number.isFinite(score1) || !Number.isFinite(score2)) {
            if (errEl) errEl.textContent = 'Entrez un score valide.';
            return;
        }
        if (score1 === score2) {
            if (errEl) errEl.textContent = 'Pas de match nul !';
            return;
        }

        if (lobby.match_type === '1v1') {
            await api('/matches/1v1', {
                method: 'POST',
                body: JSON.stringify({
                    player1: lobby.slot_1v1_p1,
                    player2: lobby.slot_1v1_p2,
                    score_player1: score1,
                    score_player2: score2,
                })
            });
        } else {
            await api('/matches', {
                method: 'POST',
                body: JSON.stringify({
                    team1_attack: lobby.slot_t1_attack,
                    team1_defense: lobby.slot_t1_defense,
                    team2_attack: lobby.slot_t2_attack,
                    team2_defense: lobby.slot_t2_defense,
                    score_team1: score1,
                    score_team2: score2,
                })
            });
        }

        await api(`/lobbies/${currentLobby}/complete`, { method: 'PUT', body: '{}' }).catch(() => {});
        closeLobbyView();
        showToast('Match enregistre depuis le lobby !');
    } catch (err) {
        const errEl = document.getElementById('lobby-score-error');
        if (errEl) {
            errEl.textContent = err.message;
            return;
        }
        showToast(err.message, 'error');
    }
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

    // Build podium for top 3
    let html = '';
    const top3 = data.slice(0, 3);
    if (top3.length >= 1) {
        const podiumLabels = ['1er', '2eme', '3eme'];

        html += '<div class="podium">';
        for (let i = 0; i < Math.min(3, top3.length); i++) {
            const r = top3[i];
            let name;
            if (rankingType === 'duo') {
                name = r.duo_name || `${r.player1_name} & ${r.player2_name}`;
            } else {
                name = r.display_name;
            }
            const colorClass = getRankColorClass(r.rank.name);
            const podiumClickAttr = rankingType !== 'duo' ? `onclick="showPlayerProfile(${r.player_id})"` : '';
            const visual = rankingType === 'duo'
                ? renderRankIcon(r.rank.name, 68, 'podium-rank-icon')
                : `<div class="podium-avatar-stack">
                    ${avatarHtml(r.profile_photo, 42)}
                    ${renderRankIcon(r.rank.name, 68, 'podium-rank-icon')}
                </div>`;

            html += `<div class="podium-item podium-${i + 1}" ${podiumClickAttr}>
                <div class="podium-medal">${podiumLabels[i]}</div>
                <div class="podium-visual">${visual}</div>
                <div class="podium-name">${name}</div>
                <div class="podium-elo rank-${colorClass}">${r.elo}</div>
                <div class="rank-badge badge-${colorClass}">${r.rank.name}</div>
            </div>`;
        }
        html += '</div>';
    }

    for (const r of data) {
        const posClass = r.position <= 3 ? `top${r.position}` : '';
        const topClass = r.position <= 3 ? ` ranking-top ranking-top-${r.position}` : '';
        const clickAttr = rankingType !== 'duo' ? `onclick="showPlayerProfile(${r.player_id})" style="cursor:pointer"` : '';
        const playerIdentity = rankingType === 'duo'
            ? ''
            : `<div class="ranking-player-visual">
                ${avatarHtml(r.profile_photo, 38)}
                ${renderRankIcon(r.rank.name, 48, 'ranking-rank-icon')}
            </div>`;

        if (rankingType === 'global') {
            const colorClass = getRankColorClass(r.rank.name);
            const total = (r.wins || 0) + (r.losses || 0);
            const wr = total > 0 ? Math.round(((r.wins || 0) / total) * 100) + '%' : '-';
            html += `<div class="ranking-item${topClass}" ${clickAttr}>
                <div class="ranking-pos ${posClass}">#${r.position}</div>
                ${playerIdentity}
                <div class="ranking-info">
                    <div class="ranking-name">${r.display_name}</div>
                    <div class="ranking-record">ATK ${r.elo_attack} | DEF ${r.elo_defense} | 1v1 ${r.elo_1v1} | WR: ${wr}</div>
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

            html += `<div class="ranking-item${topClass}" ${clickAttr}>
                <div class="ranking-pos ${posClass}">#${r.position}</div>
                ${playerIdentity}
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

// ===== Chat =====
let chatMessages = [];
let chatPollingInterval = null;
let chatOldestId = null;

async function loadChat() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading">Chargement...</div>';
    chatMessages = [];
    chatOldestId = null;

    try {
        const messages = await api('/chat');
        chatMessages = messages;
        if (messages.length > 0) {
            chatOldestId = messages[0].id;
        }
        renderChatMessages();
        scrollChatToBottom();
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }

    startChatPolling();
}

function startChatPolling() {
    stopChatPolling();
    chatPollingInterval = setInterval(async () => {
        if (currentPage !== 'chat') {
            stopChatPolling();
            return;
        }
        try {
            const lastId = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].id : 0;
            const newMessages = await api('/chat');
            const fresh = newMessages.filter(m => m.id > lastId);
            if (fresh.length > 0) {
                chatMessages.push(...fresh);
                renderChatMessages();
                scrollChatToBottom();
            }
        } catch (_) {}
    }, 3000);
}

function stopChatPolling() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (chatMessages.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucun message. Soyez le premier !</div>';
        return;
    }

    const me = getPlayer();
    let html = '';
    let lastDate = '';

    for (const m of chatMessages) {
        const d = new Date(m.created_at);
        const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (dateStr !== lastDate) {
            html += `<div class="chat-date-separator">${dateStr}</div>`;
            lastDate = dateStr;
        }

        const isMe = m.player_id === me?.id;
        const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        html += `<div class="chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}">
            ${!isMe ? `<div class="chat-bubble-header">
                <span class="chat-author" onclick="showPlayerProfile(${m.player_id})">${escapeHtml(m.display_name)}</span>
            </div>` : ''}
            <div class="chat-bubble-text">${escapeHtml(m.message)}</div>
            <div class="chat-bubble-time">${time}</div>
        </div>`;
    }

    container.innerHTML = html;
}

function scrollChatToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

async function sendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    try {
        const newMsg = await api('/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
        input.value = '';
        chatMessages.push(newMsg);
        renderChatMessages();
        scrollChatToBottom();
    } catch (err) {
        showToast(err.message, true);
    }
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

// ===== Rules =====
async function loadRules() {
    const container = document.getElementById('rules-content');
    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const rules = await api('/rules');
        const player = getPlayer();

        let html = `<div class="section-title">Reglement du baby-foot</div>`;

        if (rules) {
            html += `<div class="card rules-card">
                <div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(rules.content)}</div>
                <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">Mis a jour par ${rules.updated_by_name} le ${formatDate(rules.updated_at)}</div>
            </div>`;
        } else {
            html += '<div class="empty-state">Aucun reglement defini pour le moment.</div>';
        }

        if (player?.is_admin) {
            html += `<div class="card" style="margin-top:16px">
                <div class="card-title">Modifier le reglement (admin)</div>
                <form onsubmit="saveRules(event)">
                    <div class="form-group">
                        <textarea id="rules-editor" rows="12" style="width:100%;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#fff;font-size:14px;resize:vertical;font-family:inherit">${rules ? escapeHtml(rules.content) : ''}</textarea>
                    </div>
                    <div id="rules-error" class="error-msg"></div>
                    <button type="submit" class="btn">Sauvegarder</button>
                </form>
            </div>`;
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function saveRules(e) {
    e.preventDefault();
    const content = document.getElementById('rules-editor').value;
    const errEl = document.getElementById('rules-error');
    errEl.textContent = '';

    try {
        await api('/rules', {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
        showToast('Reglement mis a jour');
        loadRules();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

// ===== Profile =====
async function loadProfile() {
    const container = document.getElementById('profile-content');
    try {
        const player = getPlayer();
        const [duo, players, me, stats] = await Promise.all([
            api('/duos/mine'),
            api('/players'),
            api('/auth/me'),
            api(`/players/${player.id}/stats`)
        ]);

        // Refresh player data from server
        setPlayer(me);
        document.getElementById('header-user').textContent = me.display_name;

        let html = `<div class="card">
            <div class="card-title">Mon profil</div>
            <div class="profile-hero">
                <div style="position:relative">
                    ${avatarHtml(me.profile_photo, 72)}
                    <label for="photo-upload" style="position:absolute;bottom:-4px;right:-4px;background:var(--accent);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;border:2px solid var(--bg-primary)">+</label>
                    <input type="file" id="photo-upload" accept="image/*" style="display:none" onchange="uploadProfilePhoto(this)">
                </div>
                <div class="profile-hero-copy">
                    <div style="font-size:20px;font-weight:800">${me.display_name}</div>
                    ${me.identifier ? `<div class="player-profile-identifier">@${me.identifier}</div>` : ''}
                    <div style="font-size:13px;color:var(--text-muted)">Compte #${me.id}</div>
                </div>
            </div>`;

        // Ranks display
        if (stats?.ratings) {
            const r = stats.ratings;
            html += renderGlobalRankBanner(r, stats.global_rank, stats.total_players);

            html += `<div class="section-title">Mes rangs</div>
            <div class="stats-grid stats-grid-4" style="margin-bottom:12px">
                ${renderStatBox('ATK', r.elo_attack, r.wins_attack, r.losses_attack)}
                ${renderStatBox('DEF', r.elo_defense, r.wins_defense, r.losses_defense)}
                ${renderStatBox('DUO', r.elo_duo, r.wins_duo, r.losses_duo)}
                ${renderStatBox('1v1', r.elo_1v1, r.wins_1v1, r.losses_1v1)}
            </div>`;

            // Streak info
            if (r.current_win_streak > 0) {
                html += `<div class="streak-banner streak-win">Serie de victoires : ${r.current_win_streak}</div>`;
            } else if (r.current_loss_streak > 0) {
                html += `<div class="streak-banner streak-loss">Serie de defaites : ${r.current_loss_streak}</div>`;
            }
        }

        html += `<form onsubmit="changeDisplayName(event)" style="display:flex;gap:8px;align-items:flex-end">
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

async function uploadProfilePhoto(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('photo', input.files[0]);

    try {
        const result = await apiUpload('/auth/profile-photo', formData);
        setPlayer(result.player);
        syncPlayerCaches(result.player);
        showToast('Photo mise a jour');
        loadProfile();
    } catch (err) {
        showToast(err.message, 'error');
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
let adminPlayersCache = [];
let adminSqlLastResult = null;
let adminSqlLastQuery = 'SELECT id, identifier, display_name, is_admin FROM players ORDER BY id DESC LIMIT 20;';

function escapeForHtml(value) {
    return escapeHtml(String(value));
}

function renderAdminSqlResult(result) {
    const container = document.getElementById('admin-sql-result');
    if (!container) return;

    if (!result) {
        container.innerHTML = '<div class="empty-state" style="padding:12px">Aucun resultat</div>';
        return;
    }

    if (result.kind === 'rows') {
        const columns = result.columns || [];
        const rows = result.rows || [];

        if (rows.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:12px">Requete executee, aucune ligne retournee</div>';
            return;
        }

        const headerHtml = columns.map((column) => `<th>${escapeForHtml(column)}</th>`).join('');
        const rowsHtml = rows.map((row) => `
            <tr>${columns.map((column) => `<td>${escapeForHtml(row[column] ?? '')}</td>`).join('')}</tr>
        `).join('');

        container.innerHTML = `
            <div class="sql-result-meta">
                ${result.row_count} ligne(s) retournee(s)${result.truncated ? ' - affiche limite a 200 lignes' : ''}
            </div>
            <div class="sql-table-wrap">
                <table class="sql-result-table">
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="sql-result-meta">Requete de modification executee</div>
        <pre class="sql-result-json">${escapeForHtml(JSON.stringify(result, null, 2))}</pre>
    `;
}

function renderAdminPlayersList(query) {
    const container = document.getElementById('admin-players-list');
    if (!container) return;

    const q = (query || '').toLowerCase().trim();
    const players = adminPlayersCache.filter((player) => {
        if (!q) return true;
        return player.display_name.toLowerCase().includes(q) || player.identifier.toLowerCase().includes(q);
    });

    if (players.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:12px">Aucun joueur</div>';
        return;
    }

    container.innerHTML = players.map((p) => `
        <div class="player-list-item">
            <div class="player-list-head">
                ${avatarHtml(p.profile_photo, 42)}
                <div>
                    <span class="name">${p.display_name}</span>
                    ${p.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                    <div class="id-badge">@${p.identifier}</div>
                </div>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
                <button class="btn btn-small btn-secondary" onclick="toggleAdmin(${p.id}, ${p.is_admin ? 0 : 1})">${p.is_admin ? 'Retirer admin' : 'Promouvoir'}</button>
                <button class="btn btn-small btn-secondary" onclick="resetPassword(${p.id})">Reset MDP</button>
                <button class="btn btn-small" onclick="showEditElo(${p.id}, '${p.display_name.replace(/'/g, "\\'")}')">Modifier ELO</button>
                <button class="btn btn-small btn-danger" onclick="deletePlayer(${p.id}, '${p.display_name.replace(/'/g, "\\'")}')">Supprimer</button>
            </div>
        </div>
    `).join('');
}

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
        adminPlayersCache = players;

        // Stats
        html += `<div class="admin-section">
            <h2>Console Administrateur</h2>
            <div class="stats-grid">
                <div class="stat-box"><div class="label">Joueurs</div><div class="value">${stats.total_players}</div></div>
                <div class="stat-box"><div class="label">Matchs</div><div class="value">${stats.matches_this_season}</div></div>
                <div class="stat-box"><div class="label">Duos</div><div class="value">${stats.duos_this_season}</div></div>
            </div>
        </div>`;

        html += `<div class="admin-section">
            <h2>Console SQL</h2>
            <div class="card">
                <div class="card-title">Executer une requete SQL sur la base</div>
                <form onsubmit="executeAdminSql(event)">
                    <div class="form-group">
                        <label>Requete SQL</label>
                        <textarea id="admin-sql-input" rows="8" class="admin-sql-input" spellcheck="false">${escapeForHtml(adminSqlLastQuery)}</textarea>
                    </div>
                    <div id="admin-sql-error" class="error-msg"></div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button type="submit" class="btn btn-small">Executer</button>
                        <button type="button" class="btn btn-small btn-secondary" onclick="document.getElementById('admin-sql-input').value='SELECT * FROM players LIMIT 20;'">Exemple SELECT</button>
                        <button type="button" class="btn btn-small btn-secondary" onclick="document.getElementById('admin-sql-input').value='UPDATE players SET is_admin = 0 WHERE id = 999999;'">Exemple UPDATE</button>
                    </div>
                </form>
                <div id="admin-sql-result" style="margin-top:14px"></div>
            </div>
        </div>`;

        // Saisons
        html += `<div class="admin-section"><h2>Saisons</h2>`;
        html += `<form onsubmit="createSeason(event)" style="margin-bottom:16px">
            <div class="form-group"><label>Nouvelle saison</label><input id="new-season-name" placeholder="Nom de la saison" required></div>
            <div class="coeff-grid" style="margin-bottom:12px">
                <div class="form-group"><label>K Factor</label><input id="new-k" type="number" step="0.000001" value="32"></div>
                <div class="form-group"><label>Duel direct ATK/DEF</label><input id="new-rank" type="number" step="0.000001" value="1.5"></div>
                <div class="form-group"><label>Score Mult</label><input id="new-score" type="number" step="0.000001" value="0.1"></div>
                <div class="form-group"><label>Equipes / Duo</label><input id="new-duo-rank" type="number" step="0.000001" value="1.3"></div>
                <div class="form-group"><label>Coeff defaite</label><input id="new-loss" type="number" step="0.000001" min="0" value="1"></div>
                <div class="form-group"><label>Serie victoire</label><input id="new-win-streak" type="number" step="0.000001" min="0" value="0.05"></div>
                <div class="form-group"><label>Serie defaite</label><input id="new-loss-streak" type="number" step="0.000001" min="0" value="0.05"></div>
                <div class="form-group"><label>Coeff winrate</label><input id="new-winrate" type="number" step="0.000001" min="0" value="0"></div>
            </div>
            ${renderCoeffHelp({
                win_streak_multiplier: 0.05,
                loss_streak_multiplier: 0.05
            })}
            <button type="submit" class="btn btn-small">Creer la saison</button>
        </form>`;

        for (const s of seasons) {
            const lossPercent = Math.round(Number(s.loss_multiplier ?? 1) * 100);
            html += `<div class="card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong>${s.name}</strong> ${s.is_active ? '<span class="admin-badge">Active</span>' : ''}
                    <div style="font-size:11px;color:var(--text-muted)">K:${fmtCoeff(s.base_k_factor)} | Duel:${fmtCoeff(s.rank_multiplier)} | Score:${fmtCoeff(s.score_multiplier)} | Equipes/Duo:${fmtCoeff(s.duo_rank_multiplier)} | Defaite:${lossPercent}% | Serie V:+${getStreakStepPercent(s, 'win')}% | Serie D:+${getStreakStepPercent(s, 'loss')}%${Number(s.winrate_multiplier || 0) > 0 ? ` | WR:x${fmtCoeff(s.winrate_multiplier)}` : ''}</div>
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
                        <div class="form-group"><label>K Factor</label><input id="edit-k" type="number" step="0.000001" value="${fmtCoeff(as.base_k_factor)}"></div>
                        <div class="form-group"><label>Duel direct ATK/DEF</label><input id="edit-rank" type="number" step="0.000001" value="${fmtCoeff(as.rank_multiplier)}"></div>
                        <div class="form-group"><label>Score Mult</label><input id="edit-score" type="number" step="0.000001" value="${fmtCoeff(as.score_multiplier)}"></div>
                        <div class="form-group"><label>Equipes / Duo</label><input id="edit-duo-rank" type="number" step="0.000001" value="${fmtCoeff(as.duo_rank_multiplier)}"></div>
                        <div class="form-group"><label>Coeff defaite</label><input id="edit-loss" type="number" step="0.000001" min="0" value="${fmtCoeff(as.loss_multiplier ?? 1)}"></div>
                        <div class="form-group"><label>Serie victoire</label><input id="edit-win-streak" type="number" step="0.000001" min="0" value="${fmtCoeff(as.win_streak_multiplier ?? 0.05)}"></div>
                        <div class="form-group"><label>Serie defaite</label><input id="edit-loss-streak" type="number" step="0.000001" min="0" value="${fmtCoeff(as.loss_streak_multiplier ?? 0.05)}"></div>
                        <div class="form-group"><label>Coeff winrate</label><input id="edit-winrate" type="number" step="0.000001" min="0" value="${fmtCoeff(as.winrate_multiplier ?? 0)}"></div>
                    </div>
                    ${renderCoeffHelp(as)}
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
        html += `<div class="admin-section"><h2>Joueurs</h2>
            <input type="text" class="search-input" placeholder="Rechercher un joueur ou un identifiant..." oninput="renderAdminPlayersList(this.value)">
            <div id="admin-players-list"></div>
        </div>`;

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
        renderAdminPlayersList();
        renderAdminSqlResult(adminSqlLastResult);
    } catch (err) {
        container.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
}

async function executeAdminSql(e) {
    e.preventDefault();
    const sql = document.getElementById('admin-sql-input')?.value || '';
    const errEl = document.getElementById('admin-sql-error');
    if (errEl) errEl.textContent = '';
    adminSqlLastQuery = sql;

    try {
        adminSqlLastResult = await api('/admin/sql', {
            method: 'POST',
            body: JSON.stringify({ sql })
        });
        if (adminSqlLastResult.kind === 'mutation') {
            await loadAdmin();
        }
        renderAdminSqlResult(adminSqlLastResult);
        showToast('Requete SQL executee');
    } catch (err) {
        if (errEl) errEl.textContent = err.message;
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
                loss_multiplier: parseFloat(document.getElementById('new-loss').value),
                win_streak_multiplier: parseFloat(document.getElementById('new-win-streak').value),
                loss_streak_multiplier: parseFloat(document.getElementById('new-loss-streak').value),
                winrate_multiplier: parseFloat(document.getElementById('new-winrate').value)
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
                loss_multiplier: parseFloat(document.getElementById('edit-loss').value),
                win_streak_multiplier: parseFloat(document.getElementById('edit-win-streak').value),
                loss_streak_multiplier: parseFloat(document.getElementById('edit-loss-streak').value),
                winrate_multiplier: parseFloat(document.getElementById('edit-winrate').value)
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
            let isRegistered = false;
            if (t.tournament_type === 'simple') {
                isRegistered = participants.some(p => p.player_id === player.id);
            } else {
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
                    html += `<div class="card" id="tournament-register-duo">`;
                    html += await renderDuoRegistration(t);
                    html += `</div>`;
                }
            }

            if (player?.is_admin && participants.length >= 2) {
                html += `<div class="card">
                    <button class="btn" onclick="startTournament(${t.id})">Lancer le tournoi (${participants.length} participants)</button>
                </div>`;
            }
        }

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
    const partMap = {};
    for (const p of participants) {
        partMap[p.id] = p;
    }

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


