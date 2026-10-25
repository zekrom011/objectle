import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve("."),
  dir = mkdtempSync(join(tmpdir(), "objectle-bonus-"));
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
  mkdirSync(join(dir, "content/bonus-archive"), { recursive: true });
  const bonus = Array.from({ length: 155 }, (_, i) => ({
    ...scenarios[0],
    id: `bonus-${i}`,
    transcript: [
      { speaker: "Q", text: `What did the absent bystander ${i} say?` },
      { speaker: "A", text: "He said the light was red." },
    ],
  }));
  writeFileSync(
    join(dir, "content/bonus-archive/batch.json"),
    JSON.stringify(bonus),
  );
  writeFileSync(
    join(dir, "content/bonus-archive/schedule.json"),
    JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 31 }, (_, i) => [
          `2026-10-${String(i + 1).padStart(2, "0")}`,
          bonus.slice(i * 5, i * 5 + 5).map((x) => x.id),
        ]),
      ),
    ),
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

describe("bonus archive", () => {
  it("exposes all 31 separate October dockets without leaking answers", async () => {
    const dates = await call("bonus-archive/dates");
    expect(dates.body.dates).toHaveLength(31);
    const p = await call("bonus-archive?date=2026-10-31", dates.cookie);
    expect(p.status).toBe(200);
    expect(p.body.mode).toBe("bonus");
    expect(p.body.questions).toHaveLength(5);
    expect(p.body.puzzleNumber).toBe(31);
    for (const q of p.body.questions) {
      expect(q).not.toHaveProperty("correct");
      expect(q).not.toHaveProperty("explanation");
      expect(q.id).toMatch(/^bonus-/);
    }
    expect(
      (await call("bonus-archive?date=2026-11-01", dates.cookie)).status,
    ).toBe(404);
    expect(
      (await call("bonus-archive?date=2026-10-32", dates.cookie)).status,
    ).toBe(400);
    const future = new Date(Date.parse(date) + 86400000)
      .toISOString()
      .slice(0, 10);
    expect((await call("archive?date=" + future, dates.cookie)).status).toBe(
      403,
    );
  });
  it("persists answers and counts weak spots without daily credit", async () => {
    const p = await call("bonus-archive?date=2026-10-01"),
      cookie = p.cookie;
    await call("handle", cookie, { handle: "BonusCounsel" });
    for (const q of p.body.questions) {
      const a = await call("answer", cookie, {
        sessionId: p.body.sessionId,
        questionId: q.id,
        answer: "Hearsay",
      });
      expect(a.status).toBe(200);
      expect(a.body.correct).toBe(true);
    }
    const refreshed = await call("bonus-archive?date=2026-10-01", cookie);
    expect(refreshed.body.answers).toHaveLength(5);
    const result = await call("submit-daily", cookie, {
      sessionId: p.body.sessionId,
    });
    expect(result.body.score).toBe(5);
    expect(result.body.streak).toBe(0);
    expect(result.body.careerCorrect).toBe(0);
    expect(result.body.concepts[0].total).toBe(5);
    expect((await call("leaderboard?type=today", cookie)).body.entries).toEqual(
      [],
    );
    expect(
      (await call("leaderboard?type=alltime", cookie)).body.entries.find(
        (x: any) => x.handle === "BonusCounsel",
      ).careerCorrect,
    ).toBe(0);
    const practice = await call("practice", cookie, { tag: "hearsay" });
    expect(practice.status).toBe(200);
  });
  it("production refuses unreviewed bonus dockets even with override enabled", async () => {
    await new Promise<void>((resolve) => {
      server.once("exit", () => resolve());
      server.kill();
    });
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
          NODE_ENV: "production",
          ALLOW_UNREVIEWED: "true",
        },
      },
    );
    for (let i = 0; i < 100; i++) {
      try {
        await call("health");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    const p = join(dir, "content/bonus-archive/batch.json");
    const rows = JSON.parse((await import("node:fs")).readFileSync(p, "utf8"));
    rows.forEach((s: any) => (s.reviewed = false));
    writeFileSync(p, JSON.stringify(rows));
    expect((await call("bonus-archive/dates")).body.dates).toEqual([]);
    expect((await call("bonus-archive?date=2026-10-31")).status).toBe(404);
  });
});
