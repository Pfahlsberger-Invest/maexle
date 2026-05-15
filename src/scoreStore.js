const STORAGE_KEY = 'klick-data';
const API_URL = '/.netlify/functions/klick-data';

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

export const fetchGameState = async () => {
  const response = await fetch(API_URL, {
    cache: 'no-store',
  });
  return parseRemoteResponse(response);
};

export const loadGameState = async () => {
  try {
    return await fetchGameState();
  } catch (error) {
    if (isLocalDev) {
      return readLocalState();
    }
    throw error;
  }
};

export const mutateGameState = async (action) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
  });

  return parseRemoteResponse(response);
};
