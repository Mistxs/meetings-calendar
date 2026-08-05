import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { eventsToIcs } from "./ics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

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

function getUserEvents(userId, status = "yes") {
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

/* ---------- events ---------- */

app.get("/api/events", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, u.name AS created_by_name
       FROM events e LEFT JOIN users u ON u.id = e.created_by
       ORDER BY e.date ASC, e.time ASC`
    )
    .all();
  res.json(rows.map(rowToEvent));
});

app.get("/api/users/:id/events", (req, res) => {
  const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Не найден" });

  const status = req.query.status || "yes";
  res.json(getUserEvents(req.params.id, status));
});

app.get("/api/users/:id/events.ics", (req, res) => {
  const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Не найден" });

  const events = getUserEvents(req.params.id, "yes");
  const ics = eventsToIcs(events, `Встречи · ${user.name}`);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="meetings-${user.name.replace(/[^\w\-]+/g, "_")}.ics"`
  );
  res.send(ics);
});

app.post("/api/events", (req, res) => {
  const { title, date, time, endTime, location, description, photo, userId } = req.body || {};
  const trimmed = String(title || "").trim();
  if (!trimmed || !date) return res.status(400).json({ error: "Нужны название и дата" });

  const start = time || "";
  const end = endTime || "";
  if (start && end && end < start) {
    return res.status(400).json({ error: "Время окончания раньше начала" });
  }

  const user = userId
    ? db.prepare("SELECT id FROM users WHERE id = ?").get(userId)
    : null;

  const id = uid();
  db.prepare(
    `INSERT INTO events (id, title, date, time, end_time, location, description, photo, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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
});

app.put("/api/events/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM events WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Встреча не найдена" });

  const { title, date, time, endTime, location, description, photo } = req.body || {};
  db.prepare(
    `UPDATE events SET
       title = COALESCE(?, title),
       date = COALESCE(?, date),
       time = COALESCE(?, time),
       end_time = COALESCE(?, end_time),
       location = COALESCE(?, location),
       description = COALESCE(?, description),
       photo = CASE WHEN ? IS NOT UNDEFINED THEN ? ELSE photo END
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
});

app.delete("/api/events/:id", (req, res) => {
  const result = db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Встреча не найдена" });
  res.json({ ok: true });
});

/* ---------- rsvp / comments ---------- */

app.post("/api/events/:id/rsvp", (req, res) => {
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Встреча не найдена" });

  const { userId, status } = req.body || {};
  if (!userId || !["yes", "no"].includes(status)) {
    return res.status(400).json({ error: "Нужны userId и status (yes/no)" });
  }
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  db.prepare(
    `INSERT INTO rsvps (event_id, user_id, status) VALUES (?, ?, ?)
     ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status`
  ).run(req.params.id, userId, status);

  res.json(getEventById(req.params.id));
});

app.post("/api/events/:id/comments", (req, res) => {
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Встреча не найдена" });

  const { userId, text } = req.body || {};
  const trimmed = String(text || "").trim();
  if (!userId || !trimmed) return res.status(400).json({ error: "Нужны userId и текст" });

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const id = uid();
  db.prepare(
    "INSERT INTO comments (id, event_id, user_id, text, ts) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.params.id, userId, trimmed, Date.now());

  res.status(201).json(getEventById(req.params.id));
});

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

app.get("/api/ideas", (req, res) => {
  const viewerId = req.query.userId || null;
  const rows = db
    .prepare(
      `SELECT i.id,
              (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id) AS votes
       FROM ideas i
       ORDER BY
         CASE WHEN i.status = 'open' THEN 0 ELSE 1 END,
         votes DESC,
         i.created_at DESC`
    )
    .all();
  res.json(rows.map((r) => getIdeaById(r.id, viewerId)));
});

app.post("/api/ideas", (req, res) => {
  const { title, description, userId } = req.body || {};
  const trimmed = String(title || "").trim();
  if (!trimmed) return res.status(400).json({ error: "Укажите название идеи" });
  if (!userId) return res.status(400).json({ error: "Нужен userId" });
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const id = uid();
  db.prepare(
    `INSERT INTO ideas (id, title, description, created_by, created_at, status)
     VALUES (?, ?, ?, ?, ?, 'open')`
  ).run(id, trimmed, String(description || "").trim(), userId, Date.now());

  // автор сразу голосует за свою идею
  db.prepare("INSERT INTO idea_votes (idea_id, user_id) VALUES (?, ?)").run(id, userId);

  res.status(201).json(getIdeaById(id, userId));
});

app.delete("/api/ideas/:id", (req, res) => {
  const idea = db.prepare("SELECT id, created_by, status FROM ideas WHERE id = ?").get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });
  const { userId } = req.body || {};
  if (userId !== idea.created_by) {
    return res.status(403).json({ error: "Удалить может только автор" });
  }
  db.prepare("DELETE FROM ideas WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/ideas/:id/vote", (req, res) => {
  const idea = db.prepare("SELECT id FROM ideas WHERE id = ?").get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Нужен userId" });
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const existing = db
    .prepare("SELECT 1 FROM idea_votes WHERE idea_id = ? AND user_id = ?")
    .get(req.params.id, userId);
  if (existing) {
    db.prepare("DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?").run(req.params.id, userId);
  } else {
    db.prepare("INSERT INTO idea_votes (idea_id, user_id) VALUES (?, ?)").run(req.params.id, userId);
  }
  res.json(getIdeaById(req.params.id, userId));
});

app.post("/api/ideas/:id/dates", (req, res) => {
  const idea = db.prepare("SELECT id, status FROM ideas WHERE id = ?").get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });
  if (idea.status !== "open") return res.status(400).json({ error: "Идея уже в календаре" });

  const { date, time, endTime, userId } = req.body || {};
  if (!date || !userId) return res.status(400).json({ error: "Нужны date и userId" });
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

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
});

app.post("/api/ideas/dates/:dateId/vote", (req, res) => {
  const dateRow = db
    .prepare(
      `SELECT d.id, d.idea_id, i.status
       FROM idea_dates d JOIN ideas i ON i.id = d.idea_id
       WHERE d.id = ?`
    )
    .get(req.params.dateId);
  if (!dateRow) return res.status(404).json({ error: "Вариант даты не найден" });
  if (dateRow.status !== "open") return res.status(400).json({ error: "Голосование закрыто" });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Нужен userId" });
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

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
});

app.post("/api/ideas/:id/schedule", (req, res) => {
  const idea = db
    .prepare("SELECT * FROM ideas WHERE id = ?")
    .get(req.params.id);
  if (!idea) return res.status(404).json({ error: "Идея не найдена" });
  if (idea.status !== "open") return res.status(400).json({ error: "Идея уже в календаре" });

  const { dateId, userId } = req.body || {};
  if (!dateId || !userId) return res.status(400).json({ error: "Нужны dateId и userId" });
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const dateRow = db
    .prepare("SELECT * FROM idea_dates WHERE id = ? AND idea_id = ?")
    .get(dateId, req.params.id);
  if (!dateRow) return res.status(404).json({ error: "Вариант даты не найден" });

  const eventId = uid();
  const createEvent = db.transaction(() => {
    db.prepare(
      `INSERT INTO events (id, title, date, time, end_time, location, description, photo, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, NULL, ?, ?)`
    ).run(
      eventId,
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
});

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

const server = app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Порт ${PORT} занят. Остановите другой процесс: lsof -ti :${PORT} | xargs kill`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
