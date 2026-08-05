import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
} catch {
  /* ignore */
}

const ADMIN_USER = process.env.SUPERADMIN_USER || "mistxs";
const ADMIN_PASS = process.env.SUPERADMIN_PASSWORD || "";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12h

/** @type {Map<string, { exp: number }>} */
const sessions = new Map();

function cleanSessions() {
  const now = Date.now();
  for (const [token, sess] of sessions) {
    if (sess.exp < now) sessions.delete(token);
  }
}

function getBearer(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export function requireAdmin(req, res) {
  cleanSessions();
  const token = getBearer(req);
  const sess = token ? sessions.get(token) : null;
  if (!sess || sess.exp < Date.now()) {
    res.status(401).json({ error: "Нужна авторизация админа" });
    return false;
  }
  // sliding expiry
  sess.exp = Date.now() + TOKEN_TTL_MS;
  return true;
}

function adminOk(handler) {
  return (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

export function registerAdminRoutes(app) {
  app.post("/api/admin/login", (req, res) => {
    if (!ADMIN_PASS) {
      return res.status(503).json({ error: "SUPERADMIN_PASSWORD не задан на сервере" });
    }
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    sessions.set(token, { exp: Date.now() + TOKEN_TTL_MS });
    res.json({ token, username: ADMIN_USER, expiresIn: TOKEN_TTL_MS });
  });

  app.post("/api/admin/logout", adminOk((req, res) => {
    const token = getBearer(req);
    if (token) sessions.delete(token);
    res.json({ ok: true });
  }));

  app.get("/api/admin/me", adminOk((_req, res) => {
    res.json({ username: ADMIN_USER });
  }));

  app.get("/api/admin/stats", adminOk((_req, res) => {
    res.json({
      users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
      guests: db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_guest = 1").get().n,
      calendars: db.prepare("SELECT COUNT(*) AS n FROM calendars").get().n,
      events: db.prepare("SELECT COUNT(*) AS n FROM events").get().n,
      comments: db.prepare("SELECT COUNT(*) AS n FROM comments").get().n,
      ideas: db.prepare("SELECT COUNT(*) AS n FROM ideas").get().n,
      rsvps: db.prepare("SELECT COUNT(*) AS n FROM rsvps").get().n,
    });
  }));

  app.get("/api/admin/calendars", adminOk((_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*,
                u.name AS owner_name,
                (SELECT COUNT(*) FROM calendar_members m WHERE m.calendar_id = c.id) AS member_count,
                (SELECT COUNT(*) FROM events e WHERE e.calendar_id = c.id) AS event_count,
                (SELECT COUNT(*) FROM ideas i WHERE i.calendar_id = c.id) AS idea_count
         FROM calendars c
         LEFT JOIN users u ON u.id = c.created_by
         ORDER BY c.created_at DESC`
      )
      .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        visibility: r.visibility,
        inviteToken: r.invite_token,
        createdBy: r.created_by,
        ownerName: r.owner_name || null,
        createdAt: r.created_at,
        memberCount: r.member_count,
        eventCount: r.event_count,
        ideaCount: r.idea_count,
      }))
    );
  }));

  app.patch("/api/admin/calendars/:id", adminOk((req, res) => {
    const cal = db.prepare("SELECT * FROM calendars WHERE id = ?").get(req.params.id);
    if (!cal) return res.status(404).json({ error: "Календарь не найден" });
    const { name, visibility } = req.body || {};
    let nextName = cal.name;
    let nextVis = cal.visibility;
    if (name != null) {
      nextName = String(name).trim();
      if (!nextName) return res.status(400).json({ error: "Укажите название" });
    }
    if (visibility != null) {
      if (!["link", "private"].includes(visibility)) {
        return res.status(400).json({ error: "visibility: link или private" });
      }
      nextVis = visibility;
    }
    db.prepare("UPDATE calendars SET name = ?, visibility = ? WHERE id = ?").run(
      nextName,
      nextVis,
      cal.id
    );
    res.json(db.prepare("SELECT * FROM calendars WHERE id = ?").get(cal.id));
  }));

  /**
   * Superadmin bypass: grant a site identity access so any calendar can be opened.
   * Falls back to a dedicated account for the admin when nobody is signed in on the site.
   */
  app.post("/api/admin/calendars/:id/access", adminOk((req, res) => {
    const cal = db.prepare("SELECT * FROM calendars WHERE id = ?").get(req.params.id);
    if (!cal) return res.status(404).json({ error: "Календарь не найден" });

    const requestedId = String(req.body?.userId || "");
    let user = requestedId
      ? db.prepare("SELECT id, name, is_guest FROM users WHERE id = ?").get(requestedId)
      : null;

    if (!user) {
      user = db
        .prepare("SELECT id, name, is_guest FROM users WHERE name = ? COLLATE NOCASE")
        .get(ADMIN_USER);
    }

    if (!user) {
      const id = crypto.randomBytes(9).toString("hex");
      db.prepare(
        "INSERT INTO users (id, name, password_hash, is_guest, created_at) VALUES (?, ?, '', 0, ?)"
      ).run(id, ADMIN_USER, Date.now());
      user = { id, name: ADMIN_USER, is_guest: 0 };
    }

    db.prepare(
      `INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, role, joined_at)
       VALUES (?, ?, 'member', ?)`
    ).run(cal.id, user.id, Date.now());

    res.json({
      slug: cal.slug,
      user: { id: user.id, name: user.name, isGuest: !!user.is_guest },
    });
  }));

  app.delete("/api/admin/calendars/:id", adminOk((req, res) => {
    const result = db.prepare("DELETE FROM calendars WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "Календарь не найден" });
    res.json({ ok: true });
  }));

  app.get("/api/admin/events", adminOk((req, res) => {
    const calendarId = req.query.calendarId || null;
    const rows = calendarId
      ? db
          .prepare(
            `SELECT e.*, c.name AS calendar_name, u.name AS author_name,
                    (SELECT COUNT(*) FROM comments cm WHERE cm.event_id = e.id) AS comment_count
             FROM events e
             LEFT JOIN calendars c ON c.id = e.calendar_id
             LEFT JOIN users u ON u.id = e.created_by
             WHERE e.calendar_id = ?
             ORDER BY e.date DESC, e.time DESC`
          )
          .all(calendarId)
      : db
          .prepare(
            `SELECT e.*, c.name AS calendar_name, u.name AS author_name,
                    (SELECT COUNT(*) FROM comments cm WHERE cm.event_id = e.id) AS comment_count
             FROM events e
             LEFT JOIN calendars c ON c.id = e.calendar_id
             LEFT JOIN users u ON u.id = e.created_by
             ORDER BY e.created_at DESC
             LIMIT 300`
          )
          .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        calendarId: r.calendar_id,
        calendarName: r.calendar_name,
        title: r.title,
        date: r.date,
        time: r.time || "",
        endTime: r.end_time || "",
        location: r.location || "",
        description: r.description || "",
        createdBy: r.created_by,
        authorName: r.author_name,
        createdAt: r.created_at,
        commentCount: r.comment_count,
      }))
    );
  }));

  app.delete("/api/admin/events/:id", adminOk((req, res) => {
    const result = db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "Встреча не найдена" });
    res.json({ ok: true });
  }));

  app.get("/api/admin/comments", adminOk((req, res) => {
    const calendarId = req.query.calendarId || null;
    const rows = calendarId
      ? db
          .prepare(
            `SELECT cm.*, u.name AS author_name, e.title AS event_title, e.calendar_id, c.name AS calendar_name
             FROM comments cm
             JOIN events e ON e.id = cm.event_id
             LEFT JOIN calendars c ON c.id = e.calendar_id
             LEFT JOIN users u ON u.id = cm.user_id
             WHERE e.calendar_id = ?
             ORDER BY cm.ts DESC`
          )
          .all(calendarId)
      : db
          .prepare(
            `SELECT cm.*, u.name AS author_name, e.title AS event_title, e.calendar_id, c.name AS calendar_name
             FROM comments cm
             JOIN events e ON e.id = cm.event_id
             LEFT JOIN calendars c ON c.id = e.calendar_id
             LEFT JOIN users u ON u.id = cm.user_id
             ORDER BY cm.ts DESC
             LIMIT 400`
          )
          .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        eventId: r.event_id,
        eventTitle: r.event_title,
        calendarId: r.calendar_id,
        calendarName: r.calendar_name,
        userId: r.user_id,
        authorName: r.author_name,
        text: r.text,
        ts: r.ts,
      }))
    );
  }));

  app.delete("/api/admin/comments/:id", adminOk((req, res) => {
    const result = db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "Комментарий не найден" });
    res.json({ ok: true });
  }));

  app.get("/api/admin/ideas", adminOk((req, res) => {
    const calendarId = req.query.calendarId || null;
    const rows = calendarId
      ? db
          .prepare(
            `SELECT i.*, u.name AS author_name, c.name AS calendar_name,
                    (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id) AS vote_count
             FROM ideas i
             LEFT JOIN users u ON u.id = i.created_by
             LEFT JOIN calendars c ON c.id = i.calendar_id
             WHERE i.calendar_id = ?
             ORDER BY i.created_at DESC`
          )
          .all(calendarId)
      : db
          .prepare(
            `SELECT i.*, u.name AS author_name, c.name AS calendar_name,
                    (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id) AS vote_count
             FROM ideas i
             LEFT JOIN users u ON u.id = i.created_by
             LEFT JOIN calendars c ON c.id = i.calendar_id
             ORDER BY i.created_at DESC
             LIMIT 300`
          )
          .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        calendarId: r.calendar_id,
        calendarName: r.calendar_name,
        title: r.title,
        description: r.description || "",
        status: r.status,
        createdBy: r.created_by,
        authorName: r.author_name,
        createdAt: r.created_at,
        voteCount: r.vote_count,
      }))
    );
  }));

  app.delete("/api/admin/ideas/:id", adminOk((req, res) => {
    const result = db.prepare("DELETE FROM ideas WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "Идея не найдена" });
    res.json({ ok: true });
  }));

  app.get("/api/admin/users", adminOk((_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.is_guest, u.created_at,
                (SELECT COUNT(*) FROM calendar_members m WHERE m.user_id = u.id) AS calendar_count
         FROM users u
         ORDER BY u.created_at DESC
         LIMIT 500`
      )
      .all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        isGuest: !!r.is_guest,
        createdAt: r.created_at,
        calendarCount: r.calendar_count,
      }))
    );
  }));
}

export function adminConfigured() {
  return Boolean(ADMIN_PASS);
}
