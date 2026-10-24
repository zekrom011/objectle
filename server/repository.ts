import "./config.js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
const filename = process.env.DATABASE_PATH || "data/objectle.sqlite";
fs.mkdirSync(path.dirname(filename), { recursive: true });
const db = new Database(filename);
db.pragma("journal_mode = WAL");
db.exec(
  `CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,handle TEXT UNIQUE COLLATE NOCASE,recovery TEXT UNIQUE);CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,player TEXT,date TEXT,mode TEXT,ids TEXT,answers TEXT DEFAULT '[]',started INTEGER,finished INTEGER,UNIQUE(player,date,mode));CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`,
);
if (!db.prepare("SELECT value FROM settings WHERE key='optionSecret'").get())
  db.prepare("INSERT INTO settings VALUES('optionSecret',?)").run(
    randomBytes(32).toString("hex"),
  );
export const repository = {
  findPlayer: (id: string) =>
    db.prepare("SELECT id,handle FROM players WHERE id=?").get(id) as any,
  createPlayer: (id: string) =>
    db.prepare("INSERT INTO players(id) VALUES(?)").run(id),
  listPlayerRounds: (id: string) =>
    db
      .prepare("SELECT * FROM rounds WHERE player=? ORDER BY date")
      .all(id) as any[],
  findDateRound: (id: string, date: string, mode: string) =>
    db
      .prepare("SELECT * FROM rounds WHERE player=? AND date=? AND mode=?")
      .get(id, date, mode) as any,
  createRound: (r: any) =>
    db
      .prepare(
        "INSERT INTO rounds(id,player,date,mode,ids,started) VALUES(@id,@player,@date,@mode,@ids,@started)",
      )
      .run(r),
  findOwnedRound: (id: string, player: string) =>
    db
      .prepare("SELECT * FROM rounds WHERE id=? AND player=?")
      .get(id, player) as any,
  saveAnswers: (answers: string, id: string) =>
    db.prepare("UPDATE rounds SET answers=? WHERE id=?").run(answers, id),
  finishRound: (time: number, id: string) =>
    db.prepare("UPDATE rounds SET finished=? WHERE id=?").run(time, id),
  assignHandle: (handle: string, recovery: string, id: string) =>
    db
      .prepare("UPDATE players SET handle=?,recovery=? WHERE id=?")
      .run(handle, recovery, id),
  recoverHandle: (hash: string) =>
    db
      .prepare("SELECT id,handle FROM players WHERE recovery=?")
      .get(hash) as any,
  listHandles: () =>
    db
      .prepare("SELECT id,handle FROM players WHERE handle IS NOT NULL")
      .all() as any[],
  findCompletedDaily: (id: string, date: string) =>
    db
      .prepare(
        "SELECT * FROM rounds WHERE player=? AND date=? AND mode='daily' AND finished IS NOT NULL",
      )
      .get(id, date) as any,
  optionSecret: () =>
    (
      db
        .prepare("SELECT value FROM settings WHERE key='optionSecret'")
        .get() as { value: string }
    ).value,
  transaction: <T extends (...args: any[]) => any>(fn: T) => db.transaction(fn),
};
