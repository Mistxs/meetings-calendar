import express from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import db from "./db.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { eventsToIcs } from "./ics.js";
import { registerAdminRoutes, adminConfigured } from "./admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

app.use(cors());
app.use(express.json({ limit: "5mb" }));

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Wrap sync handlers so SQLite/runtime errors become JSON 500 instead of a dead process. */
function route(handler) {
  return (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

function publicUser(row) {
  return { id: row.id, name: row.name, isGuest: !!row.is_guest };
}

function rowToEvent(row) {
  const rsvpsRows = db
    .prepare(
      `SELECT u.name, r.status
       FROM rsvps r JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ?`
    )
    .all(row.id);
  const commentsRows = db
    .prepare(
      `SELECT c.id, u.name, c.text, c.ts
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.event_id = ?
       ORDER BY c.ts ASC`
    )
    .all(row.id);

  const rsvps = {};
  for (const r of rsvpsRows) rsvps[r.name] = r.status;

  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time || "",
    endTime: row.end_time || "",
    location: row.location || "",
    description: row.description || "",
    photo: row.photo || null,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    rsvps,
    comments: commentsRows.map((c) => ({
      id: c.id,
      name: c.name,
      text: c.text,
      ts: c.ts,
    })),
  };
}

function getEventById(id) {
  const row = db
    .prepare(
      `SELECT e.*, u.name AS created_by_name
       FROM events e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.id = ?`
    )
    .get(id);
  return row ? rowToEvent(row) : null;
}

function getUserEvents(userId, status = "yes", calendarId = null) {
  if (calendarId) {
    return db
      .prepare(
        `SELECT e.*, u.name AS created_by_name
         FROM events e
         JOIN rsvps r ON r.event_id = e.id
         LEFT JOIN users u ON u.id = e.created_by
         WHERE r.user_id = ? AND r.status = ? AND e.calendar_id = ?
         ORDER BY e.date ASC, e.time ASC`
      )
      .all(userId, status, calendarId)
      .map(rowToEvent);
  }
  return db
    .prepare(
      `SELECT e.*, u.name AS created_by_name
       FROM events e
       JOIN rsvps r ON r.event_id = e.id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE r.user_id = ? AND r.status = ?
       ORDER BY e.date ASC, e.time ASC`
    )
    .all(userId, status)
    .map(rowToEvent);
}

function inviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function uniqueSlug(name) {
  const latin = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  for (let i = 0; i < 8; i++) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = latin ? `${latin}-${suffix}` : suffix;
    if (!db.prepare("SELECT 1 FROM calendars WHERE slug = ? COLLATE NOCASE").get(slug)) {
      return slug;
    }
  }
  return crypto.randomBytes(8).toString("hex");
}

function membership(calendarId, userId) {
  if (!calendarId || !userId) return null;
  return db
    .prepare(
      `SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?`
    )
    .get(calendarId, userId);
}

function publicCalendar(row, { role = null, includeInvite = false, memberCount = null } = {}) {
  const out = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    visibility: row.visibility,
    createdBy: row.created_by,
    createdAt: row.created_at,
    role: role || null,
    memberCount: memberCount ?? null,
  };
  if (includeInvite) out.inviteToken = row.invite_token;
  return out;
}

function requireUser(userId) {
  if (!userId) return null;
  return db.prepare("SELECT id, name, is_guest FROM users WHERE id = ?").get(userId);
}

function getCalendarBySlug(slug) {
  return db.prepare("SELECT * FROM calendars WHERE slug = ? COLLATE NOCASE").get(slug);
}

function getCalendarById(id) {
  return db.prepare("SELECT * FROM calendars WHERE id = ?").get(id);
}

function assertCalendarMember(calendarId, userId) {
  const cal = getCalendarById(calendarId);
  if (!cal) {
    const err = new Error("Календарь не найден");
    err.status = 404;
    throw err;
  }
  const mem = membership(calendarId, userId);
  if (!mem) {
    const err = new Error("Нет доступа к этому календарю");
    err.status = 403;
    throw err;
  }
  return { calendar: cal, role: mem.role };
}

/* ---------- auth ---------- */

app.post("/api/register", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!name) return res.status(400).json({ error: "Укажите имя" });
  if (name.length > 40) return res.status(400).json({ error: "Имя слишком длинное" });
  if (password.length < 4) return res.status(400).json({ error: "Пароль — минимум 4 символа" });
  if (password.length > 100) return res.status(400).json({ error: "Пароль слишком длинный" });

  const existing = db
    .prepare("SELECT id, is_guest FROM users WHERE name = ? COLLATE NOCASE")
    .get(name);
  if (existing) {
    return res.status(409).json({
      error: existing.is_guest
        ? "Это имя уже используется гостем. Выберите другое или продолжите как гость."
        : "Такое имя уже занято. Войдите или выберите другое.",
    });
  }

  const id = uid();
  db.prepare(
    "INSERT INTO users (id, name, password_hash, is_guest, created_at) VALUES (?, ?, ?, 0, ?)"
  ).run(id, name, hashPassword(password), Date.now());
  res.json(publicUser({ id, name, is_guest: 0 }));
});

app.post("/api/login", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!name || !password) return res.status(400).json({ error: "Укажите имя и пароль" });

  const user = db
    .prepare("SELECT id, name, password_hash, is_guest FROM users WHERE name = ? COLLATE NOCASE")
    .get(name);
  if (!user) {
    return res.status(404).json({ error: "Пользователь не найден. Зарегистрируйтесь." });
  }
  if (user.is_guest) {
    return res.status(400).json({ error: "Это гостевой аккаунт — выберите «Как гость»." });
  }
  if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Неверный пароль" });
  }
  res.json(publicUser(user));
});

app.post("/api/guest", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Укажите имя" });
  if (name.length > 40) return res.status(400).json({ error: "Имя слишком длинное" });

  const existing = db
    .prepare("SELECT id, name, is_guest FROM users WHERE name = ? COLLATE NOCASE")
    .get(name);

  if (existing) {
    if (!existing.is_guest) {
      return res.status(409).json({
        error: "Имя занято зарегистрированным пользователем. Войдите или выберите другое.",
      });
    }
    return res.json(publicUser(existing));
  }

  const id = uid();
  db.prepare(
    "INSERT INTO users (id, name, password_hash, is_guest, created_at) VALUES (?, ?, '', 1, ?)"
  ).run(id, name, Date.now());
  res.json(publicUser({ id, name, is_guest: 1 }));
});

app.get("/api/users/:id", (req, res) => {
  const user = db.prepare("SELECT id, name, is_guest FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Не найден" });
  res.json(publicUser(user));
});

/* ---------- calendars ---------- */

app.get("/api/calendars", route((req, res) => {
  const userId = req.query.userId;
  if (!requireUser(userId)) return res.status(400).json({ error: "Нужен userId" });

  const rows = db
    .prepare(
      `SELECT c.*, m.role,
              (SELECT COUNT(*) FROM calendar_members cm WHERE cm.calendar_id = c.id) AS member_count
       FROM calendars c
       JOIN calendar_members m ON m.calendar_id = c.id AND m.user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(userId);

  res.json(
    rows.map((r) =>
      publicCalendar(r, {
        role: r.role,
        includeInvite: r.visibility === "link" || r.role === "owner",
        memberCount: r.member_count,
      })
    )
  );
}));

app.post("/api/calendars", route((req, res) => {
  const { name, visibility = "link", userId } = req.body || {};
  const trimmed = String(name || "").trim();
  if (!trimmed) return res.status(400).json({ error: "Укажите название календаря" });
  if (trimmed.length > 60) return res.status(400).json({ error: "Название слишком длинное" });
  if (!["link", "private"].includes(visibility)) {
    return res.status(400).json({ error: "visibility: link или private" });
  }
  const user = requireUser(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const id = uid();
  const slug = uniqueSlug(trimmed);
  const invite = inviteToken();
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO calendars (id, slug, name, visibility, invite_token, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, slug, trimmed, visibility, invite, userId, now);
    db.prepare(
      `INSERT INTO calendar_members (calendar_id, user_id, role, joined_at)
       VALUES (?, ?, 'owner', ?)`
    ).run(id, userId, now);
  })();

  const row = getCalendarById(id);
  res.status(201).json(publicCalendar(row, { role: "owner", includeInvite: true, memberCount: 1 }));
}));

app.get("/api/calendars/:slug", route((req, res) => {
  const userId = req.query.userId;
  const cal = getCalendarBySlug(req.params.slug);
  if (!cal) return res.status(404).json({ error: "Календарь не найден" });
  const mem = membership(cal.id, userId);
  if (!mem) return res.status(403).json({ error: "Нет доступа к этому календарю" });
  const memberCount = db
    .prepare("SELECT COUNT(*) AS n FROM calendar_members WHERE calendar_id = ?")
    .get(cal.id).n;
  res.json(
    publicCalendar(cal, {
      role: mem.role,
      includeInvite: cal.visibility === "link" || mem.role === "owner",
      memberCount,
    })
  );
}));

app.patch("/api/calendars/:slug", route((req, res) => {
  const { userId, name, visibility } = req.body || {};
  const cal = getCalendarBySlug(req.params.slug);
  if (!cal) return res.status(404).json({ error: "Календарь не найден" });
  const mem = membership(cal.id, userId);
  if (!mem || mem.role !== "owner") {
    return res.status(403).json({ error: "Менять настройки может только владелец" });
  }

  let nextName = cal.name;
  let nextVis = cal.visibility;
  if (name != null) {
    nextName = String(name).trim();
    if (!nextName) return res.status(400).json({ error: "Укажите название" });
    if (nextName.length > 60) return res.status(400).json({ error: "Название слишком длинное" });
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
  const updated = getCalendarById(cal.id);
  const memberCount = db
    .prepare("SELECT COUNT(*) AS n FROM calendar_members WHERE calendar_id = ?")
    .get(cal.id).n;
  res.json(publicCalendar(updated, { role: "owner", includeInvite: true, memberCount }));
}));

app.post("/api/calendars/:slug/rotate-invite", route((req, res) => {
  const { userId } = req.body || {};
  const cal = getCalendarBySlug(req.params.slug);
  if (!cal) return res.status(404).json({ error: "Календарь не найден" });
  const mem = membership(cal.id, userId);
  if (!mem || mem.role !== "owner") {
    return res.status(403).json({ error: "Только владелец" });
  }
  const invite = inviteToken();
  db.prepare("UPDATE calendars SET invite_token = ? WHERE id = ?").run(invite, cal.id);
  const updated = getCalendarById(cal.id);
  res.json(publicCalendar(updated, { role: "owner", includeInvite: true }));
}));

app.delete("/api/calendars/:slug", route((req, res) => {
  const { userId } = req.body || {};
  const cal = getCalendarBySlug(req.params.slug);
  if (!cal) return res.status(404).json({ error: "Календарь не найден" });
  const mem = membership(cal.id, userId);
  if (!mem || mem.role !== "owner") {
    return res.status(403).json({ error: "Удалить может только владелец" });
  }
  db.prepare("DELETE FROM calendars WHERE id = ?").run(cal.id);
  res.json({ ok: true });
}));

app.get("/api/join/:token", route((req, res) => {
  const cal = db
    .prepare("SELECT * FROM calendars WHERE invite_token = ?")
    .get(req.params.token);
  if (!cal) return res.status(404).json({ error: "Ссылка недействительна" });
  if (cal.visibility !== "link") {
    return res.status(403).json({ error: "Этот календарь приватный — вход по ссылке закрыт" });
  }
  res.json({
    name: cal.name,
    slug: cal.slug,
    visibility: cal.visibility,
  });
}));

app.post("/api/join/:token", route((req, res) => {
  const { userId } = req.body || {};
  const user = requireUser(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const cal = db
    .prepare("SELECT * FROM calendars WHERE invite_token = ?")
    .get(req.params.token);
  if (!cal) return res.status(404).json({ error: "Ссылка недействительна" });
  if (cal.visibility !== "link") {
    return res.status(403).json({ error: "Этот календарь приватный — вход по ссылке закрыт" });
  }

  const existing = membership(cal.id, userId);
  if (!existing) {
    db.prepare(
      `INSERT INTO calendar_members (calendar_id, user_id, role, joined_at)
       VALUES (?, ?, 'member', ?)`
    ).run(cal.id, userId, Date.now());
  }

  const mem = membership(cal.id, userId);
  const memberCount = db
    .prepare("SELECT COUNT(*) AS n FROM calendar_members WHERE calendar_id = ?")
    .get(cal.id).n;
  res.json(
    publicCalendar(cal, {
      role: mem.role,
      includeInvite: cal.visibility === "link" || mem.role === "owner",
      memberCount,
    })
  );
}));

/* ---------- events ---------- */

app.get("/api/events", route((req, res) => {
  const { calendarId, userId } = req.query;
  if (!calendarId || !userId) {
    return res.status(400).json({ error: "Нужны calendarId и userId" });
  }
  assertCalendarMember(calendarId, userId);

  const rows = db
    .prepare(
      `SELECT e.*, u.name AS created_by_name
       FROM events e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.calendar_id = ?
       ORDER BY e.date ASC, e.time ASC`
    )
    .all(calendarId);
  res.json(rows.map(rowToEvent));
}));

app.get("/api/users/:id/events", route((req, res) => {
  const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Не найден" });

  const status = req.query.status || "yes";
  const calendarId = req.query.calendarId || null;
  if (calendarId) assertCalendarMember(calendarId, req.params.id);
  res.json(getUserEvents(req.params.id, status, calendarId));
}));

app.get("/api/users/:id/events.ics", route((req, res) => {
  const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Не найден" });

  const calendarId = req.query.calendarId || null;
  if (calendarId) assertCalendarMember(calendarId, req.params.id);
  const events = getUserEvents(req.params.id, "yes", calendarId);
  const ics = eventsToIcs(events, `Встречи · ${user.name}`);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="meetings-${user.name.replace(/[^\w\-]+/g, "_")}.ics"`
  );
  res.send(ics);
}));

app.post("/api/events", route((req, res) => {
  const { title, date, time, endTime, location, description, photo, userId, calendarId } = req.body || {};
  const trimmed = String(title || "").trim();
  if (!trimmed || !date) return res.status(400).json({ error: "Нужны название и дата" });
  if (!calendarId) return res.status(400).json({ error: "Нужен calendarId" });

  const start = time || "";
  const end = endTime || "";
  if (start && end && end < start) {
    return res.status(400).json({ error: "Время окончания раньше начала" });
  }

  assertCalendarMember(calendarId, userId);
  const user = userId ? requireUser(userId) : null;

  const id = uid();
  db.prepare(
    `INSERT INTO events (id, calendar_id, title, date, time, end_time, location, description, photo, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    calendarId,
    trimmed,
    date,
    start,
    end,
    String(location || "").trim(),
    String(description || "").trim(),
    photo || null,
    user?.id || null,
    Date.now()
  );

  res.status(201).json(getEventById(id));
}));

app.put("/api/events/:id", route((req, res) => {
  const existing = db.prepare("SELECT id, calendar_id FROM events WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Встреча не найдена" });

  const { title, date, time, endTime, location, description, photo, userId } = req.body || {};
  if (userId) assertCalendarMember(existing.calendar_id, userId);

  db.prepare(
    `UPDATE events SET
       title = COALESCE(?, title),
       date = COALESCE(?, date),
       time = COALESCE(?, time),
       end_time = COALESCE(?, end_time),
       location = COALESCE(?, location),
       description = COALESCE(?, description),
       photo = CASE WHEN ? IS NOT NULL THEN ? ELSE photo END
     WHERE id = ?`
  ).run(
    title != null ? String(title).trim() : null,
    date ?? null,
    time ?? null,
    endTime ?? null,
    location != null ? String(location).trim() : null,
    description != null ? String(description).trim() : null,
    photo !== undefined ? 1 : null,
    photo === undefined ? null : photo,
    req.params.id
  );

  res.json(getEventById(req.params.id));
}));

app.delete("/api/events/:id", route((req, res) => {
  const existing = db.prepare("SELECT id, calendar_id FROM events WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Встреча не найдена" });
  const { userId } = req.body || {};
  if (userId) assertCalendarMember(existing.calendar_id, userId);

  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

/* ---------- rsvp / comments ---------- */

app.post("/api/events/:id/rsvp", route((req, res) => {
  const event = db.prepare("SELECT id, calendar_id FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Встреча не найдена" });

  const { userId, status } = req.body || {};
  if (!userId || !["yes", "no"].includes(status)) {
    return res.status(400).json({ error: "Нужны userId и status (yes/no)" });
  }
  assertCalendarMember(event.calendar_id, userId);

  db.prepare(
    `INSERT INTO rsvps (event_id, user_id, status) VALUES (?, ?, ?)
     ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status`
  ).run(req.params.id, userId, status);

  res.json(getEventById(req.params.id));
}));

app.post("/api/events/:id/comments", route((req, res) => {
  const event = db.prepare("SELECT id, calendar_id FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Встреча не найдена" });

  const { userId, text } = req.body || {};
  const trimmed = String(text || "").trim();
  if (!userId || !trimmed) return res.status(400).json({ error: "Нужны userId и текст" });
  assertCalendarMember(event.calendar_id, userId);

  const id = uid();
  db.prepare(
    "INSERT INTO comments (id, event_id, user_id, text, ts) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.params.id, userId, trimmed, Date.now());

  res.status(201).json(getEventById(req.params.id));
}));

/* ---------- ideas ---------- */

function getIdeaById(id, viewerId = null) {
  const row = db
    .prepare(
      `SELECT i.*, u.name AS author_name
       FROM ideas i JOIN users u ON u.id = i.created_by
       WHERE i.id = ?`
    )
    .get(id);
  if (!row) return null;

  const voters = db
    .prepare(
      `SELECT u.id, u.name FROM idea_votes v JOIN users u ON u.id = v.user_id WHERE v.idea_id = ?`
    )
    .all(id);

  const dates = db
    .prepare(
      `SELECT d.*, u.name AS proposed_by_name
       FROM idea_dates d JOIN users u ON u.id = d.proposed_by
       WHERE d.idea_id = ?
       ORDER BY d.date ASC, d.time ASC`
    )
    .all(id)
    .map((d) => {
      const dateVoters = db
        .prepare(
          `SELECT u.id, u.name FROM idea_date_votes v JOIN users u ON u.id = v.user_id WHERE v.date_id = ?`
        )
        .all(d.id);
      return {
        id: d.id,
        date: d.date,
        time: d.time || "",
        endTime: d.end_time || "",
        proposedBy: d.proposed_by,
        proposedByName: d.proposed_by_name,
        voteCount: dateVoters.length,
        voters: dateVoters.map((v) => v.name),
        votedByMe: viewerId ? dateVoters.some((v) => v.id === viewerId) : false,
      };
    })
    .sort((a, b) => b.voteCount - a.voteCount || a.date.localeCompare(b.date));

  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    createdBy: row.created_by,
    authorName: row.author_name,
    createdAt: row.created_at,
    status: row.status,
    eventId: row.event_id || null,
    voteCount: voters.length,
    voters: voters.map((v) => v.name),
    votedByMe: viewerId ? voters.some((v) => v.id === viewerId) : false,
    dates,
  };
}

app.get("/api/ideas", route((req, res) => {
  const viewerId = req.query.userId || null;
  const calendarId = req.query.calendarId;
  if (!calendarId || !viewerId) {
    return res.status(400).json({ error: "Нужны calendarId и userId" });
  }
  assertCalendarMember(calendarId, viewerId);

  const rows = db
    .prepare(
      `SELECT i.id,
              (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id) AS votes
       FROM ideas i
       WHERE i.calendar_id = ?
       ORDER BY
         CASE WHEN i.status = 'open' THEN 0 ELSE 1 END,
         votes DESC,
         i.created_at DESC`
    )
    .all(calendarId);
  res.json(rows.map((r) => getIdeaById(r.id, viewerId)));
}));

app.post("/api/ideas", route((req, res) => {
  const { title, description, userId, calendarId } = req.body || {};
  const trimmed = String(title || "").trim();
  if (!trimmed) return res.status(400).json({ error: "Укажите название идеи" });
  if (!userId || !calendarId) return res.status(400).json({ error: "Нужны userId и calendarId" });
  assertCalendarMember(calendarId, userId);

  const id = uid();
  db.prepare(
    `INSERT INTO ideas (id, calendar_id, title, description, created_by, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'open')`
  ).run(id, calendarId, trimmed, String(description || "").trim(), userId, Date.now());

  db.prepare("INSERT INTO idea_votes (idea_id, user_id) VALUES (?, ?)").run(id, userId);

  res.status(201).json(getIdeaById(id, userId));
}));

app.delete("/api/ideas/:id", route((req, res) => {
  const idea = db.prepare("SELECT id, created_by, calendar_id FROM ideas WHERE id = ?").get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });
  const { userId } = req.body || {};
  if (userId) assertCalendarMember(idea.calendar_id, userId);
  if (userId !== idea.created_by) {
    return res.status(403).json({ error: "Удалить может только автор" });
  }
  db.prepare("DELETE FROM ideas WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

app.post("/api/ideas/:id/vote", route((req, res) => {
  const idea = db.prepare("SELECT id, calendar_id FROM ideas WHERE id = ?").get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Нужен userId" });
  assertCalendarMember(idea.calendar_id, userId);

  const existing = db
    .prepare("SELECT 1 FROM idea_votes WHERE idea_id = ? AND user_id = ?")
    .get(req.params.id, userId);
  if (existing) {
    db.prepare("DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?").run(req.params.id, userId);
  } else {
    db.prepare("INSERT INTO idea_votes (idea_id, user_id) VALUES (?, ?)").run(req.params.id, userId);
  }
  res.json(getIdeaById(req.params.id, userId));
}));

app.post("/api/ideas/:id/dates", route((req, res) => {
  const idea = db.prepare("SELECT id, status, calendar_id FROM ideas WHERE id = ?").get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });
  if (idea.status !== "open") return res.status(400).json({ error: "Идея уже в календаре" });

  const { date, time, endTime, userId } = req.body || {};
  if (!date || !userId) return res.status(400).json({ error: "Нужны date и userId" });
  assertCalendarMember(idea.calendar_id, userId);

  const start = time || "";
  const end = endTime || "";
  if (start && end && end < start) {
    return res.status(400).json({ error: "Время окончания раньше начала" });
  }

  const dup = db
    .prepare(
      `SELECT id FROM idea_dates WHERE idea_id = ? AND date = ? AND time = ? AND end_time = ?`
    )
    .get(req.params.id, date, start, end);
  if (dup) return res.status(409).json({ error: "Такой вариант даты уже есть" });

  const id = uid();
  db.prepare(
    `INSERT INTO idea_dates (id, idea_id, date, time, end_time, proposed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.params.id, date, start, end, userId, Date.now());
  db.prepare("INSERT INTO idea_date_votes (date_id, user_id) VALUES (?, ?)").run(id, userId);

  res.status(201).json(getIdeaById(req.params.id, userId));
}));

app.post("/api/ideas/dates/:dateId/vote", route((req, res) => {
  const dateRow = db
    .prepare(
      `SELECT d.id, d.idea_id, i.status, i.calendar_id
       FROM idea_dates d JOIN ideas i ON i.id = d.idea_id
       WHERE d.id = ?`
    )
    .get(req.params.dateId);
  if (!dateRow) return res.status(404).json({ error: "Вариант даты не найден" });
  if (dateRow.status !== "open") return res.status(400).json({ error: "Голосование закрыто" });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Нужен userId" });
  assertCalendarMember(dateRow.calendar_id, userId);

  const existing = db
    .prepare("SELECT 1 FROM idea_date_votes WHERE date_id = ? AND user_id = ?")
    .get(req.params.dateId, userId);
  if (existing) {
    db.prepare("DELETE FROM idea_date_votes WHERE date_id = ? AND user_id = ?").run(
      req.params.dateId,
      userId
    );
  } else {
    db.prepare("INSERT INTO idea_date_votes (date_id, user_id) VALUES (?, ?)").run(
      req.params.dateId,
      userId
    );
  }
  res.json(getIdeaById(dateRow.idea_id, userId));
}));

app.post("/api/ideas/:id/schedule", route((req, res) => {
  const idea = db
    .prepare("SELECT * FROM ideas WHERE id = ?")
    .get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });
  if (idea.status !== "open") return res.status(400).json({ error: "Идея уже в календаре" });

  const { dateId, userId } = req.body || {};
  if (!dateId || !userId) return res.status(400).json({ error: "Нужны dateId и userId" });
  assertCalendarMember(idea.calendar_id, userId);

  const dateRow = db
    .prepare("SELECT * FROM idea_dates WHERE id = ? AND idea_id = ?")
    .get(dateId, req.params.id);
  if (!dateRow) return res.status(404).json({ error: "Вариант даты не найден" });

  const eventId = uid();
  const createEvent = db.transaction(() => {
    db.prepare(
      `INSERT INTO events (id, calendar_id, title, date, time, end_time, location, description, photo, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, NULL, ?, ?)`
    ).run(
      eventId,
      idea.calendar_id,
      idea.title,
      dateRow.date,
      dateRow.time || "",
      dateRow.end_time || "",
      idea.description || "",
      userId,
      Date.now()
    );

    // все, кто голосовал за эту дату, отмечаются как «приду»
    const voters = db
      .prepare("SELECT user_id FROM idea_date_votes WHERE date_id = ?")
      .all(dateId);
    const rsvp = db.prepare(
      `INSERT OR IGNORE INTO rsvps (event_id, user_id, status) VALUES (?, ?, 'yes')`
    );
    for (const v of voters) rsvp.run(eventId, v.user_id);
    rsvp.run(eventId, userId);

    db.prepare(
      `UPDATE ideas SET status = 'scheduled', event_id = ? WHERE id = ?`
    ).run(eventId, idea.id);
  });
  createEvent();

  res.status(201).json({
    idea: getIdeaById(idea.id, userId),
    event: getEventById(eventId),
  });
}));

/* ---------- admin ---------- */

registerAdminRoutes(app);
if (!adminConfigured()) {
  console.warn("[admin] SUPERADMIN_PASSWORD не задан — вход в /admin недоступен");
}

/* ---------- production static ---------- */

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, _req, res, _next) => {
  console.error("[api]", err);
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? "Внутренняя ошибка сервера" : err.message,
    detail: process.env.NODE_ENV === "production" ? undefined : String(err.message || err),
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`API http://${HOST}:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Порт ${PORT} занят. Остановите другой процесс: lsof -ti :${PORT} | xargs kill`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
