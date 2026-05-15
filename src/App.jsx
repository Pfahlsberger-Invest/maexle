import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Plus, Trophy, Calendar, Clock, Trash2, RotateCcw, Skull, X, History } from 'lucide-react';
import {
  clearSessionPassword,
  fetchGameState,
  getSessionPassword,
  loadGameState,
  mutateGameState,
  setSessionPassword,
} from './scoreStore';

const DECAY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DECAY_AMOUNT = 10;
const SCORE_MIN = -100;
const SCORE_MAX = 100;

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#A78BFA',
  '#FB923C', '#34D399', '#F472B6', '#60A5FA',
  '#FCD34D', '#F87171', '#10B981', '#818CF8',
];

const DEFAULT_PEOPLE = [
  { id: 'p1', name: 'Luki', color: '#FF6B6B', inGame: true, protected: true },
  { id: 'p2', name: 'Thoma', color: '#4ECDC4', inGame: true, protected: true },
  { id: 'p3', name: 'Simi', color: '#FFD93D', inGame: true, protected: true },
  { id: 'p4', name: 'Mauchi', color: '#A78BFA', inGame: true, protected: true },
];

export default function App() {
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const [clicks, setClicks] = useState([]);
  const [schandeLog, setSchandeLog] = useState([]); // audit log for schande adjustments
  const [schandeScores, setSchandeScores] = useState({}); // { personId: score }
  const [lastDecay, setLastDecay] = useState(Date.now());
  const [schandeModal, setSchandeModal] = useState(null); // personId or null
  const [auditOpen, setAuditOpen] = useState(false);
  const [userIp, setUserIp] = useState(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [activeTab, setActiveTab] = useState('today');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [lastClicked, setLastClicked] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const applyPersistedState = (data) => {
    if (!data) return;

    if (Array.isArray(data.people) && data.people.length > 0) {
      // Backward compat: old people without inGame default to true
      setPeople(data.people.map((p) => ({ inGame: true, ...p })));
    }
    if (Array.isArray(data.clicks)) {
      setClicks(data.clicks);
    }
    if (Array.isArray(data.schandeLog)) {
      setSchandeLog(data.schandeLog);
    }
    setSchandeScores(data.schandeScores || {});
    setLastDecay(data.lastDecay || Date.now());
  };

  const syncState = (state) => {
    applyPersistedState(state);
    setSyncError('');
  };

  const handleRequestError = (error, fallbackMessage) => {
    if (error?.message === 'Unauthorized') {
      clearSessionPassword();
      setIsAuthenticated(false);
      setAuthError('Passwort abgelaufen oder falsch');
      return;
    }

    setSyncError(fallbackMessage);
  };

  // Fetch user's public IP once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (!cancelled && data && data.ip) {
          setUserIp(data.ip);
        } else if (!cancelled) {
          setUserIp('unknown');
        }
      } catch (e) {
        if (!cancelled) setUserIp('unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load persisted global state on mount
  useEffect(() => {
    (async () => {
      try {
        const savedPassword = getSessionPassword();
        if (!savedPassword) {
          setLoaded(true);
          return;
        }

        const data = await loadGameState(savedPassword);
        syncState(data);
        setIsAuthenticated(true);
      } catch (e) {
        clearSessionPassword();
        setIsAuthenticated(false);
        setAuthError('Passwort abgelaufen oder falsch');
      }
      setLoaded(true);
    })();
  }, []);

  // Keep open browser windows reasonably fresh when someone else updates the board.
  useEffect(() => {
    if (!loaded || !isAuthenticated) return;
    const tick = setInterval(async () => {
      try {
        const data = await fetchGameState();
        syncState(data);
      } catch (error) {
        handleRequestError(error, 'Server-Speicherung nicht erreichbar');
      }
    }, 10000);
    return () => clearInterval(tick);
  }, [loaded, isAuthenticated]);

  const handlePasswordSubmit = async () => {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) return;

    try {
      const data = await loadGameState(trimmedPassword);
      setSessionPassword(trimmedPassword);
      syncState(data);
      setIsAuthenticated(true);
      setAuthError('');
      setPassword('');
    } catch (error) {
      clearSessionPassword();
      setIsAuthenticated(false);
      setAuthError('Falsches Tagespasswort');
    }
  };

  const handleLogout = () => {
    clearSessionPassword();
    setIsAuthenticated(false);
    setPassword('');
    setAuthError('');
  };

  const handleClick = async (personId) => {
    const person = people.find((p) => p.id === personId);
    if (!person || !person.inGame) return; // can't click someone not in the game
    setLastClicked(personId);
    setTimeout(() => setLastClicked(null), 400);
    try {
      const state = await mutateGameState({
        type: 'click',
        personId,
        ip: userIp || 'unknown',
      });
      syncState(state);
    } catch (error) {
      handleRequestError(error, 'Klick konnte nicht gespeichert werden');
    }
  };

  const togglePersonInGame = async (id) => {
    try {
      const state = await mutateGameState({ type: 'toggle-person', personId: id });
      syncState(state);
    } catch (error) {
      handleRequestError(error, 'Aenderung konnte nicht gespeichert werden');
    }
  };

  const handleAddPerson = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const state = await mutateGameState({ type: 'add-person', name });
      syncState(state);
      setNewName('');
      setShowAdd(false);
    } catch (error) {
      handleRequestError(error, 'Person konnte nicht gespeichert werden');
    }
  };

  const handleRemove = async (id) => {
    if (people.length <= 1) return;
    try {
      const state = await mutateGameState({ type: 'remove-person', personId: id });
      syncState(state);
    } catch (error) {
      handleRequestError(error, 'Person konnte nicht entfernt werden');
    }
  };

  const openSchandeModal = (personId) => {
    setSliderValue(0);
    setSchandeModal(personId);
  };

  const applySchande = async () => {
    if (!schandeModal) return;
    const personId = schandeModal;
    const delta = sliderValue;
    try {
      const state = await mutateGameState({
        type: 'apply-schande',
        personId,
        delta,
        ip: userIp || 'unknown',
      });
      syncState(state);
      setSchandeModal(null);
      setSliderValue(0);
    } catch (error) {
      handleRequestError(error, 'Schande-Score konnte nicht gespeichert werden');
    }
  };

  const handleReset = async () => {
    try {
      const state = await mutateGameState({ type: 'reset-clicks' });
      syncState(state);
      setConfirmReset(false);
    } catch (error) {
      handleRequestError(error, 'Reset konnte nicht gespeichert werden');
    }
  };

  // --- Stats calculation ---
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startTs = startOfDay.getTime();

  const filteredClicks =
    activeTab === 'today'
      ? clicks.filter((c) => c.timestamp >= startTs)
      : clicks;

  const stats = people.map((person) => {
    const personClicks = filteredClicks.filter((c) => c.personId === person.id);
    const personRounds = filteredClicks.filter((c) => {
      const participants = c.participants || [c.personId];
      return participants.includes(person.id);
    });
    const punkte = personClicks.length;
    const runden = personRounds.length;
    const quote = runden > 0 ? punkte / runden : null; // 0..1, null if no rounds
    return {
      id: person.id,
      name: person.name,
      color: person.color,
      inGame: person.inGame,
      punkte,
      runden,
      quote,
    };
  });

  // Sort by quote ASC (best = lowest); people with no rounds (null) go last
  const sorted = [...stats].sort((a, b) => {
    if (a.quote === null && b.quote === null) return 0;
    if (a.quote === null) return 1;
    if (b.quote === null) return -1;
    return a.quote - b.quote;
  });

  // Chart data: only show people who actually played rounds
  const sortedChartData = sorted
    .filter((s) => s.quote !== null)
    .map((s) => ({
      name: s.name,
      value: Math.round(s.quote * 1000) / 10, // percent with 1 decimal
      fill: s.color,
      punkte: s.punkte,
      runden: s.runden,
    }));

  const ranked = sorted.filter((s) => s.quote !== null);
  const totalRounds = filteredClicks.length;
  const totalClicks = filteredClicks.length; // each click event = 1 round in the game
  const leader = ranked[0] || null;
  const loser = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const hasAny = ranked.length > 0;

  const fmtQuote = (q) => (q === null ? '—' : `${(q * 100).toFixed(1)}%`);
  const playersInGame = people.filter((p) => p.inGame).length;

  if (!loaded) {
    return (
      <div
        className="min-h-screen w-full p-4 md:p-8 flex items-center justify-center"
        style={{
          fontFamily:
            "'Bricolage Grotesque', 'Space Grotesk', system-ui, -apple-system, sans-serif",
          background:
            'radial-gradient(ellipse at top left, #fef3c7 0%, transparent 50%), radial-gradient(ellipse at bottom right, #fce7f3 0%, transparent 50%), #fffdf7',
        }}
      >
        <div className="mono text-sm text-stone-500">lade zugang ...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className="min-h-screen w-full p-4 md:p-8 flex items-center justify-center"
        style={{
          fontFamily:
            "'Bricolage Grotesque', 'Space Grotesk', system-ui, -apple-system, sans-serif",
          background:
            'radial-gradient(ellipse at top left, #fef3c7 0%, transparent 50%), radial-gradient(ellipse at bottom right, #fce7f3 0%, transparent 50%), #fffdf7',
        }}
      >
        <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 border-2 border-stone-900 shadow-[0_8px_0_0_rgba(0,0,0,0.9)]">
          <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-2">
            Zugang
          </div>
          <h1 className="text-4xl font-black text-stone-900 leading-none mb-3">
            Maexle Score-Board
          </h1>
          <p className="text-sm text-stone-600 mb-5">
            Bitte gib das Tagespasswort ein, um die Seite zu öffnen.
          </p>
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasswordSubmit();
              }}
              placeholder="Passwort"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border-2 border-stone-900 outline-none text-stone-900 font-bold"
            />
            <button
              onClick={handlePasswordSubmit}
              className="w-full px-4 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-rose-500 transition-colors"
            >
              Öffnen
            </button>
          </div>
          <div className="mt-4 mono text-[11px] text-stone-500">
            Schema: <span className="text-stone-900">eskalationXX</span>
          </div>
          <div className="mt-1 mono text-[11px] text-stone-400">
            XX ist aktueller Tag im Monat plus 11.
          </div>
          {authError && (
            <div className="mt-4 mono text-[11px] text-rose-500">{authError}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full p-4 md:p-8"
      style={{
        fontFamily:
          "'Bricolage Grotesque', 'Space Grotesk', system-ui, -apple-system, sans-serif",
        background:
          'radial-gradient(ellipse at top left, #fef3c7 0%, transparent 50%), radial-gradient(ellipse at bottom right, #fce7f3 0%, transparent 50%), #fffdf7',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Space+Mono:wght@400;700&display=swap');
        @keyframes pop {
          0% { transform: scale(1); }
          35% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pop { animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .rise { animation: rise 0.3s ease-out; }
        .mono { font-family: 'Space Mono', ui-monospace, monospace; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .fadeIn { animation: fadeIn 0.2s ease-out; }
        .scaleIn { animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }

        input[type="range"].schande-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 10px;
          background: linear-gradient(to right, #dc2626 0%, #f59e0b 50%, #16a34a 100%);
          border-radius: 999px;
          outline: none;
          border: 2px solid #1c1917;
        }
        input[type="range"].schande-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          background: #1c1917;
          border-radius: 50%;
          cursor: grab;
          border: 3px solid white;
          box-shadow: 0 0 0 2px #1c1917, 0 4px 8px rgba(0,0,0,0.2);
          transition: transform 0.1s;
        }
        input[type="range"].schande-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.15);
        }
        input[type="range"].schande-slider::-moz-range-thumb {
          width: 28px;
          height: 28px;
          background: #1c1917;
          border-radius: 50%;
          cursor: grab;
          border: 3px solid white;
          box-shadow: 0 0 0 2px #1c1917, 0 4px 8px rgba(0,0,0,0.2);
        }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-stone-900 leading-none">
              Mäxle <span className="text-rose-500">Score-Board</span>
            </h1>
            <p className="mono text-xs md:text-sm text-stone-500 mt-2">
              // wer würfelt am besten?
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAuditOpen(true)}
                className="px-3 py-2 bg-stone-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-rose-500 transition-colors shadow-[0_2px_0_0_rgba(0,0,0,0.9)] hover:shadow-[0_4px_0_0_rgba(0,0,0,0.9)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_1px_0_0_rgba(0,0,0,0.9)]"
                title="Audit-Trail anzeigen"
              >
                <History size={14} /> Audit-Trail
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-2 bg-white text-stone-700 rounded-xl font-bold text-xs border-2 border-stone-900 hover:bg-stone-100 transition-colors"
                title="Sitzung beenden"
              >
                Logout
              </button>
            </div>
            <div className="mono text-xs text-stone-400 text-right">
              <div>{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div>{clicks.length} runden gespielt</div>
            </div>
          </div>
        </header>

        {/* Person buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {people.map((person) => {
            const stat = stats.find((s) => s.id === person.id);
            const schande = schandeScores[person.id];
            const hasSchande = schande !== undefined;
            const schandeColor =
              schande > 0
                ? '#16a34a'
                : schande < 0
                ? '#dc2626'
                : '#78716c';
            const isOut = !person.inGame;
            return (
              <button
                key={person.id}
                onClick={() => handleClick(person.id)}
                className={`group relative bg-white rounded-2xl p-5 pb-7 shadow-[0_2px_0_0_rgba(0,0,0,0.9)] border-2 border-stone-900 text-left transition-all ${
                  isOut
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:shadow-[0_6px_0_0_rgba(0,0,0,0.9)] hover:-translate-y-1 active:translate-y-0 active:shadow-[0_1px_0_0_rgba(0,0,0,0.9)]'
                } ${lastClicked === person.id ? 'pop' : ''}`}
              >
                <div className="flex justify-between items-center mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-4 h-4 rounded-full border-2 border-stone-900 flex-shrink-0"
                      style={{ backgroundColor: person.color }}
                    />
                    {/* Im-Spiel toggle */}
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        togglePersonInGame(person.id);
                      }}
                      className={`relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0 border border-stone-900 ${
                        person.inGame ? 'bg-emerald-500' : 'bg-stone-300'
                      }`}
                      title={person.inGame ? 'Im Spiel — abschalten' : 'Nicht im Spiel — anschalten'}
                    >
                      <span
                        className={`absolute top-[1px] w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
                          person.inGame ? 'translate-x-[18px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        openSchandeModal(person.id);
                      }}
                      className="text-stone-400 hover:text-stone-900 transition-colors p-0.5"
                      title="Ewige-Schande-Score anpassen"
                    >
                      <Skull size={15} />
                    </span>
                    {!person.protected && people.length > 1 && (
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleRemove(person.id);
                        }}
                        className="opacity-0 group-hover:opacity-70 hover:!opacity-100 text-stone-400 hover:text-rose-500 transition-opacity"
                        title="Person entfernen"
                      >
                        <Trash2 size={14} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-2xl font-black text-stone-900 mb-1 flex items-center gap-2">
                  {person.name}
                  {person.protected && (
                    <span className="mono text-[9px] uppercase tracking-widest text-stone-400 font-bold">
                      fix
                    </span>
                  )}
                  {isOut && (
                    <span className="mono text-[9px] uppercase tracking-widest text-stone-400 font-bold">
                      pausiert
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-5xl font-black tabular-nums"
                    style={{ color: person.color }}
                  >
                    {stat.punkte}
                  </span>
                  <span className="mono text-[10px] text-stone-400 uppercase tracking-widest">
                    / {stat.runden} {stat.runden === 1 ? 'runde' : 'runden'}
                  </span>
                </div>
                <div className="mono text-[11px] font-bold text-stone-600 mt-1">
                  Quote: <span className="text-stone-900">{fmtQuote(stat.quote)}</span>
                </div>
                {hasSchande && (
                  <div
                    className="absolute bottom-2 right-3 mono text-[10px] font-bold tabular-nums flex items-center gap-1"
                    style={{ color: schandeColor }}
                    title="Ewige-Schande-Score"
                  >
                    <Skull size={9} />
                    {schande > 0 ? `+${schande}` : schande}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Add person */}
        <div className="mb-8">
          {showAdd ? (
            <div className="rise bg-white rounded-2xl p-3 border-2 border-stone-900 flex gap-2 items-center shadow-[0_2px_0_0_rgba(0,0,0,0.9)]">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPerson();
                  if (e.key === 'Escape') {
                    setShowAdd(false);
                    setNewName('');
                  }
                }}
                placeholder="Name eingeben..."
                autoFocus
                className="flex-1 px-3 py-2 outline-none bg-transparent text-lg font-bold text-stone-900 placeholder:text-stone-300"
              />
              <button
                onClick={handleAddPerson}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg font-bold hover:bg-rose-500 transition-colors text-sm"
              >
                Hinzufügen
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setNewName('');
                }}
                className="px-3 py-2 text-stone-400 hover:text-stone-900 transition-colors"
                aria-label="Abbrechen"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2.5 bg-white/40 hover:bg-white border-2 border-dashed border-stone-300 hover:border-stone-900 rounded-xl text-stone-500 hover:text-stone-900 font-bold text-sm transition-all flex items-center gap-2"
            >
              <Plus size={16} /> Person hinzufügen
            </button>
          )}
        </div>

        {/* Stats card */}
        <div className="bg-white rounded-3xl p-5 md:p-8 border-2 border-stone-900 shadow-[0_4px_0_0_rgba(0,0,0,0.9)]">
          {/* Tab switcher */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
            <div className="inline-flex gap-1 p-1 bg-stone-100 rounded-xl">
              <button
                onClick={() => setActiveTab('today')}
                className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${
                  activeTab === 'today'
                    ? 'bg-stone-900 text-white shadow'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Clock size={14} /> Heute
              </button>
              <button
                onClick={() => setActiveTab('alltime')}
                className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${
                  activeTab === 'alltime'
                    ? 'bg-stone-900 text-white shadow'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Calendar size={14} /> All Time
              </button>
            </div>

            {hasAny && (
              <div className="flex items-center gap-2">
                {confirmReset ? (
                  <>
                    <span className="text-xs text-stone-500 mono">Sicher?</span>
                    <button
                      onClick={handleReset}
                      className="px-3 py-1.5 text-xs font-bold bg-rose-500 text-white rounded-lg hover:bg-rose-600"
                    >
                      Ja, löschen
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1.5 text-xs font-bold text-stone-500 hover:text-stone-900"
                    >
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="text-xs text-stone-400 hover:text-rose-500 transition-colors flex items-center gap-1 mono"
                    title="Alle Klicks zurücksetzen"
                  >
                    <RotateCcw size={12} /> reset
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="flex flex-wrap gap-8 mb-2 pb-6 border-b border-stone-200">
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                Runden {activeTab === 'today' ? '(heute)' : '(all time)'}
              </div>
              <div className="text-4xl font-black text-stone-900 tabular-nums">
                {totalRounds}
              </div>
            </div>
            {leader && hasAny && (
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1 flex items-center gap-1">
                  <Trophy size={10} /> Spitzenreiter
                </div>
                <div className="text-4xl font-black" style={{ color: leader.color }}>
                  {leader.name}
                </div>
                <div className="mono text-[11px] text-stone-500 mt-0.5 tabular-nums">
                  {fmtQuote(leader.quote)} · {leader.punkte}/{leader.runden}
                </div>
              </div>
            )}
            {hasAny && leader && ranked[1] && (
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                  Vorsprung
                </div>
                <div className="text-4xl font-black text-stone-900 tabular-nums">
                  −{((ranked[1].quote - leader.quote) * 100).toFixed(1)}%
                </div>
              </div>
            )}
            {hasAny && loser && loser.id !== leader.id && (
              <div>
                <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1 flex items-center gap-1">
                  <Skull size={10} /> Schlusslicht
                </div>
                <div className="text-4xl font-black" style={{ color: loser.color }}>
                  {loser.name}
                </div>
                <div className="mono text-[11px] text-stone-500 mt-0.5 tabular-nums">
                  {fmtQuote(loser.quote)} · {loser.punkte}/{loser.runden}
                </div>
              </div>
            )}
          </div>
          <div className="mono text-[10px] text-stone-400 mb-6 italic flex items-center gap-3 flex-wrap">
            <span>// niedrigere quote = besser (punkte ÷ runden)</span>
            <span className="text-emerald-600">● {playersInGame} im spiel</span>
          </div>

          {/* Chart */}
          {hasAny ? (
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedChartData}
                  margin={{ top: 24, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e7e5e4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 14, fontWeight: 800, fill: '#1c1917' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#a8a29e' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'dataMax']}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    contentStyle={{
                      background: '#1c1917',
                      border: 'none',
                      borderRadius: 12,
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: '#fff', fontWeight: 800 }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value, _name, item) => [
                      `${value}%  (${item.payload.punkte}/${item.payload.runden})`,
                      'Quote',
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    radius={[10, 10, 0, 0]}
                    animationDuration={600}
                  >
                    {sortedChartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-16 text-stone-400">
              <div className="text-6xl mb-3">🎲</div>
              <div className="font-bold text-lg text-stone-600">
                Noch keine Runden {activeTab === 'today' ? 'heute' : ''}.
              </div>
              <div className="text-sm mt-1 mono">
                schalte spieler auf „im spiel" und drück bei verlust einen knopf!
              </div>
            </div>
          )}

          {/* Ranking list */}
          {hasAny && (
            <div className="mt-6 pt-6 border-t border-stone-200">
              <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-3 flex items-center justify-between">
                <span>Ranking</span>
                <span className="text-stone-400 normal-case tracking-normal">quote: weniger ist besser</span>
              </div>
              <div className="space-y-2">
                {sorted.map((s, i) => {
                  const hasQuote = s.quote !== null;
                  // bar width relative to worst quote in the field
                  const worstQuote = Math.max(
                    ...sorted.map((p) => p.quote ?? 0),
                    0.0001
                  );
                  const pct = hasQuote ? (s.quote / worstQuote) * 100 : 0;
                  const rankedIndex = ranked.findIndex((r) => r.id === s.id);
                  const isLeader = hasQuote && rankedIndex === 0;
                  const isLoser =
                    hasQuote &&
                    ranked.length > 1 &&
                    rankedIndex === ranked.length - 1;
                  return (
                    <div key={s.id} className={`flex items-center gap-3 ${!hasQuote ? 'opacity-50' : ''}`}>
                      <div className="mono text-xs text-stone-400 w-5 tabular-nums">
                        {hasQuote ? `${rankedIndex + 1}.` : '—'}
                      </div>
                      <div className="w-4 flex justify-center">
                        {isLeader && <Trophy size={13} className="text-amber-500" />}
                        {isLoser && <Skull size={13} className="text-stone-400" />}
                      </div>
                      <div className="font-bold text-stone-900 w-20 md:w-28 truncate flex items-center gap-1.5">
                        {s.name}
                        {!s.inGame && (
                          <span className="mono text-[8px] uppercase tracking-wider text-stone-400 font-bold">
                            paus
                          </span>
                        )}
                      </div>
                      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                        {hasQuote && (
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: s.color,
                            }}
                          />
                        )}
                      </div>
                      <div className="font-black text-stone-900 tabular-nums w-16 text-right text-sm">
                        {fmtQuote(s.quote)}
                      </div>
                      <div className="mono text-[10px] text-stone-400 tabular-nums w-12 text-right">
                        {s.punkte}/{s.runden}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center mono text-[10px] text-stone-400 space-y-1">
          <div>daten werden global gespeichert · browser-uebergreifend</div>
          {syncError && <div className="text-rose-500">{syncError}</div>}
        </div>
      </div>

      {/* Schande Modal */}
      {schandeModal && (() => {
        const person = people.find((p) => p.id === schandeModal);
        if (!person) return null;
        const currentScore = schandeScores[person.id] ?? 0;
        const previewScore = Math.max(
          SCORE_MIN,
          Math.min(SCORE_MAX, currentScore + sliderValue)
        );
        const previewColor =
          previewScore > 0 ? '#16a34a' : previewScore < 0 ? '#dc2626' : '#78716c';
        const sliderColor =
          sliderValue > 0 ? '#16a34a' : sliderValue < 0 ? '#dc2626' : '#78716c';
        return (
          <div
            className="fadeIn fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
            onClick={() => setSchandeModal(null)}
          >
            <div
              className="scaleIn bg-white rounded-3xl border-2 border-stone-900 shadow-[0_8px_0_0_rgba(0,0,0,0.9)] p-6 md:p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1 flex items-center gap-1.5">
                    <Skull size={11} /> Ewige-Schande-Score
                  </div>
                  <div className="text-3xl font-black text-stone-900 flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full border-2 border-stone-900"
                      style={{ backgroundColor: person.color }}
                    />
                    {person.name}
                  </div>
                </div>
                <button
                  onClick={() => setSchandeModal(null)}
                  className="text-stone-400 hover:text-stone-900 transition-colors p-1"
                  aria-label="Schließen"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Current → Preview */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                  <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                    Aktuell
                  </div>
                  <div
                    className="text-3xl font-black tabular-nums"
                    style={{
                      color:
                        currentScore > 0
                          ? '#16a34a'
                          : currentScore < 0
                          ? '#dc2626'
                          : '#78716c',
                    }}
                  >
                    {currentScore > 0 ? `+${currentScore}` : currentScore}
                  </div>
                </div>
                <div
                  className="rounded-xl p-4 border-2 transition-all"
                  style={{
                    borderColor: previewColor,
                    background: `${previewColor}10`,
                  }}
                >
                  <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                    Neu
                  </div>
                  <div
                    className="text-3xl font-black tabular-nums"
                    style={{ color: previewColor }}
                  >
                    {previewScore > 0 ? `+${previewScore}` : previewScore}
                  </div>
                </div>
              </div>

              {/* Slider */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="mono text-[10px] uppercase tracking-widest text-stone-500">
                    Anpassung
                  </span>
                  <span
                    className="text-2xl font-black tabular-nums"
                    style={{ color: sliderColor }}
                  >
                    {sliderValue > 0 ? `+${sliderValue}` : sliderValue}
                  </span>
                </div>
                <input
                  type="range"
                  min={SCORE_MIN}
                  max={SCORE_MAX}
                  step={1}
                  value={sliderValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="schande-slider"
                />
                <div className="flex justify-between mono text-[10px] text-stone-400 mt-2">
                  <span>−100</span>
                  <span>0</span>
                  <span>+100</span>
                </div>
                <div className="flex justify-center gap-2 mt-3 flex-wrap">
                  {[-50, -10, 0, +10, +50].map((v) => (
                    <button
                      key={v}
                      onClick={() => setSliderValue(v)}
                      className="px-2.5 py-1 mono text-[11px] font-bold rounded-md bg-stone-100 hover:bg-stone-900 hover:text-white text-stone-600 transition-colors tabular-nums"
                    >
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSchandeModal(null)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={applySchande}
                  disabled={sliderValue === 0}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-stone-900 text-white hover:bg-rose-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-stone-900"
                >
                  Übernehmen
                </button>
              </div>

              {/* Hint */}
              <div className="mt-4 text-center mono text-[10px] text-stone-400">
                ⌛ score verfällt automatisch um −10 alle 5 min · floor: −100
              </div>
            </div>
          </div>
        );
      })()}

      {/* Audit Trail Modal */}
      {auditOpen && (() => {
        // Combine clicks + schande adjustments into a unified audit log
        const entries = [
          ...clicks.map((c) => ({
            type: 'click',
            personId: c.personId,
            timestamp: c.timestamp,
            ip: c.ip || 'unknown',
          })),
          ...schandeLog.map((s) => ({
            type: 'schande',
            personId: s.personId,
            timestamp: s.timestamp,
            ip: s.ip || 'unknown',
            delta: s.delta,
          })),
        ].sort((a, b) => b.timestamp - a.timestamp);

        const personById = Object.fromEntries(people.map((p) => [p.id, p]));
        const fmt = (ts) => {
          const d = new Date(ts);
          const date = d.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          });
          const time = d.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          return { date, time };
        };

        return (
          <div
            className="fadeIn fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
            onClick={() => setAuditOpen(false)}
          >
            <div
              className="scaleIn bg-white rounded-3xl border-2 border-stone-900 shadow-[0_8px_0_0_rgba(0,0,0,0.9)] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-6 pb-4 border-b border-stone-200">
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest text-stone-500 mb-1 flex items-center gap-1.5">
                    <History size={11} /> Audit-Trail
                  </div>
                  <div className="text-3xl font-black text-stone-900">
                    {entries.length} Einträge
                  </div>
                  <div className="mono text-[11px] text-stone-400 mt-1">
                    deine ip: {userIp || 'wird ermittelt...'}
                  </div>
                </div>
                <button
                  onClick={() => setAuditOpen(false)}
                  className="text-stone-400 hover:text-stone-900 transition-colors p-1"
                  aria-label="Schließen"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Column header */}
              {entries.length > 0 && (
                <div className="grid grid-cols-12 gap-2 px-6 py-2 mono text-[10px] uppercase tracking-widest text-stone-400 border-b border-stone-100 bg-stone-50">
                  <div className="col-span-3">Zeitpunkt</div>
                  <div className="col-span-3">Person</div>
                  <div className="col-span-2">Aktion</div>
                  <div className="col-span-4 text-right">IP-Adresse</div>
                </div>
              )}

              {/* Entries list */}
              <div className="overflow-y-auto flex-1">
                {entries.length === 0 ? (
                  <div className="text-center py-16 text-stone-400">
                    <div className="text-5xl mb-3">📜</div>
                    <div className="font-bold text-stone-600">Noch keine Einträge.</div>
                    <div className="text-sm mt-1 mono">
                      drück einen knopf, um zu starten
                    </div>
                  </div>
                ) : (
                  entries.map((e, i) => {
                    const person = personById[e.personId];
                    const { date, time } = fmt(e.timestamp);
                    const isSchande = e.type === 'schande';
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-2 px-6 py-3 border-b border-stone-100 hover:bg-stone-50 transition-colors items-center text-sm"
                      >
                        <div className="col-span-3 mono text-[11px] text-stone-600">
                          <div className="font-bold text-stone-900">{time}</div>
                          <div className="text-stone-400">{date}</div>
                        </div>
                        <div className="col-span-3 flex items-center gap-2 min-w-0">
                          {person ? (
                            <>
                              <div
                                className="w-2.5 h-2.5 rounded-full border border-stone-900 flex-shrink-0"
                                style={{ backgroundColor: person.color }}
                              />
                              <span className="font-bold text-stone-900 truncate">
                                {person.name}
                              </span>
                            </>
                          ) : (
                            <span className="mono text-xs text-stone-400 italic">
                              gelöscht
                            </span>
                          )}
                        </div>
                        <div className="col-span-2">
                          {isSchande ? (
                            <span
                              className="mono text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                              style={{
                                background: e.delta >= 0 ? '#dcfce7' : '#fee2e2',
                                color: e.delta >= 0 ? '#166534' : '#991b1b',
                              }}
                            >
                              <Skull size={9} className="inline mr-0.5" />
                              {e.delta > 0 ? `+${e.delta}` : e.delta}
                            </span>
                          ) : (
                            <span className="mono text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-stone-900 text-white">
                              klick
                            </span>
                          )}
                        </div>
                        <div className="col-span-4 mono text-[11px] text-stone-500 text-right truncate">
                          {e.ip}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-stone-200 mono text-[10px] text-stone-400 flex items-center justify-between">
                <span>// neueste zuerst</span>
                <span>{clicks.length} klicks · {schandeLog.length} schande-änderungen</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
