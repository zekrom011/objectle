import {
  careerRanks,
  scoreTitles,
  today,
  days,
  launch,
  nextReset,
} from "./config.js";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { repository as db } from "./repository.js";
import { randomBytes, createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import { z } from "zod";
import {
  loadContent,
  loadBonusContent,
  readBonusSchedule,
  readSchedule,
  shuffle,
  rng,
  tags,
} from "./content.js";
const app = express();
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 150,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
const token = () => randomBytes(32).toString("hex"),
  hash = (v: string) => createHash("sha256").update(v).digest("hex");
const cookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 31536000000,
};
app.use("/api", (req: any, res, next) => {
  let id = (req.headers.cookie || "")
    .split("; ")
    .find((x: string) => x.startsWith("sid="))
    ?.slice(4);
  if (!id || !db.findPlayer(id)) {
    id = token();
    db.createPlayer(id);
    res.cookie("sid", id, cookie);
  }
  req.player = id;
  next();
});
const bank = (mode = "daily") =>
  (mode === "bonus"
    ? loadBonusContent()
    : mode.startsWith("practice:")
      ? [...loadContent(), ...loadBonusContent()]
      : loadContent()
  ).filter(
    (x) =>
      x.reviewed ||
      (process.env.NODE_ENV !== "production" &&
        process.env.ALLOW_UNREVIEWED === "true"),
  );
const fail = (message: string, status = 400) =>
  Object.assign(Error(message), { status });
function stats(player: string) {
  const rows = db.listPlayerRounds(player);
  let streak = 0,
    longestStreak = 0,
    last = "",
    careerCorrect = 0;
  const concepts: Record<
    string,
    { tag: string; total: number; correct: number; accuracy: number }
  > = {};
  for (const r of rows) {
    for (const f of JSON.parse(r.answers)) {
      const c = (concepts[f.concept_tag] ??= {
        tag: f.concept_tag,
        total: 0,
        correct: 0,
        accuracy: 0,
      });
      c.total++;
      c.correct += +f.correct;
      c.accuracy = Math.round((c.correct / c.total) * 100);
    }
    if (r.mode === "daily" && r.finished) {
      streak = last && days(r.date, last) === 1 ? streak + 1 : 1;
      last = r.date;
      longestStreak = Math.max(streak, longestStreak);
      careerCorrect += JSON.parse(r.answers).filter(
        (x: any) => x.correct,
      ).length;
    }
  }
  if (!last || days(today(), last) > 1) streak = 0;
  return {
    streak,
    longestStreak,
    careerCorrect,
    careerRank: careerRanks.find((x) => careerCorrect >= x.threshold)!.title,
    concepts: Object.values(concepts),
  };
}
function result(r: any) {
  const a = JSON.parse(r.answers),
    score = a.filter((x: any) => x.correct).length;
  return {
    score,
    title: scoreTitles[score],
    grid: a.map((x: any) => (x.correct ? "🟩" : "🟥")).join(""),
    ...stats(r.player),
  };
}
function round(req: any, date: string, mode: string, tag?: string) {
  const b = bank(mode);
  let r = db.findDateRound(req.player, date, mode);
  if (!r) {
    let ids: string[];
    if (mode.startsWith("practice:")) {
      const past = new Set(
        Object.entries(readSchedule())
          .filter(([d]) => d < today())
          .flatMap(([, v]) => v)
          .concat(Object.values(readBonusSchedule()).flat()),
      );
      ids = shuffle(
        b.filter((x) => x.concept_tag === tag && past.has(x.id)),
        rng(token()),
      )
        .slice(0, 5)
        .map((x) => x.id);
    } else
      ids = (mode === "bonus" ? readBonusSchedule() : readSchedule())[date];
    if (!ids?.length || ids.some((id) => !b.some((x) => x.id === id)))
      throw fail("No reviewed docket available for this date", 404);
    r = {
      id: token(),
      player: req.player,
      date,
      mode,
      ids: JSON.stringify(ids),
      answers: "[]",
      started: Date.now(),
      finished: null,
    };
    db.createRound(r);
  }
  const questions = JSON.parse(r.ids).map((id: string) => {
    const s = b.find((x) => x.id === id);
    if (!s) throw fail("Content unavailable", 404);
    const { correct, explanation, rule, trap_note, reviewed, ...q } = s;
    const seed = createHmac("sha256", db.optionSecret())
      .update(r.id + ":" + id)
      .digest("hex");
    return { ...q, options: shuffle(s.options, rng(seed)) };
  });
  const avg =
    questions.reduce(
      (n: number, q: any) =>
        n + { easy: 1, medium: 2, hard: 3 }[q.difficulty as "easy"],
      0,
    ) / questions.length;
  return {
    sessionId: r.id,
    date,
    puzzleNumber:
      mode === "bonus" ? Number(date.slice(-2)) : days(date, launch) + 1,
    mode: mode === "bonus" ? "bonus" : mode,
    difficulty: avg >= 2.4 ? "Brutal" : avg < 1.6 ? "Gentle" : "Standard",
    questions,
    answers: JSON.parse(r.answers),
    completed: !!r.finished,
    result: r.finished ? result(r) : undefined,
    nextResetAt: nextReset(),
    ...stats(req.player),
  };
}
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (x) =>
      !isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x,
  );
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/api/today", (req, res) => res.json(round(req, today(), "daily")));
app.get("/api/archive", (req, res) => {
  const date = dateSchema.parse(req.query.date);
  if (date >= today()) throw fail("Only past dockets are available", 403);
  res.json(round(req, date, "archive"));
});
app.get("/api/bonus-archive/dates", (_req, res) => {
  const eligible = new Set(bank("bonus").map((s) => s.id));
  const dates = Object.entries(readBonusSchedule())
    .filter(
      ([date, ids]) =>
        /^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(date) &&
        ids.length === 5 &&
        ids.every((id) => eligible.has(id)),
    )
    .map(([date]) => date)
    .sort();
  res.json({ dates });
});
app.get("/api/bonus-archive", (req, res) => {
  const date = dateSchema.parse(req.query.date);
  if (!/^2026-10-/.test(date) || !readBonusSchedule()[date])
    throw fail("Bonus docket not found", 404);
  res.json(round(req, date, "bonus"));
});
app.post("/api/practice", (req, res) => {
  const { tag } = z.object({ tag: z.enum(tags) }).parse(req.body);
  res.json(round(req, today(), "practice:" + token(), tag));
});
app.post("/api/answer", (req: any, res) => {
  const b = z
    .object({
      sessionId: z.string(),
      questionId: z.string(),
      answer: z.string(),
    })
    .parse(req.body);
  const answer = db.transaction(() => {
    const r = db.findOwnedRound(b.sessionId, req.player);
    if (!r) throw fail("Round not found", 404);
    const a = JSON.parse(r.answers),
      ids = JSON.parse(r.ids);
    if (r.finished || ids[a.length] !== b.questionId)
      throw fail("Answer order enforced; answers cannot be changed", 409);
    if (r.mode === "daily" && r.date !== today())
      throw fail("This daily docket has expired", 409);
    const s = bank(r.mode).find((x) => x.id === b.questionId);
    if (!s || !s.options.includes(b.answer as any))
      throw fail("Invalid option");
    const f = {
      questionId: s.id,
      answer: b.answer,
      correct: b.answer === s.correct,
      correctOption: s.correct,
      explanation: s.explanation,
      rule: s.rule,
      trap_note: s.trap_note,
      concept_tag: s.concept_tag,
    };
    a.push(f);
    db.saveAnswers(JSON.stringify(a), r.id);
    return f;
  })();
  res.json(answer);
});
app.post("/api/submit-daily", (req: any, res) => {
  const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
  const r = db.findOwnedRound(sessionId, req.player);
  if (!r || JSON.parse(r.answers).length !== JSON.parse(r.ids).length)
    throw fail("Complete every question first", 409);
  if (!r.finished && r.mode === "daily" && r.date !== today())
    throw fail("This daily docket has expired", 409);
  if (!r.finished) db.finishRound(Date.now(), r.id);
  res.json(result(r));
});
app.get("/api/stats", (req: any, res) => res.json(stats(req.player)));
app.post(
  "/api/handle",
  rateLimit({ windowMs: 3600000, limit: 10 }),
  (req: any, res) => {
    const { handle } = z
      .object({
        handle: z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9_]{2,19}$/)
          .refine((x) => !/(fuck|shit|cunt|nigger|nazi|bitch)/i.test(x)),
      })
      .parse(req.body);
    if (db.findPlayer(req.player).handle)
      throw fail("Handle already created", 409);
    const recoveryToken = token();
    try {
      db.assignHandle(handle, hash(recoveryToken), req.player);
    } catch {
      throw fail("Handle unavailable", 409);
    }
    res.json({ handle, recoveryToken });
  },
);
app.post(
  "/api/handle/recover",
  rateLimit({ windowMs: 3600000, limit: 10 }),
  (req, res) => {
    const { recoveryToken } = z
      .object({ recoveryToken: z.string().length(64) })
      .parse(req.body);
    const p = db.recoverHandle(hash(recoveryToken));
    if (!p) throw fail("Invalid recovery token", 401);
    res.cookie("sid", p.id, cookie);
    res.json({ handle: p.handle, ...stats(p.id) });
  },
);
app.get("/api/leaderboard", (req, res) => {
  const type = z
    .enum(["today", "streak", "longest", "alltime"])
    .parse(req.query.type || "today");
  let entries = db.listHandles().map((p) => {
    const r = db.findCompletedDaily(p.id, today());
    return {
      handle: p.handle,
      ...stats(p.id),
      score: r ? result(r).score : 0,
      duration: r ? r.finished - r.started : Infinity,
      played: !!r,
    };
  });
  if (type === "today") entries = entries.filter((x) => x.played);
  entries.sort((a, b) =>
    type === "today"
      ? b.score - a.score || a.duration - b.duration
      : type === "streak"
        ? b.streak - a.streak
        : type === "longest"
          ? b.longestStreak - a.longestStreak
          : b.careerCorrect - a.careerCorrect,
  );
  res.json({ entries: entries.slice(0, 100) });
});
app.use(express.static("dist"));
app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api/") || !fs.existsSync("dist/index.html"))
    return next();
  res.sendFile("index.html", { root: "dist" });
});
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err instanceof z.ZodError ? 400 : err.status || 500).json({
    error: {
      message:
        err instanceof z.ZodError
          ? "Invalid request"
          : err.status
            ? err.message
            : "Service unavailable",
    },
  }),
);
app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("Objectle API listening"),
);
