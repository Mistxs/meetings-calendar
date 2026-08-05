import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "meetings.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL DEFAULT '',
    is_guest INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'link' CHECK (visibility IN ('link', 'private')),
    invite_token TEXT NOT NULL UNIQUE,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS calendar_members (
    calendar_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (calendar_id, user_id),
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    calendar_id TEXT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    location TEXT DEFAULT '',
    description TEXT DEFAULT '',
    photo TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('yes', 'no')),
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    ts INTEGER NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    calendar_id TEXT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'scheduled')),
    event_id TEXT,
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS idea_votes (
    idea_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (idea_id, user_id),
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS idea_dates (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    proposed_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
    FOREIGN KEY (proposed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS idea_date_votes (
    date_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (date_id, user_id),
    FOREIGN KEY (date_id) REFERENCES idea_dates(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === column);
}

if (!hasColumn("users", "password_hash")) {
  db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`);
}

if (!hasColumn("users", "is_guest")) {
  db.exec(`ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0`);
}

if (!hasColumn("events", "end_time")) {
  db.exec(`ALTER TABLE events ADD COLUMN end_time TEXT DEFAULT ''`);
}

if (!hasColumn("events", "calendar_id")) {
  db.exec(`ALTER TABLE events ADD COLUMN calendar_id TEXT REFERENCES calendars(id)`);
}

if (!hasColumn("ideas", "calendar_id")) {
  db.exec(`ALTER TABLE ideas ADD COLUMN calendar_id TEXT REFERENCES calendars(id)`);
}

function migrateDefaultCalendar() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM calendars").get().n;
  if (count > 0) {
    // backfill any orphan rows into first calendar
    const first = db.prepare("SELECT id FROM calendars ORDER BY created_at ASC LIMIT 1").get();
    if (first) {
      db.prepare("UPDATE events SET calendar_id = ? WHERE calendar_id IS NULL").run(first.id);
      db.prepare("UPDATE ideas SET calendar_id = ? WHERE calendar_id IS NULL").run(first.id);
    }
    return;
  }

  const owner = db
    .prepare("SELECT id FROM users WHERE is_guest = 0 ORDER BY created_at ASC LIMIT 1")
    .get()
    || db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get();

  const id = crypto.randomBytes(8).toString("hex");
  const invite = crypto.randomBytes(18).toString("base64url");
  const now = Date.now();

  db.prepare(
    `INSERT INTO calendars (id, slug, name, visibility, invite_token, created_by, created_at)
     VALUES (?, 'shared', 'Общий календарь', 'link', ?, ?, ?)`
  ).run(id, invite, owner?.id || null, now);

  if (owner) {
    db.prepare(
      `INSERT INTO calendar_members (calendar_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`
    ).run(id, owner.id, now);
  }

  const users = db.prepare("SELECT id FROM users").all();
  const addMember = db.prepare(
    `INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, role, joined_at)
     VALUES (?, ?, 'member', ?)`
  );
  for (const u of users) {
    if (owner && u.id === owner.id) continue;
    addMember.run(id, u.id, now);
  }

  db.prepare("UPDATE events SET calendar_id = ? WHERE calendar_id IS NULL").run(id);
  db.prepare("UPDATE ideas SET calendar_id = ? WHERE calendar_id IS NULL").run(id);
}

migrateDefaultCalendar();

export default db;
