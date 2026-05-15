const STORAGE_KEY = 'klick-data';
const API_URL = '/.netlify/functions/klick-data';
const SESSION_PASSWORD_KEY = 'maexle-session-password';

const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

const readLocalState = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const writeLocalState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore local cache errors.
  }
};

const parseRemoteResponse = async (response) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload?.state) {
    writeLocalState(payload.state);
    return payload.state;
  }

  return null;
};

const getStoredPassword = () => {
  try {
    return sessionStorage.getItem(SESSION_PASSWORD_KEY) || '';
  } catch {
    return '';
  }
};

const buildHeaders = (password) => {
  const headers = {};
  if (password) {
    headers['x-maexle-password'] = password;
  }
  return headers;
};

export const setSessionPassword = (password) => {
  try {
    sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
  } catch {
    // Ignore session storage issues.
  }
};

export const clearSessionPassword = () => {
  try {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY);
  } catch {
    // Ignore session storage issues.
  }
};

export const getSessionPassword = () => getStoredPassword();

export const fetchGameState = async (password = getStoredPassword()) => {
  const response = await fetch(API_URL, {
    cache: 'no-store',
    headers: buildHeaders(password),
  });
  return parseRemoteResponse(response);
};

export const loadGameState = async (password = getStoredPassword()) => {
  try {
    return await fetchGameState(password);
  } catch (error) {
    if (isLocalDev) {
      return readLocalState();
    }
    throw error;
  }
};

export const mutateGameState = async (action, password = getStoredPassword()) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...buildHeaders(password),
    },
    body: JSON.stringify(action),
  });

  return parseRemoteResponse(response);
};
