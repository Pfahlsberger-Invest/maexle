const STORAGE_KEY = 'klick-data';
const SESSION_PASSWORD_KEY = 'maexle-session-password';
const API_URL = '/.netlify/functions/klick-data';
const BERLIN_TIMEZONE = 'Europe/Berlin';

const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

const getExpectedPassword = (date = new Date()) => {
  const day = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BERLIN_TIMEZONE,
      day: '2-digit',
    }).format(date)
  );

  return `eskalation${day + 11}`;
};

export const isPasswordValid = (password) => {
  const normalized = String(password || '').trim();
  return normalized === getExpectedPassword();
};

export const getSessionPassword = () => {
  try {
    return sessionStorage.getItem(SESSION_PASSWORD_KEY) || '';
  } catch {
    return '';
  }
};

export const setSessionPassword = (password) => {
  try {
    sessionStorage.setItem(SESSION_PASSWORD_KEY, String(password || '').trim());
  } catch {
    // Ignore session storage errors.
  }
};

export const clearSessionPassword = () => {
  try {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY);
  } catch {
    // Ignore session storage errors.
  }
};

export const readCachedGameState = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const cacheGameState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore local cache errors.
  }
};

const getAuthHeaders = (password = getSessionPassword()) => {
  const normalized = String(password || '').trim();
  return normalized ? { 'x-maexle-password': normalized } : {};
};

const parseRemoteResponse = async (response) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload?.state) {
    cacheGameState(payload.state);
    return payload.state;
  }

  return null;
};

export const fetchGameState = async (password = getSessionPassword()) => {
  const response = await fetch(API_URL, {
    cache: 'no-store',
    headers: getAuthHeaders(password),
  });
  return parseRemoteResponse(response);
};

export const loadGameState = async (password = getSessionPassword()) => {
  try {
    return await fetchGameState(password);
  } catch (error) {
    if (isLocalDev) {
      return readCachedGameState();
    }
    throw error;
  }
};

export const mutateGameState = async (action, password = getSessionPassword()) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(password),
    },
    body: JSON.stringify(action),
  });

  return parseRemoteResponse(response);
};
