import fs from "node:fs";
import { z } from "zod";
import { launch } from "./config.js";
export const labels = [
  "Hearsay",
  "Relevance",
  "Leading question",
  "Lack of foundation",
  "Lack of personal knowledge",
  "Speculation",
  "Improper character evidence",
  "Improper lay opinion",
  "Unfair prejudice",
  "Argumentative",
  "Asked and answered",
  "Assumes facts not in evidence",
  "Compound question",
  "Narrative",
  "Privilege",
  "Best evidence rule",
  "Authentication",
  "No objection",
] as const;
export const tags = [
  "hearsay",
  "relevance",
  "leading",
  "foundation",
  "character",
  "opinion",
  "speculation",
  "privilege",
  "best-evidence",
  "prejudice",
  "argumentative",
  "other",
] as const;
export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    setting: z.string().min(1),
    examiner: z.enum([
      "plaintiff's counsel",
      "defense counsel",
      "prosecutor",
      "defense attorney",
    ]),
    transcript: z
      .array(z.object({ speaker: z.enum(["Q", "A"]), text: z.string().min(1) }))
      .min(2)
      .max(6),
    options: z.array(z.enum(labels)).length(4),
    correct: z.enum(labels),
    rule: z.string().regex(/^FRE \d{3,4}/),
    explanation: z.string().min(1),
    trap_note: z.string().min(1),
    concept_tag: z.enum(tags),
    reviewed: z.boolean(),
  })
  .superRefine((s, c) => {
    if (new Set(s.options).size !== 4 || !s.options.includes(s.correct))
      c.addIssue({ code: "custom", message: "Invalid options" });
    if (
      s.transcript
        .map((x) => x.text)
        .join(" ")
        .split(/\s+/).length >= 70
    )
      c.addIssue({ code: "custom", message: "Transcript too long" });
  });
export type Scenario = z.infer<typeof scenarioSchema>;
export function loadContent(directory = "content/scenarios") {
  return (fs.existsSync(directory) ? fs.readdirSync(directory) : [])
    .filter((f) => f.endsWith(".json") && f !== "schedule.json")
    .flatMap((f) =>
      z
        .array(scenarioSchema)
        .parse(JSON.parse(fs.readFileSync(directory + "/" + f, "utf8"))),
    );
}
export function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(a: T[], r: () => number) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function buildSchedule(bank: Scenario[]) {
  if (bank.length < 900 || new Set(bank.map((s) => s.id)).size !== bank.length)
    throw Error("At least 900 unique approved scenarios required");
  const pools = {
    easy: bank.filter((x) => x.difficulty === "easy"),
    medium: bank.filter((x) => x.difficulty === "medium"),
    hard: bank.filter((x) => x.difficulty === "hard"),
  };
  const out: Record<string, string[]> = {};
  for (let i = 0; i < 180; i++) {
    const date = new Date(Date.parse(launch) + i * 86400000)
        .toISOString()
        .slice(0, 10),
      r = rng("objectle-v1:" + date),
      ids: string[] = [];
    for (let q = 0; q < 5; q++) {
      const v = r();
      let key = v < 0.35 ? "easy" : v < 0.75 ? "medium" : "hard";
      if (!pools[key as keyof typeof pools].length)
        key = Object.keys(pools).find(
          (k) => pools[k as keyof typeof pools].length,
        )!;
      const p = pools[key as keyof typeof pools];
      ids.push(p.splice(Math.floor(r() * p.length), 1)[0].id);
    }
    out[date] = shuffle(ids, r);
  }
  return out;
}
export function readSchedule(): Record<string, string[]> {
  return fs.existsSync("content/schedule/schedule.json")
    ? JSON.parse(fs.readFileSync("content/schedule/schedule.json", "utf8"))
    : {};
}

export function loadBonusContent() {
  return loadContent("content/bonus-archive");
}
export function readBonusSchedule(): Record<string, string[]> {
  const path = "content/bonus-archive/schedule.json";
  if (!fs.existsSync(path)) return {};
  return z
    .record(z.array(z.string()).length(5))
    .parse(JSON.parse(fs.readFileSync(path, "utf8")));
}
export function validateBonusDistribution(bonus: Scenario[]) {
  const share =
    bonus.filter((s) => s.correct === "No objection").length / bonus.length;
  if (!bonus.length || share < 0.15 || share > 0.2)
    throw Error("Bonus No objection share must be between 15% and 20%");
  const counts = new Map<string, number>();
  for (const scenario of bonus)
    counts.set(
      scenario.concept_tag,
      (counts.get(scenario.concept_tag) || 0) + 1,
    );
  if ([...counts.values()].some((count) => count / bonus.length > 0.25))
    throw Error("No bonus concept tag may exceed 25%");
}

export function validateBonusArchive() {
  const bonus = loadBonusContent(),
    daily = loadContent(),
    schedule = readBonusSchedule();
  const dates = Array.from(
    { length: 31 },
    (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
  );
  if (
    bonus.length !== 155 ||
    Object.keys(schedule).length !== 31 ||
    dates.some((d) => !schedule[d])
  )
    throw Error(
      "Bonus archive requires all 31 October dates and 155 scenarios",
    );
  const all = [...daily, ...bonus];
  if (new Set(all.map((s) => s.id)).size !== all.length)
    throw Error("Duplicate daily/bonus IDs");
  if (new Set(all.map((s) => JSON.stringify(s.transcript))).size !== all.length)
    throw Error("Duplicate daily/bonus transcripts");
  const ids = Object.values(schedule).flat();
  if (
    new Set(ids).size !== 155 ||
    ids.some((id) => !bonus.some((s) => s.id === id))
  )
    throw Error("Bonus schedule must use every bonus scenario exactly once");
  validateBonusDistribution(bonus);
  return bonus;
}
