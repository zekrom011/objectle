import fs from "node:fs";
import readline from "node:readline/promises";
import {
  loadContent,
  loadBonusContent,
  validateBonusArchive,
  buildSchedule,
} from "../server/content.js";
const command = process.argv[2],
  bank = loadContent();
const counts = (key: string) =>
  bank.reduce((a: any, s: any) => ((a[s[key]] = (a[s[key]] || 0) + 1), a), {});
function validate() {
  if (new Set(bank.map((s) => s.id)).size !== bank.length)
    throw Error("Duplicate IDs");
  if (
    new Set(bank.map((s) => JSON.stringify(s.transcript))).size !== bank.length
  )
    throw Error("Duplicate transcripts");
  if (process.env.PARTIAL === "true") return;
  if (bank.length < 900) throw Error("Need 900 scenarios");
  const share =
    bank.filter((s) => s.correct === "No objection").length / bank.length;
  if (share < 0.15 || share > 0.2)
    throw Error("No objection share must be 15–20%");
  if (
    Object.values(counts("concept_tag")).some(
      (n: any) => n / bank.length > 0.25,
    )
  )
    throw Error("Tag exceeds 25%");
  for (const [key, target] of Object.entries({
    easy: 0.35,
    medium: 0.4,
    hard: 0.25,
  })) {
    if (
      Math.abs((counts("difficulty")[key] || 0) / bank.length - target) > 0.05
    )
      throw Error("Difficulty distribution outside target");
  }
}
if (command === "validate") {
  validate();
  if (process.env.PARTIAL !== "true" && fs.existsSync("content/bonus-archive"))
    validateBonusArchive();
  console.log(
    `${bank.length} daily scenarios validated; ${loadBonusContent().length} bonus scenarios`,
  );
} else if (command === "report")
  console.log(
    JSON.stringify(
      {
        total: bank.length,
        bonusTotal: loadBonusContent().length,
        bonusReviewed: loadBonusContent().filter((s) => s.reviewed).length,
        bonus: Object.fromEntries(
          ["difficulty", "concept_tag", "correct", "reviewed"].map((key) => [
            key,
            loadBonusContent().reduce(
              (counts: Record<string, number>, s: any) => {
                counts[String(s[key])] = (counts[String(s[key])] || 0) + 1;
                return counts;
              },
              {},
            ),
          ]),
        ),
        difficulty: counts("difficulty"),
        tags: counts("concept_tag"),
        answers: counts("correct"),
        reviewed: counts("reviewed"),
      },
      null,
      2,
    ),
  );
else if (command === "schedule") {
  validate();
  const eligible = bank.filter(
    (s) =>
      s.reviewed ||
      (process.env.NODE_ENV !== "production" &&
        process.env.ALLOW_UNREVIEWED === "true"),
  );
  const out = buildSchedule(eligible);
  fs.mkdirSync("content/schedule", { recursive: true });
  fs.writeFileSync(
    "content/schedule/schedule.json",
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log("180 dockets generated");
} else if (command === "review") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  for (const directory of ["content/scenarios", "content/bonus-archive"].filter(
    (d) => fs.existsSync(d),
  )) {
    for (const f of fs
      .readdirSync(directory)
      .filter((f) => f.endsWith(".json") && f !== "schedule.json")) {
      const path = directory + "/" + f;
      const batch = JSON.parse(fs.readFileSync(path, "utf8"));
      for (const s of batch) {
        if (s.reviewed) continue;
        console.log(JSON.stringify(s, null, 2));
        const answer = await rl.question(
          "Approve [y], skip [Enter], quit [q]: ",
        );
        if (answer === "q") {
          rl.close();
          process.exit();
        }
        if (answer === "y") {
          s.reviewed = true;
          fs.writeFileSync(path, JSON.stringify(batch, null, 2) + "\n");
        }
      }
    }
  }
  rl.close();
} else throw Error("Unknown command");
