import { connectLambda, getStore } from '@netlify/blobs';

const STORE_NAME = 'maexle-score-board';
const STATE_KEY = 'klick-data';
const DECAY_INTERVAL_MS = 5 * 60 * 1000;
const DECAY_AMOUNT = 10;
const SCORE_MIN = -100;
const SCORE_MAX = 100;

const COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#FFD93D',
  '#A78BFA',
  '#FB923C',
  '#34D399',
  '#F472B6',
  '#60A5FA',
  '#FCD34D',
  '#F87171',
  '#10B981',
  '#818CF8',
];

const DEFAULT_PEOPLE = [
  { id: 'p1', name: 'Luki', color: '#FF6B6B', inGame: true, protected: true },
  { id: 'p2', name: 'Thoma', color: '#4ECDC4', inGame: true, protected: true },
  { id: 'p3', name: 'Simi', color: '#FFD93D', inGame: true, protected: true },
  { id: 'p4', name: 'Mauchi', color: '#A78BFA', inGame: true, protected: true },
];

const BERLIN_TIMEZONE = 'Europe/Berlin';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const makeDefaultState = () => ({
  people: DEFAULT_PEOPLE.map((person) => ({ ...person })),
  clicks: [],
  schandeLog: [],
  schandeScores: {},
  lastDecay: Date.now(),
  updatedAt: Date.now(),
});

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cleanIp = (value) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : 'unknown';

const cleanName = (value) =>
  typeof value === 'string' ? value.trim().slice(0, 80) : '';

const getExpectedPassword = (now = new Date()) => {
  const day = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BERLIN_TIMEZONE,
      day: '2-digit',
    }).format(now)
  );

  return `eskalation${day + 11}`;
};

const isAuthorized = (event) => {
  const password =
    event.headers?.['x-maexle-password'] || event.headers?.['X-Maexle-Password'];

  return password === getExpectedPassword();
};

const normalizeState = (value) => {
  const state = isObject(value) ? value : {};
  const defaultState = makeDefaultState();

  const people = Array.isArray(state.people) && state.people.length > 0
    ? state.people
        .filter((person) => isObject(person) && person.id && person.name)
        .map((person) => ({
          id: String(person.id),
          name: cleanName(person.name),
          color: typeof person.color === 'string' ? person.color : defaultState.people[0].color,
          inGame: person.inGame !== false,
          protected: person.protected === true || defaultState.people.some((entry) => entry.id === String(person.id)),
        }))
        .filter((person) => person.name)
    : defaultState.people;

  return {
    people: people.length > 0 ? people : defaultState.people,
    clicks: Array.isArray(state.clicks)
      ? state.clicks.filter((click) => isObject(click) && click.personId && click.timestamp)
      : [],
    schandeLog: Array.isArray(state.schandeLog)
      ? state.schandeLog.filter((entry) => isObject(entry) && entry.personId && entry.timestamp)
      : [],
    schandeScores: isObject(state.schandeScores) ? state.schandeScores : {},
    lastDecay: Number.isFinite(state.lastDecay) ? state.lastDecay : defaultState.lastDecay,
    updatedAt: Number.isFinite(state.updatedAt) ? state.updatedAt : defaultState.updatedAt,
  };
};

const applyDecay = (state, now = Date.now()) => {
  const normalized = normalizeState(state);
  const elapsed = now - normalized.lastDecay;
  const intervals = Math.max(0, Math.floor(elapsed / DECAY_INTERVAL_MS));

  if (intervals === 0) {
    return normalized;
  }

  const totalDecay = intervals * DECAY_AMOUNT;
  const schandeScores = {};

  Object.entries(normalized.schandeScores).forEach(([personId, score]) => {
    const numericScore = Number.isFinite(score) ? score : 0;
    schandeScores[personId] = Math.max(SCORE_MIN, numericScore - totalDecay);
  });

  return {
    ...normalized,
    schandeScores,
    lastDecay: normalized.lastDecay + intervals * DECAY_INTERVAL_MS,
    updatedAt: now,
  };
};

const getNextColor = (people) => {
  const usedColors = people.map((person) => person.color);
  return (
    COLORS.find((color) => !usedColors.includes(color)) ||
    COLORS[people.length % COLORS.length]
  );
};

const applyAction = (state, action, now = Date.now()) => {
  const nextState = applyDecay(state, now);

  if (!isObject(action) || typeof action.type !== 'string') {
    throw new Error('Invalid action');
  }

  switch (action.type) {
    case 'click': {
      const person = nextState.people.find((entry) => entry.id === action.personId);
      if (!person || !person.inGame) {
        return nextState;
      }

      const participants = nextState.people
        .filter((entry) => entry.inGame)
        .map((entry) => entry.id);

      return {
        ...nextState,
        clicks: [
          ...nextState.clicks,
          {
            personId: person.id,
            timestamp: now,
            ip: cleanIp(action.ip),
            participants,
          },
        ],
        updatedAt: now,
      };
    }

    case 'toggle-person': {
      return {
        ...nextState,
        people: nextState.people.map((person) =>
          person.id === action.personId
            ? { ...person, inGame: !person.inGame }
            : person
        ),
        updatedAt: now,
      };
    }

    case 'add-person': {
      const name = cleanName(action.name);
      if (!name) {
        return nextState;
      }

      return {
        ...nextState,
        people: [
          ...nextState.people,
          {
            id: `p${now}`,
            name,
            color: getNextColor(nextState.people),
            inGame: true,
            protected: false,
          },
        ],
        updatedAt: now,
      };
    }

    case 'remove-person': {
      if (nextState.people.length <= 1) {
        return nextState;
      }

      const person = nextState.people.find((entry) => entry.id === action.personId);
      if (!person || person.protected) {
        return nextState;
      }

      const people = nextState.people.filter((person) => person.id !== action.personId);
      const clicks = nextState.clicks.filter((click) => click.personId !== action.personId);
      const schandeScores = { ...nextState.schandeScores };
      delete schandeScores[action.personId];

      return {
        ...nextState,
        people,
        clicks,
        schandeScores,
        updatedAt: now,
      };
    }

    case 'apply-schande': {
      const person = nextState.people.find((entry) => entry.id === action.personId);
      if (!person) {
        return nextState;
      }

      const delta = Number(action.delta);
      if (!Number.isFinite(delta) || delta === 0) {
        return nextState;
      }

      const current = Number(nextState.schandeScores[action.personId] || 0);
      const updated = Math.max(SCORE_MIN, Math.min(SCORE_MAX, current + delta));

      return {
        ...nextState,
        schandeScores: {
          ...nextState.schandeScores,
          [action.personId]: updated,
        },
        schandeLog: [
          ...nextState.schandeLog,
          {
            personId: action.personId,
            delta,
            timestamp: now,
            ip: cleanIp(action.ip),
          },
        ],
        updatedAt: now,
      };
    }

    case 'reset-clicks': {
      return {
        ...nextState,
        clicks: [],
        updatedAt: now,
      };
    }

    default:
      throw new Error('Unsupported action');
  }
};

const createResponse = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(body),
});

const readState = async (store) => {
  const entry = await store.getWithMetadata(STATE_KEY, {
    consistency: 'strong',
    type: 'json',
  });

  if (entry === null) {
    return {
      state: makeDefaultState(),
      etag: null,
    };
  }

  return {
    state: applyDecay(entry.data),
    etag: entry.etag,
  };
};

const writeState = async (store, state, etag) => {
  const options = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
  return store.setJSON(STATE_KEY, state, options);
};

const mutateState = async (store, action) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { state, etag } = await readState(store);
    const nextState = applyAction(state, action);
    const result = await writeState(store, nextState, etag);

    if (result.modified) {
      return nextState;
    }
  }

  throw new Error('Could not persist state due to concurrent updates');
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: jsonHeaders, body: '' };
  }

  if (!isAuthorized(event)) {
    return createResponse(401, { error: 'Unauthorized' });
  }

  connectLambda(event);
  const store = getStore(STORE_NAME);

  if (event.httpMethod === 'GET') {
    const { state } = await readState(store);
    return createResponse(200, { state });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return createResponse(400, { error: 'Invalid JSON body' });
    }

    try {
      const state = await mutateState(store, body);
      return createResponse(200, { state });
    } catch (error) {
      return createResponse(400, { error: error.message || 'Mutation failed' });
    }
  }

  return createResponse(405, { error: 'Method not allowed' });
};
