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
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (page === "leaderboard" && today)
      api<{ entries: any[] }>("leaderboard?type=" + boardType)
        .then((d) => setBoard(d.entries))
        .catch((e) => setError(e.message));
  }, [page, boardType, today]);
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
  const share = `Objectle! #${puzzle?.puzzleNumber}\n${result?.grid || puzzle?.answers.map((a) => (a.correct ? "🟩" : "🟥")).join("")}\n${result?.title} · ${result?.score}/${puzzle?.questions.length || 5}\n${result?.streak || 0} day streak\n${location.origin}`;
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
    setNotice("Result copied. Your objections stay between us.");
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
    x.fillText(`Docket #${puzzle?.puzzleNumber} · ${result?.title}`, 70, 190);
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
        : "Sustained! A sound legal call."
      : "Overruled. Let’s examine the rule."
    : "Counsel, you may proceed.";
  return (
    <>
      <header className="header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("home");
          }}
        >
          Objectle<span>!</span>
          <small>THE DAILY COURTROOM GAME</small>
        </a>
        <nav aria-label="Main navigation">
          <button onClick={() => setPage("archive")}>Archive</button>
          <button onClick={() => setPage("leaderboard")}>Leaderboard</button>
          <button onClick={() => setPage("about")}>About</button>
          <button
            className="theme"
            aria-label="Toggle dark mode"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "☾" : "☀"}
          </button>
        </nav>
      </header>
      <main>
        <div className="edition">
          <span>FIVE MOMENTS. ONE SHARP MIND.</span>
          <span>
            {today?.date || "THE DAILY DOCKET"} <b>•</b> VOL.{" "}
            {today?.puzzleNumber || "01"}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {page === "home" && (
          <>
            <section className="intro">
              <div className="eyebrow">ALL RISE. IT’S YOUR TURN.</div>
              <h1>
                A little courtroom drama.
                <br />
                <em>A sharper legal mind.</em>
              </h1>
              <p>
                Five moments on the stand. Five calls to make.
                <br />
                Would your objection hold up in court?
              </p>
            </section>
            <Court />
            <section className="docket">
              <div>
                <span className="eyebrow">TODAY’S DOCKET</span>
                <h2>The court is yours.</h2>
                <p>About 3 minutes · A fresh challenge every day</p>
              </div>
              <span className="badge">
                ⚖ {today?.difficulty || "Daily challenge"}
              </span>
              <button
                className="primary"
                disabled={!today || busy}
                onClick={() => load("today", "daily")}
              >
                {today?.completed
                  ? "View today’s verdict"
                  : today?.answers.length
                    ? "Resume today's docket"
                    : "Play today's docket"}{" "}
                <span>↗</span>
              </button>
              {today?.completed && (
                <p className="countdown">
                  {today.result?.title} · {today.result?.score}/5 · Next docket:{" "}
                  {remaining}
                </p>
              )}
            </section>
            <section className="stats-row">
              <div>
                <strong>
                  {stats.streak || 0}
                  <span>🔥</span>
                </strong>
                <small>CURRENT STREAK</small>
              </div>
              <div>
                <strong>{stats.longestStreak || 0}</strong>
                <small>LONGEST STREAK</small>
              </div>
              <div>
                <strong>{stats.careerRank || "New counsel"}</strong>
                <small>CAREER RANK</small>
              </div>
            </section>
            <section className="how">
              <h2>Make your case.</h2>
              <div>
                <article>
                  <b>01</b>
                  <h3>Hear the testimony</h3>
                  <p>
                    A bite-sized moment from a fictional trial. Read between the
                    lines.
                  </p>
                </article>
                <article>
                  <b>02</b>
                  <h3>Make the call</h3>
                  <p>
                    Pick the right objection. Sometimes, the smart move is no
                    objection.
                  </p>
                </article>
                <article>
                  <b>03</b>
                  <h3>Learn the ruling</h3>
                  <p>
                    Get the why, the rule, and a little more confidence for your
                    next case.
                  </p>
                </article>
              </div>
            </section>
          </>
        )}
        {page === "game" && puzzle && question && (
          <>
            <div className="game-heading">
              <div>
                <span className="eyebrow">
                  {mode.toUpperCase()} DOCKET #{puzzle.puzzleNumber}
                </span>
                <h1>Make your objection.</h1>
              </div>
              <strong>
                {index + 1} <span>/ {puzzle.questions.length}</span>
              </strong>
            </div>
            <div
              className="progress"
              aria-label={`Question ${index + 1} of ${puzzle.questions.length}`}
            >
              {puzzle.questions.map((q, i) => (
                <span
                  key={q.id}
                  className={i < index ? "done" : i === index ? "current" : ""}
                />
              ))}
            </div>
            <Court ruling={ruling} />
            <section className="question">
              <span className="eyebrow">
                {question.examiner} addresses the witness
              </span>
              <h2>{question.setting}</h2>
              <div className="transcript">
                {question.transcript.map((l, i) => (
                  <p key={i}>
                    <b>{l.speaker}.</b>
                    <span>{l.text}</span>
                  </p>
                ))}
              </div>
              <div className="options" aria-label="Choose your objection">
                {question.options.map((o, i) => (
                  <button
                    key={o}
                    disabled={busy || !!feedback}
                    onClick={() => answer(o)}
                    className={feedback?.correctOption === o ? "correct" : ""}
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    {o}
                  </button>
                ))}
              </div>
              {feedback && (
                <div
                  className={`feedback ${feedback.correct ? "success" : "miss"}`}
                  role="status"
                >
                  <span className="eyebrow">
                    THE JUDGE’S RULING · {feedback.rule}
                  </span>
                  <h3>{ruling}</h3>
                  <p>{feedback.explanation}</p>
                  <p className="trap">
                    Watch for the trap: {feedback.trap_note}
                  </p>
                  <button className="primary" disabled={busy} onClick={next}>
                    {puzzle.answers.length === puzzle.questions.length
                      ? "See my verdict"
                      : "Next question"}{" "}
                    →
                  </button>
                </div>
              )}
            </section>
          </>
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
            <p>Every ruling is a chance to sharpen your instincts.</p>
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
              Practice your judgment. Archive play builds your evidence notebook
              without changing your streak, career rank, or leaderboard.
            </p>
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
              <button className="primary" disabled={busy || !today}>
                Open docket
              </button>
            </form>
          </section>
        )}
        {page === "leaderboard" && (
          <section className="panel">
            <span className="eyebrow">THE HONOR ROLL</span>
            <h1>Counsel of distinction.</h1>
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
              <button className="primary" disabled={busy || !today}>
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
                <button disabled={busy || !today}>Restore handle</button>
              </form>
            </details>
            <p role="status">{notice}</p>
          </section>
        )}
        {page === "about" && (
          <section className="panel">
            <span className="eyebrow">BEHIND THE BENCH</span>
            <h1>A daily exercise in good judgment.</h1>
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
        <a className="footer-logo" href="#" onClick={() => setPage("home")}>
          Objectle!
        </a>
        <p>{legal}</p>
        <span>A little wiser. One objection at a time.</span>
      </footer>
    </>
  );
}
