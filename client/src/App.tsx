import { useEffect, useState } from "react";
import Court from "./Court";
type Feedback = {
  correct: boolean;
  correctOption: string;
  explanation: string;
  rule: string;
  trap_note: string;
  concept_tag: string;
};
type Result = {
  score: number;
  title: string;
  streak: number;
  longestStreak: number;
  careerCorrect: number;
  careerRank: string;
  grid: string;
};
type Puzzle = {
  date: string;
  puzzleNumber: number;
  difficulty: string;
  sessionId: string;
  questions: {
    id: string;
    setting: string;
    examiner: string;
    transcript: { speaker: string; text: string }[];
    options: string[];
    concept_tag: string;
  }[];
  answers: Feedback[];
  completed: boolean;
  result?: Result;
  nextResetAt: string;
};
type Stats = Partial<Result> & {
  concepts?: {
    tag: string;
    total: number;
    correct: number;
    accuracy: number;
  }[];
};
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok)
    throw Error(
      d.error?.message ||
        d.message ||
        "The court could not complete that request. Please try again.",
    );
  return d;
}
const legal =
  "Educational game based on the Federal Rules of Evidence. Not legal advice. Rules vary by jurisdiction.";
export default function App() {
  const [page, setPage] = useState("home"),
    [sessionReady, setSessionReady] = useState(false),
    [today, setToday] = useState<Puzzle | null>(null),
    [puzzle, setPuzzle] = useState<Puzzle | null>(null),
    [stats, setStats] = useState<Stats>(() => stored("objectle-stats", {})),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("daily"),
    [theme, setTheme] = useState(() => stored("objectle-theme", "light")),
    [archiveDate, setArchiveDate] = useState(""),
    [bonusDates, setBonusDates] = useState<string[]>([]),
    [handle, setHandle] = useState(""),
    [token, setToken] = useState(""),
    [recovery, setRecovery] = useState(""),
    [board, setBoard] = useState<any[]>([]),
    [boardType, setBoardType] = useState("today"),
    [notice, setNotice] = useState(""),
    [remaining, setRemaining] = useState("");
  const refreshStats = () =>
    api<Stats>("stats")
      .then((s) => {
        setStats(s);
        save("objectle-stats", s);
      })
      .catch(() => {});
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("objectle-theme", theme);
  }, [theme]);
  useEffect(() => {
    api<Puzzle>("today")
      .then((p) => {
        setToday(p);
        setPuzzle(p);
        if (p.result) setResult(p.result);
        refreshStats();
      })
      .catch((e) => setError(e.message))
      .finally(() => setSessionReady(true));
  }, []);
  useEffect(() => {
    if (page === "leaderboard" && sessionReady)
      api<{ entries: any[] }>("leaderboard?type=" + boardType)
        .then((d) => setBoard(d.entries))
        .catch((e) => setError(e.message));
  }, [page, boardType, sessionReady]);
  useEffect(() => {
    if (page === "archive" && sessionReady)
      api<{ dates: string[] }>("bonus-archive/dates")
        .then((d) => setBonusDates(d.dates))
        .catch((e) => setError(e.message));
  }, [page, sessionReady]);
  useEffect(() => {
    if (!today) return;
    const tick = () => {
      const s = Math.max(
        0,
        Math.floor((new Date(today.nextResetAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(
        `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [today]);
  async function load(path: string, nextMode: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const p = await api<Puzzle>(path, body);
      setPuzzle(p);
      if (nextMode === "daily") setToday(p);
      setMode(nextMode);
      setFeedback(
        !p.completed && p.answers.length
          ? p.answers[p.answers.length - 1]
          : null,
      );
      setResult(p.result || null);
      setPage(p.completed ? "results" : "game");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function answer(value: string) {
    if (!puzzle || busy || feedback) return;
    setBusy(true);
    setError("");
    try {
      const f = await api<Feedback>("answer", {
        sessionId: puzzle.sessionId,
        questionId: puzzle.questions[puzzle.answers.length].id,
        answer: value,
      });
      setFeedback(f);
      setPuzzle({ ...puzzle, answers: [...puzzle.answers, f] });
      refreshStats();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    if (!puzzle) return;
    if (puzzle.answers.length < puzzle.questions.length) {
      setFeedback(null);
      return;
    }
    setBusy(true);
    try {
      const r = await api<Result>("submit-daily", {
        sessionId: puzzle.sessionId,
      });
      setResult(r);
      setPage("results");
      setFeedback(null);
      refreshStats();
      if (mode === "daily") setToday({ ...puzzle, completed: true, result: r });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const share = `Objectle! ${mode === "daily" ? "#" + puzzle?.puzzleNumber : mode + " · " + puzzle?.date}\n${result?.grid || puzzle?.answers.map((a) => (a.correct ? "🟩" : "🟥")).join("")}\n${result?.title} · ${result?.score}/${puzzle?.questions.length || 5}\n${result?.streak || 0} day streak\n${location.origin}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(share);
    } catch {
      const t = document.createElement("textarea");
      t.value = share;
      document.body.append(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      if (!ok) {
        setNotice("Copy is unavailable. Select and copy the result below.");
        return;
      }
    }
    setNotice("Result copied.");
  }
  function image() {
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 600;
    const x = c.getContext("2d")!;
    x.fillStyle = "#f5efdf";
    x.fillRect(0, 0, 1000, 600);
    x.fillStyle = "#244a40";
    x.font = "bold 80px Georgia";
    x.fillText("Objectle!", 70, 120);
    x.font = "30px sans-serif";
    x.fillText(
      `${mode === "daily" ? "Docket #" + puzzle?.puzzleNumber : mode + " · " + puzzle?.date} · ${result?.title}`,
      70,
      190,
    );
    puzzle?.answers.forEach((a, i) => {
      x.fillStyle = a.correct ? "#397455" : "#ac5345";
      x.fillRect(70 + i * 105, 250, 85, 85);
    });
    x.fillStyle = "#244a40";
    x.fillText(
      `${result?.score}/${puzzle?.questions.length || 5} · ${result?.streak || 0} day streak`,
      70,
      410,
    );
    x.fillText(location.origin, 70, 500);
    const a = document.createElement("a");
    a.download = "objectle-result.png";
    a.href = c.toDataURL();
    a.click();
  }
  const concepts = (stats.concepts || [])
      .filter((c) => c.total >= 5)
      .sort((a, b) => a.correct / a.total - b.correct / b.total),
    index = puzzle
      ? Math.max(0, puzzle.answers.length - (feedback ? 1 : 0))
      : 0,
    question = puzzle?.questions[index];
  const ruling = feedback
    ? feedback.correct
      ? feedback.correctOption === "No objection"
        ? "Correct. The testimony is admitted."
        : "Sustained."
      : "Overruled."
    : "Counsel, you may proceed.";
  return (
    <div className={`courtroom page-${page}`}>
      <header className="header">
        <button className="brand" onClick={() => setPage("home")}>
          Objectle<span>!</span>
        </button>
        <span className="room-number">COURTROOM 01</span>
        <nav aria-label="Main navigation">
          <button onClick={() => setPage("archive")}>Case files</button>
          <button onClick={() => setPage("leaderboard")}>Leaderboard</button>
          <button onClick={() => setPage("about")}>About</button>
          <button
            aria-label="Toggle dark mode"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "☾" : "☀"}
          </button>
        </nav>
      </header>
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {(page === "home" || page === "game") && (
          <div className="hearing">
            <section className="case-context" aria-label="Case context">
              <div className="case-meta">
                <span>
                  {page === "home"
                    ? "ALL RISE"
                    : mode === "bonus archive"
                      ? "OCTOBER BONUS ARCHIVE"
                      : `${mode.toUpperCase()} DOCKET`}
                </span>
                <span>
                  {page === "game"
                    ? `${index + 1} of ${puzzle?.questions.length}`
                    : today?.date || "Loading today's docket…"}
                </span>
              </div>
              {page === "game" && question ? (
                <>
                  <h1>Before the court</h1>
                  <p>{question.setting}</p>
                </>
              ) : (
                <>
                  <h1>
                    {today?.completed
                      ? "Today's court is adjourned."
                      : "Court is in session."}
                  </h1>
                  <p>
                    Listen to the witness. Choose an objection—or let the
                    testimony stand.
                  </p>
                </>
              )}
            </section>
            <Court
              ruling={
                page === "game"
                  ? ruling
                  : "All rise. Counsel, take your places."
              }
            />
            {page === "home" ? (
              <section className="counsel-desk home-desk">
                <div className="docket-label">
                  <span className="eyebrow">
                    TODAY'S DOCKET · {today?.difficulty || "…"}
                  </span>
                  <p>
                    Five questions · {stats.streak || 0} day streak · Best{" "}
                    {stats.longestStreak || 0}
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!today || busy}
                  onClick={() => load("today", "daily")}
                >
                  {today?.completed
                    ? "View today’s verdict"
                    : today?.answers.length
                      ? "Resume today's docket"
                      : "Play today's docket"}
                </button>
                <button
                  className="archive-home"
                  onClick={() => setPage("archive")}
                >
                  Open October case files <span>31 bonus dockets</span>
                </button>
                {today?.completed && (
                  <p className="countdown">
                    {today.result?.score}/5 · Next docket: {remaining}
                  </p>
                )}
              </section>
            ) : (
              question &&
              puzzle && (
                <section className="counsel-desk question">
                  <div className="record">
                    <div className="eyebrow">
                      COURT TRANSCRIPT <span>{question.examiner}</span>
                    </div>
                    <div className="transcript">
                      {question.transcript.map((l, i) => (
                        <p key={i}>
                          <b>{l.speaker === "Q" ? "Counsel" : "Witness"}</b>
                          <span>{l.text}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="decision">
                    <div className="eyebrow">YOUR RESPONSE</div>
                    <div className="options" aria-label="Choose your objection">
                      {question.options.map((o, i) => (
                        <button
                          key={o}
                          disabled={busy || !!feedback}
                          onClick={() => answer(o)}
                          className={
                            feedback?.correctOption === o ? "correct" : ""
                          }
                        >
                          <span>{String.fromCharCode(65 + i)}</span>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                  {feedback && (
                    <div
                      className={`feedback ${feedback.correct ? "success" : "miss"}`}
                      role="status"
                    >
                      <div>
                        <strong>
                          {ruling} <small>{feedback.rule}</small>
                        </strong>
                        <p>{feedback.explanation}</p>
                        <p className="trap">{feedback.trap_note}</p>
                      </div>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={next}
                      >
                        {puzzle.answers.length === puzzle.questions.length
                          ? "See my verdict"
                          : "Next question"}{" "}
                        →
                      </button>
                    </div>
                  )}
                </section>
              )
            )}
          </div>
        )}
        {page === "results" && result && (
          <section className="panel results">
            <span className="eyebrow">
              {mode === "daily"
                ? "TODAY’S FINAL VERDICT"
                : `${mode.toUpperCase()} COMPLETE`}
            </span>
            <h1>{result.title}</h1>
            <div className="score">
              {result.score}
              <span> / {puzzle?.questions.length || 5}</span>
            </div>
            <p>The docket is complete.</p>
            <div
              className="grid"
              aria-label={`${result.score} correct answers`}
            >
              {puzzle?.answers.map((a) => (a.correct ? "🟩" : "🟥")).join("")}
            </div>
            <p>
              🔥 {result.streak} day streak · Best: {result.longestStreak}
              <br />
              {result.careerRank} · {result.careerCorrect} career correct
            </p>
            <div className="actions">
              <button className="primary" onClick={copy}>
                Copy result
              </button>
              <button onClick={image}>Save image</button>
              {typeof navigator.share === "function" && (
                <button
                  onClick={() =>
                    navigator.share({ text: share }).catch(() => {})
                  }
                >
                  Share
                </button>
              )}
            </div>
            <p role="status">{notice}</p>
            <details>
              <summary>Plain-text share card</summary>
              <pre>{share}</pre>
            </details>
            <h2>Your evidence notebook</h2>
            {concepts.length ? (
              concepts.map((c, i) => (
                <p key={c.tag}>
                  {i === 0 ? "◎ Weakest: " : ""}
                  {c.tag}: {Math.round((c.correct / c.total) * 100)}%{" "}
                  <small>({c.total} answers)</small>
                </p>
              ))
            ) : (
              <p>
                Answer at least five questions in a concept to reveal your weak
                spots.
              </p>
            )}
            {concepts[0] && (
              <button
                disabled={busy}
                onClick={() =>
                  load("practice", "practice", { tag: concepts[0].tag })
                }
              >
                Practice my weak spot
              </button>
            )}
            <div className="actions">
              <button onClick={() => setPage("archive")}>
                Explore the archive
              </button>
              <button onClick={() => setPage("leaderboard")}>
                View leaderboard
              </button>
            </div>
          </section>
        )}
        {page === "archive" && (
          <section className="panel">
            <span className="eyebrow">THE CASE FILES</span>
            <h1>Reopen a past docket.</h1>
            <p>
              Archive play adds to your concept statistics without changing your
              streak, career rank, or leaderboard.
            </p>
            <h2>October 2026 · Bonus case files</h2>
            <p>
              31 extra dockets, open from day one. These cases are separate from
              the daily game and do not affect your streak or leaderboard.
            </p>
            <div className="archive-grid">
              {Array.from({ length: 31 }, (_, i) => {
                const date = `2026-10-${String(i + 1).padStart(2, "0")}`;
                return (
                  <button
                    key={date}
                    disabled={busy || !bonusDates.includes(date)}
                    onClick={() =>
                      load("bonus-archive?date=" + date, "bonus archive")
                    }
                    aria-label={`Play bonus docket October ${i + 1}`}
                  >
                    {i + 1}
                    <small>OCT</small>
                  </button>
                );
              })}
            </div>
            <h2>Past daily dockets</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                load("archive?date=" + archiveDate, "archive");
              }}
            >
              <label>
                Choose a past date
                <input
                  type="date"
                  required
                  value={archiveDate}
                  max={today?.date}
                  onChange={(e) => setArchiveDate(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy || !sessionReady}>
                Open docket
              </button>
            </form>
          </section>
        )}
        {page === "leaderboard" && (
          <section className="panel">
            <span className="eyebrow">THE HONOR ROLL</span>
            <h1>Leaderboard</h1>
            <label>
              Rank by
              <select
                value={boardType}
                onChange={(e) => setBoardType(e.target.value)}
              >
                <option value="today">Today</option>
                <option value="streak">Current streak</option>
                <option value="longest">Longest streak</option>
                <option value="alltime">All-time correct</option>
              </select>
            </label>
            <ol className="leaderboard">
              {board.map((p, i) => (
                <li key={p.handle}>
                  <span>
                    {i + 1}. {p.handle}
                  </span>
                  <strong>
                    {boardType === "today"
                      ? `${p.score}/5`
                      : boardType === "streak"
                        ? p.streak
                        : boardType === "longest"
                          ? p.longestStreak
                          : p.careerCorrect}
                  </strong>
                </li>
              ))}
            </ol>
            {!board.length && (
              <p>The bench is open. Be the first to make your case.</p>
            )}
            <h2>Claim your counsel’s handle</h2>
            <p>
              No email. No password. Keep your recovery token safe to restore
              your handle on another device.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setBusy(true);
                try {
                  const d = await api<{ recoveryToken: string }>("handle", {
                    handle,
                  });
                  setToken(d.recoveryToken);
                  refreshStats();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Handle
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                  autoComplete="nickname"
                />
              </label>
              <button className="primary" disabled={busy || !sessionReady}>
                Create handle
              </button>
            </form>
            {token && (
              <div className="token">
                <strong>Your recovery token — shown once</strong>
                <p>Save this privately before leaving this page.</p>
                <code>{token}</code>
                <button onClick={() => setToken("")}>I saved my token</button>
              </div>
            )}
            <details>
              <summary>Restore an existing handle</summary>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await api("handle/recover", { recoveryToken: recovery });
                    setRecovery("");
                    setNotice("Handle restored.");
                    const p = await api<Puzzle>("today");
                    setToday(p);
                    refreshStats();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Recovery token
                  <input
                    type="password"
                    value={recovery}
                    onChange={(e) => setRecovery(e.target.value)}
                    required
                  />
                </label>
                <button disabled={busy || !sessionReady}>Restore handle</button>
              </form>
            </details>
            <p role="status">{notice}</p>
          </section>
        )}
        {page === "about" && (
          <section className="panel">
            <span className="eyebrow">BEHIND THE BENCH</span>
            <h1>About Objectle</h1>
            <p>
              Objectle turns the Federal Rules of Evidence into five short
              courtroom moments. It’s made for curious minds, future lawyers,
              and everyone who has ever wanted to say “Objection!”
            </p>
            <h2>How it works</h2>
            <p>
              Everyone gets the same daily docket. Complete all five questions
              to keep your streak, regardless of score. New dockets arrive at
              midnight in the configured reset timezone (America/New_York by
              default). The server determines the active date.
            </p>
            <p>
              All people, businesses, and courtroom situations are fictional.
              Development content is awaiting human legal review.
            </p>
            <blockquote>{legal}</blockquote>
          </section>
        )}
      </main>
      <footer>
        <span>{legal}</span>
        <button onClick={() => setPage("about")}>Court information</button>
      </footer>
    </div>
  );
}
