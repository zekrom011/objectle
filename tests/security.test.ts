import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve("."),
  dir = mkdtempSync(join(tmpdir(), "objectle-api-"));
let port: number,
  server: ChildProcess,
  logs = "";
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const yesterday = new Date(Date.parse(date) - 86400000)
  .toISOString()
  .slice(0, 10);
const scenarios = Array.from({ length: 10 }, (_, i) => ({
  id: `test-${i}`,
  difficulty: "easy",
  setting:
    "Civil trial: a nonparty statement is offered for its truth, without an exception.",
  examiner: "plaintiff's counsel",
  transcript: [
    { speaker: "Q", text: `What did witness ${i} tell you?` },
    { speaker: "A", text: "She said the floor was wet." },
  ],
  options: ["Hearsay", "Relevance", "Leading question", "No objection"],
  correct: "Hearsay",
  rule: "FRE 802",
  explanation: "The statement is offered for its truth without an exception.",
  trap_note: "The question does not suggest an answer.",
  concept_tag: "hearsay",
  reviewed: true,
}));
async function call(path: string, cookie = "", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
  };
}
beforeAll(async () => {
  port = await new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
  mkdirSync(join(dir, "content/scenarios"), { recursive: true });
  mkdirSync(join(dir, "content/schedule"), { recursive: true });
  writeFileSync(
    join(dir, "content/scenarios/batch.json"),
    JSON.stringify(scenarios),
  );
  writeFileSync(
    join(dir, "content/schedule/schedule.json"),
    JSON.stringify({
      [date]: scenarios.slice(0, 5).map((s) => s.id),
      [yesterday]: scenarios.slice(5).map((s) => s.id),
    }),
  );
  server = spawn(
    process.execPath,
    [
      "--import",
      join(root, "node_modules/tsx/dist/loader.mjs"),
      join(root, "server/index.ts"),
    ],
    {
      cwd: dir,
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "test.sqlite"),
        ALLOW_UNREVIEWED: "false",
        NODE_ENV: "test",
        RESET_TIMEZONE: "America/New_York",
      },
    },
  );
  server.stdout?.on("data", (d) => (logs += d));
  server.stderr?.on("data", (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      await call("health");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw Error(logs);
}, 15000);
afterAll(async () => {
  server?.kill();
  await new Promise((r) => setTimeout(r, 100));
  rmSync(dir, { recursive: true, force: true });
});
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a: number[], r: () => number) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
describe("API integrity", () => {
  it("hides rulings, enforces order and ownership, persists answers, recomputes scores idempotently", async () => {
    const a = await call("today");
    expect(a.status).toBe(200);
    for (const q of a.body.questions)
      for (const key of ["correct", "explanation", "rule", "trap_note"])
        expect(q).not.toHaveProperty(key);
    const b = await call("today");
    expect(b.body.questions.map((q: any) => q.id)).toEqual(
      a.body.questions.map((q: any) => q.id),
    );
    const id = a.body.sessionId,
      qs = a.body.questions;
    expect(
      (
        await call("answer", b.cookie, {
          sessionId: id,
          questionId: qs[0].id,
          answer: "Hearsay",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("answer", a.cookie, {
          sessionId: id,
          questionId: qs[1].id,
          answer: "Hearsay",
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("submit-daily", a.cookie, { sessionId: id, score: 5 }))
        .status,
    ).toBe(409);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await call("answer", a.cookie, {
            sessionId: id,
            questionId: qs[i].id,
            answer: i === 0 ? "Relevance" : "Hearsay",
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await call("answer", a.cookie, {
          sessionId: id,
          questionId: qs[0].id,
          answer: "Hearsay",
        })
      ).status,
    ).toBe(409);
    expect((await call("today", a.cookie)).body.answers).toHaveLength(5);
    const result = await call("submit-daily", a.cookie, {
      sessionId: id,
      score: 5,
    });
    expect(result.body.score).toBe(4);
    expect(result.body.streak).toBe(1);
    expect(
      (await call("submit-daily", a.cookie, { sessionId: id })).body
        .careerCorrect,
    ).toBe(4);
  });
  it("does not disclose correct slots through a public session-ID permutation", async () => {
    let predicted = 0;
    for (let player = 0; player < 4; player++) {
      const a = await call("today");
      a.body.questions.forEach((q: any, i: number) => {
        const slot = shuffle(
          [0, 1, 2, 3],
          rng(a.body.sessionId + ":positions:" + Math.floor(i / 4)),
        )[i % 4];
        if (q.options[slot] === "Hearsay") predicted++;
      });
    }
    expect(predicted).toBeLessThan(20);
  });
  it("rejects future archive and keeps archive out of career and streak", async () => {
    const a = await call("archive?date=" + yesterday);
    expect(a.status).toBe(200);
    for (const q of a.body.questions)
      expect(
        (
          await call("answer", a.cookie, {
            sessionId: a.body.sessionId,
            questionId: q.id,
            answer: "Hearsay",
          })
        ).status,
      ).toBe(200);
    const r = await call("submit-daily", a.cookie, {
      sessionId: a.body.sessionId,
    });
    expect(r.body.score).toBe(5);
    expect(r.body.careerCorrect).toBe(0);
    expect(r.body.streak).toBe(0);
    expect((await call("archive?date=2099-01-01", a.cookie)).status).toBe(403);
    expect((await call("archive?date=2026-02-31", a.cookie)).status).toBe(400);
  });
  it("enforces case-insensitive handles and recovery authentication", async () => {
    const a = await call("today"),
      b = await call("today");
    const handle = await call("handle", a.cookie, { handle: "ReviewCounsel" });
    expect(handle.status).toBe(200);
    expect(handle.body.recoveryToken).toHaveLength(64);
    expect(
      (await call("handle", b.cookie, { handle: "reviewcounsel" })).status,
    ).toBe(409);
    expect(
      (
        await call("handle/recover", b.cookie, {
          recoveryToken: "0".repeat(64),
        })
      ).status,
    ).toBe(401);
    const recovery = await call("handle/recover", b.cookie, {
      recoveryToken: handle.body.recoveryToken,
    });
    expect(recovery.status).toBe(200);
    expect((await call("today", recovery.cookie)).body.sessionId).toBe(
      a.body.sessionId,
    );
  });
  it("serializes duplicate answers so concurrent requests cannot earn extra credit", async () => {
    const a = await call("today"),
      payload = {
        sessionId: a.body.sessionId,
        questionId: a.body.questions[0].id,
        answer: "Hearsay",
      };
    const responses = await Promise.all([
      call("answer", a.cookie, payload),
      call("answer", a.cookie, payload),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await call("today", a.cookie)).body.answers).toHaveLength(1);
  });
});
