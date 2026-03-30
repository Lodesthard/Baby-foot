// ============================================
// API Client
// ============================================

const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('bf_token');
}

function setToken(token) {
    localStorage.setItem('bf_token', token);
}

function clearToken() {
    localStorage.removeItem('bf_token');
    localStorage.removeItem('bf_player');
}

function getPlayer() {
    const p = localStorage.getItem('bf_player');
    return p ? JSON.parse(p) : null;
}

function setPlayer(player) {
    localStorage.setItem('bf_player', JSON.stringify(player));
}

async function api(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
        ...options,
        headers: { ...headers, ...options.headers },
    });

    const data = await res.json();

    if ((res.status === 401 || res.status === 403) && !path.startsWith('/auth/')) {
        clearToken();
        showLogin();
        throw new Error('Session expirée');
    }

    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
}
