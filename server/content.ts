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
export function loadContent() {
  return (
    fs.existsSync("content/scenarios")
      ? fs.readdirSync("content/scenarios")
      : []
  )
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) =>
      z
        .array(scenarioSchema)
        .parse(JSON.parse(fs.readFileSync("content/scenarios/" + f, "utf8"))),
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
