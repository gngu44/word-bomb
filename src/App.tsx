import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Status = "loading" | "ready" | "howto" | "countdown" | "playing" | "gameover";
type LeaderboardEntry = {
  id: string;
  score: number;
  playedAt: number;
};
type CellTone = "plain" | "chunk" | "match";
type VisualCell = {
  char: string;
  tone: CellTone;
};

const LEADERBOARD_KEY = "word-bomb-leaderboard-v1";
const LEADERBOARD_LIMIT = 10;
const SHOW_LEADERBOARD = false;
const COUNTDOWN_STEPS = ["Ready", "3", "2", "1", "Go"];
const COUNTDOWN_STEP_MS = 650;

const CHUNK_TIERS = [
  {
    minScore: 0,
    chunks: [
      "re", "un", "er", "ly", "al", "st", "th", "sh", "ch", "ing", "ion", "ed", "es", "an", "in",
    ],
  },
  {
    minScore: 6,
    chunks: [
      "pre", "dis", "con", "pro", "sub", "ment", "ness", "less", "ful", "ous", "ive", "able", "est", "ant", "ent",
    ],
  },
  {
    minScore: 14,
    chunks: [
      "tion", "sion", "ible", "inter", "trans", "under", "over", "non", "mis", "ary", "ory", "str", "spr", "qu",
    ],
  },
];

function getChunkPool(score: number) {
  return CHUNK_TIERS
    .filter((tier) => score >= tier.minScore)
    .flatMap((tier) => tier.chunks);
}

function pickNewChunk(score: number, prev?: string) {
  const pool = getChunkPool(score);
  let next = pool[Math.floor(Math.random() * pool.length)];
  if (prev && pool.length > 1 && next === prev) {
    next = pool[(pool.indexOf(next) + 1) % pool.length];
  }
  return next;
}

function overlapLength(value: string, chunk: string) {
  const max = Math.min(value.length, chunk.length);
  for (let len = max; len > 0; len -= 1) {
    if (value.slice(-len) === chunk.slice(0, len)) return len;
  }
  return 0;
}

function buildVisualCells(value: string, chunk: string): VisualCell[] {
  const lowerValue = value.toLowerCase();
  const idx = lowerValue.indexOf(chunk);

  if (idx >= 0) {
    return value.split("").map((char, i) => ({
      char,
      tone: i >= idx && i < idx + chunk.length ? "match" : "plain",
    }));
  }

  const overlap = overlapLength(lowerValue, chunk);
  const plain = value.slice(0, value.length - overlap).split("").map((char) => ({ char, tone: "plain" as const }));
  const matched = value.slice(value.length - overlap).split("").map((char) => ({ char, tone: "match" as const }));
  const remainingChunk = chunk.slice(overlap).split("").map((char) => ({ char, tone: "chunk" as const }));
  return [...plain, ...matched, ...remainingChunk];
}

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [dictionary, setDictionary] = useState<Set<string>>(new Set());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const [chunk, setChunk] = useState<string>(pickNewChunk(0));
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [score, setScore] = useState<number>(0);
  const [scoreAnimationTick, setScoreAnimationTick] = useState<number>(0);
  const [input, setInput] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [countdownText, setCountdownText] = useState<string>("");
  const [bouncingCellIndex, setBouncingCellIndex] = useState<number | null>(null);

  const usedWordsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasPlayedRef = useRef<boolean>(false);
  const attemptSavedRef = useRef<boolean>(false);
  const previousInputLengthRef = useRef<number>(0);
  const previousStatusRef = useRef<Status>("loading");

  const attemptLimit = useMemo(() => Math.max(2.4, 10 - score * 0.2), [score]);
  const visualCells = useMemo(() => buildVisualCells(input, chunk), [input, chunk]);
  const timePercent = useMemo(() => Math.max(0, Math.min(100, (timeLeft / attemptLimit) * 100)), [timeLeft, attemptLimit]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LeaderboardEntry[];
      if (!Array.isArray(parsed)) return;
      const clean = parsed
        .filter(
          (entry) =>
            entry &&
            typeof entry.id === "string" &&
            typeof entry.score === "number" &&
            typeof entry.playedAt === "number",
        )
        .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
        .slice(0, LEADERBOARD_LIMIT);
      setLeaderboard(clean);
    } catch {
      setLeaderboard([]);
    }
  }, []);

  // Load dictionary from public/words.txt (one word per line)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/words.txt");
        const text = await res.text();
        const words = text
          .split(/\r?\n/)
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean);
        setDictionary(new Set(words));
        setStatus("ready");
      } catch {
        setMessage("Failed to load words.txt. Should be in /public.");
        setStatus("gameover");
      }
    })();
  }, []);

  // Timer (0.1s ticks)
  useEffect(() => {
    if (status !== "playing") return;
    hasPlayedRef.current = true;
    attemptSavedRef.current = false;

    intervalRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        const next = +(t - 0.1).toFixed(1);
        if (next <= 0) {
          window.clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setStatus("gameover");
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "gameover" || !hasPlayedRef.current || attemptSavedRef.current) return;

    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      score,
      playedAt: Date.now(),
    };

    setLeaderboard((prev) => {
      const next = [...prev, entry]
        .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
        .slice(0, LEADERBOARD_LIMIT);
      window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next));
      return next;
    });

    attemptSavedRef.current = true;
  }, [status, score]);

  useEffect(() => {
    const prevLength = previousInputLengthRef.current;

    if (input.length > prevLength) {
      setBouncingCellIndex(input.length - 1);
    } else if (input.length === 0) {
      setBouncingCellIndex(null);
    }

    previousInputLengthRef.current = input.length;
  }, [input]);

  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  function withAudioContext(play: (ctx: AudioContext, at: number) => void) {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }

    const ctx = audioContextRef.current;
    const trigger = () => play(ctx, ctx.currentTime + 0.001);

    if (ctx.state === "suspended") {
      void ctx.resume().then(trigger).catch(() => {
        // Ignore if the browser blocks sound resume in this event.
      });
      return;
    }

    trigger();
  }

  function playTypeClack(offset = 0) {
    withAudioContext((ctx, at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(1800, at + offset);
      osc.frequency.exponentialRampToValueAtTime(900, at + offset + 0.03);

      gain.gain.setValueAtTime(0.0001, at + offset);
      gain.gain.exponentialRampToValueAtTime(0.06, at + offset + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at + offset);
      osc.stop(at + offset + 0.04);
    });
  }

  function playWrongBuzz() {
    withAudioContext((ctx, at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, at);
      osc.frequency.exponentialRampToValueAtTime(95, at + 0.2);

      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.09, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.24);
    });
  }

  function playCorrectChime() {
    withAudioContext((ctx, at) => {
      const notes = [660, 880];
      notes.forEach((freq, i) => {
        const start = at + i * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.09, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    });
  }

  function playClockTick(offset = 0) {
    withAudioContext((ctx, at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1300, at + offset);
      osc.frequency.exponentialRampToValueAtTime(700, at + offset + 0.018);

      gain.gain.setValueAtTime(0.0001, at + offset);
      gain.gain.exponentialRampToValueAtTime(0.028, at + offset + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at + offset);
      osc.stop(at + offset + 0.035);
    });
  }

  function playDefeatSting() {
    withAudioContext((ctx, at) => {
      const notes = [360, 250, 170];
      notes.forEach((freq, i) => {
        const start = at + i * 0.11;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.17);
      });
    });
  }

  useEffect(() => {
    if (status !== "playing") {
      if (tickIntervalRef.current) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      return;
    }

    playClockTick();
    tickIntervalRef.current = window.setInterval(() => {
      playClockTick();
    }, 700);

    return () => {
      if (tickIntervalRef.current) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [status]);

  useEffect(() => {
    const prevStatus = previousStatusRef.current;
    if (prevStatus === "playing" && status === "gameover") {
      playDefeatSting();
    }
    previousStatusRef.current = status;
  }, [status]);

  function handleInputChange(nextInput: string) {
    if (nextInput.length > input.length) {
      const inserted = nextInput.slice(input.length);
      const letterCount = inserted.split("").filter((ch) => /^[a-z]$/i.test(ch)).length;
      for (let i = 0; i < letterCount; i += 1) {
        playTypeClack(i * 0.015);
      }
    }

    setInput(nextInput);
  }

  async function startGameWithCountdown() {
    if (status !== "ready" && status !== "gameover") return;

    usedWordsRef.current = new Set();
    setScore(0);
    setScoreAnimationTick(0);
    setChunk(pickNewChunk(0));
    setTimeLeft(10);
    setInput("");
    setMessage("");
    setBouncingCellIndex(null);
    previousInputLengthRef.current = 0;
    setStatus("countdown");

    for (const step of COUNTDOWN_STEPS) {
      setCountdownText(step);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, COUNTDOWN_STEP_MS);
      });
    }

    setCountdownText("");
    setStatus("playing");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function submit() {
    if (status !== "playing") return;

    const w = input.trim().toLowerCase();
    setInput("");
    setMessage("");

    if (!w) return;
    if (!/^[a-z]+$/.test(w)) {
      playWrongBuzz();
      return setMessage("Letters only.");
    }
    if (!w.includes(chunk)) {
      playWrongBuzz();
      return setMessage(`Must contain "${chunk}".`);
    }
    if (usedWordsRef.current.has(w)) {
      playWrongBuzz();
      return setMessage("Already used!");
    }
    if (!dictionary.has(w)) {
      playWrongBuzz();
      return setMessage("Not in dictionary.");
    }

    const nextScore = score + 1;
    usedWordsRef.current.add(w);
    setScore(nextScore);
    setTimeLeft(Math.max(2.4, 10 - nextScore * 0.2));
    setScoreAnimationTick((t) => t + 1);
    setChunk((prev) => pickNewChunk(nextScore, prev));
    playCorrectChime();
  }

  const leaderboardPanel = (
    <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10, width: "100%" }}>
      <h2 style={{ margin: 0 }}>Leaderboard</h2>
      {leaderboard.length === 0 ? (
        <p style={{ marginTop: 8 }}>No attempts yet.</p>
      ) : (
        <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20 }}>
          {leaderboard.map((entry) => (
            <li key={entry.id} style={{ marginBottom: 6 }}>
              <b>Score {entry.score}</b>{" "}
              <span style={{ opacity: 0.75 }}>
                ({new Date(entry.playedAt).toLocaleString()})
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 650, margin: "0 auto", width: "100%", padding: 16 }}>
      {status !== "gameover" && (
        <h1 style={{ marginBottom: 8, textAlign: "center", fontSize: "clamp(2.2rem, 5vw, 3.2rem)" }}>
          Word Bomb!
        </h1>
      )}

      {(status === "loading" || status === "ready") && (
        <div className="start-panel">
          <div className="menu-buttons">
            <button
              className="start-button"
              onClick={() => {
                void startGameWithCountdown();
              }}
              disabled={status !== "ready"}
            >
              Start
            </button>
            {status === "ready" && (
              <button className="menu-secondary-button" onClick={() => setStatus("howto")}>
                How to Play
              </button>
            )}
          </div>
          {status === "loading" && <p style={{ marginTop: 10 }}>Loading dictionary…</p>}
        </div>
      )}

      {status === "howto" && (
        <div className="howto-panel">
          <h2 style={{ margin: 0 }}>How to Play</h2>
          <p>Welcome to Word Bomb!</p>
          <p className="paragraph">
            Type an English word that contains the shown word segment before the timer bar runs out. 
            Every correct input increases your score, but the segments get harder to match and your time to answer shortens. 
            You can't reuse words, and the words have to be real english words.
          </p>
          <p>Good Luck!</p>
          <button className="menu-secondary-button" onClick={() => setStatus("ready")}>
            Back to Menu
          </button>
        </div>
      )}

      {status === "countdown" && (
        <div className="countdown-stage">
          <span key={countdownText} className="countdown-text">
            {countdownText}
          </span>
        </div>
      )}

      {status === "playing" && (
        <>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div
              className="timer-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(timePercent)}
              aria-label="Time remaining"
            >
              <div className="timer-fill" style={{ width: `${timePercent}%` }} />
            </div>
          </div>

          <div
            className={`word-input-stage ${status !== "playing" ? "word-input-disabled" : ""}`}
            onClick={() => status === "playing" && inputRef.current?.focus()}
          >
            <div className="word-input-visual word-input-visual-center" aria-hidden="true">
              {visualCells.map((cell, i) => (
                <span
                  key={`${cell.char}-${i}`}
                  className={`word-cell word-cell-${cell.tone}${i === bouncingCellIndex ? " word-cell-bounce" : ""}`}
                >
                  {cell.char}
                </span>
              ))}
            </div>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={status !== "playing"}
              className="word-input-native"
              autoFocus
              aria-label={`Type a word containing ${chunk}`}
            />
          </div>

          <div style={{ textAlign: "center", marginTop: 10, marginBottom: 6 }}>
            <span
              key={`score-${scoreAnimationTick}`}
              className={`score-number${scoreAnimationTick > 0 ? " score-number-shake" : ""}`}
            >
              {score}
            </span>
          </div>

          {message && <p style={{ marginTop: 10 }}>{message}</p>}
        </>
      )}

      {status === "gameover" && (
        <div className="gameover-page">
          <h2 className="gameover-title">GAME OVER</h2>
          <p className="gameover-score">
            Final score: <b>{score}</b>
          </p>
          <button
            className="start-button"
            onClick={() => {
              void startGameWithCountdown();
            }}
          >
            Try again
          </button>
          {SHOW_LEADERBOARD && leaderboardPanel}
        </div>
      )}

      {(status === "loading" || status === "ready") && SHOW_LEADERBOARD && leaderboardPanel}
      <div className="signature">
          by gngu44
      </div>
    </div>
  );
}
