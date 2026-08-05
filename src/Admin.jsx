import React, { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, Lightbulb, Loader2, LogOut, MessageCircle, Trash2,
  Users, LayoutDashboard, Shield,
} from "lucide-react";
import { api } from "./api";
import { PasswordField, TextField } from "./ui";

const ADMIN_TOKEN_KEY = "meetings-cal:admin-token";

function loadToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function saveToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

const TABS = [
  { id: "stats", label: "Обзор", icon: LayoutDashboard },
  { id: "calendars", label: "Календари", icon: CalendarDays },
  { id: "events", label: "Встречи", icon: CalendarDays },
  { id: "comments", label: "Комменты", icon: MessageCircle },
  { id: "ideas", label: "Идеи", icon: Lightbulb },
  { id: "users", label: "Юзеры", icon: Users },
];

export default function AdminApp({ onExit }) {
  const [token, setToken] = useState(() => loadToken());
  const [username, setUsername] = useState("mistxs");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [events, setEvents] = useState([]);
  const [comments, setComments] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterCal, setFilterCal] = useState("");
  const [loading, setLoading] = useState(false);

  const authed = !!token;

  const refresh = useCallback(async (activeToken = token, activeTab = tab) => {
    if (!activeToken) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "stats") setStats(await api.adminStats(activeToken));
      if (activeTab === "calendars" || activeTab === "events" || activeTab === "comments" || activeTab === "ideas") {
        setCalendars(await api.adminCalendars(activeToken));
      }
      if (activeTab === "calendars") setCalendars(await api.adminCalendars(activeToken));
      if (activeTab === "events") setEvents(await api.adminEvents(activeToken, filterCal || undefined));
      if (activeTab === "comments") setComments(await api.adminComments(activeToken, filterCal || undefined));
      if (activeTab === "ideas") setIdeas(await api.adminIdeas(activeToken, filterCal || undefined));
      if (activeTab === "users") setUsers(await api.adminUsers(activeToken));
    } catch (e) {
      if (String(e.message || "").includes("авторизац")) {
        saveToken("");
        setToken("");
      }
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [token, tab, filterCal]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        await api.adminMe(token);
        refresh(token, tab);
      } catch {
        saveToken("");
        setToken("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) refresh();
  }, [tab, filterCal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.adminLogin(username.trim(), password);
      saveToken(res.token);
      setToken(res.token);
      setPassword("");
    } catch (e) {
      setError(e.message || "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await api.adminLogout(token); } catch { /* ignore */ }
    saveToken("");
    setToken("");
  }

  async function remove(kind, id) {
    if (!window.confirm("Удалить безвозвратно?")) return;
    setBusy(true);
    try {
      if (kind === "calendar") await api.adminDeleteCalendar(token, id);
      if (kind === "event") await api.adminDeleteEvent(token, id);
      if (kind === "comment") await api.adminDeleteComment(token, id);
      if (kind === "idea") await api.adminDeleteIdea(token, id);
      await refresh();
    } catch (e) {
      setError(e.message || "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  async function setVisibility(id, visibility) {
    setBusy(true);
    try {
      await api.adminUpdateCalendar(token, id, { visibility });
      await refresh();
    } catch (e) {
      setError(e.message || "Не удалось обновить");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <div style={{ background: "#1B1F2A", minHeight: "100vh" }} className="flex items-center justify-center p-6">
        <div style={{ background: "#F7F3EA", borderRadius: 20 }} className="w-full max-w-sm p-7 shadow-2xl">
          <div className="flex items-center gap-2 mb-2" style={{ color: "#E8A33D" }}>
            <Shield size={18} />
            <span className="text-xs uppercase tracking-widest font-semibold">Backoffice</span>
          </div>
          <h1 style={{ fontFamily: "Fraunces, serif", color: "#232323" }} className="text-2xl mb-4">
            Суперадмин
          </h1>
          <TextField label="Логин" value={username} onChange={setUsername} className="mb-3" />
          <PasswordField
            label="Пароль"
            value={password}
            onChange={setPassword}
            onKeyDown={(e) => { if (e.key === "Enter") login(); }}
            className="mb-3"
          />
          {error && <div style={{ color: "#D8635B" }} className="text-sm mb-3">{error}</div>}
          <button
            type="button"
            onClick={login}
            disabled={busy || !password}
            style={{ background: password && !busy ? "#E8A33D" : "#DCD4C0", color: "#1B1F2A" }}
            className="ui-press-static w-full rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            Войти
          </button>
          <button type="button" onClick={onExit} style={{ color: "#8B8FA0" }} className="w-full text-sm mt-3 py-2">
            На сайт
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#1B1F2A", minHeight: "100vh" }} className="pb-10">
      <div style={{ background: "#232323" }} className="px-4 pt-4 pb-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 mb-3">
          <div>
            <div style={{ color: "#E8A33D" }} className="text-[11px] uppercase tracking-widest">Backoffice</div>
            <div style={{ fontFamily: "Fraunces, serif", color: "#F7F3EA" }} className="text-2xl">Суперадминка</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onExit} style={{ color: "#F7F3EA", borderColor: "#8B8FA0" }} className="ui-press-static text-xs border rounded-full px-3 py-1.5">
              На сайт
            </button>
            <button type="button" onClick={logout} style={{ color: "#8B8FA0" }} className="ui-press-static ui-hit p-1.5 rounded-lg" aria-label="Выйти">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav style={{ background: "#1B1F2A" }} className="max-w-4xl mx-auto flex rounded-xl p-1 gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                style={{
                  color: active ? "#1B1F2A" : "#F7F3EA",
                  background: active ? "#E8A33D" : "transparent",
                }}
                className="ui-press-static shrink-0 rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-1.5"
              >
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-4">
        {error && (
          <div style={{ background: "#D8635B22", border: "1px solid #D8635B", color: "#D8635B" }} className="rounded-lg px-3 py-2 text-sm mb-3">
            {error}
          </div>
        )}

        {(tab === "events" || tab === "comments" || tab === "ideas") && (
          <div className="mb-3">
            <select
              value={filterCal}
              onChange={(e) => setFilterCal(e.target.value)}
              style={{ background: "#F7F3EA", border: "1.5px solid #DCD4C0", color: "#232323", borderRadius: 12 }}
              className="w-full sm:w-80 px-3 py-2 text-sm outline-none"
            >
              <option value="">Все календари</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ background: "#F7F3EA", borderRadius: 20 }} className="p-5 shadow-xl">
          {loading ? (
            <div className="flex justify-center py-12" style={{ color: "#8B8FA0" }}>
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : tab === "stats" && stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ["Календари", stats.calendars],
                ["Встречи", stats.events],
                ["Комменты", stats.comments],
                ["Идеи", stats.ideas],
                ["Юзеры", stats.users],
                ["Гости", stats.guests],
                ["RSVP", stats.rsvps],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "#FFFDF8", border: "1px solid #DCD4C0" }} className="rounded-2xl p-4">
                  <div style={{ color: "#8B8FA0" }} className="text-xs uppercase tracking-widest mb-1">{label}</div>
                  <div style={{ fontFamily: "Fraunces, serif", color: "#232323" }} className="text-3xl">{value}</div>
                </div>
              ))}
            </div>
          ) : tab === "calendars" ? (
            <AdminList
              empty="Календарей нет"
              items={calendars}
              render={(c) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ color: "#232323" }} className="font-semibold">{c.name}</div>
                    <div style={{ color: "#8B8FA0" }} className="text-xs mt-1">
                      /{c.slug} · {c.visibility} · {c.memberCount} уч. · {c.eventCount} встр. · owner: {c.ownerName || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setVisibility(c.id, c.visibility === "link" ? "private" : "link")}
                      style={{ color: "#2E8B8B", borderColor: "#DCD4C0" }}
                      className="ui-press-static text-[11px] border rounded-lg px-2 py-1"
                    >
                      {c.visibility === "link" ? "→ private" : "→ link"}
                    </button>
                    <DangerBtn disabled={busy} onClick={() => remove("calendar", c.id)} />
                  </div>
                </div>
              )}
            />
          ) : tab === "events" ? (
            <AdminList
              empty="Встреч нет"
              items={events}
              render={(e) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ color: "#232323" }} className="font-semibold">{e.title}</div>
                    <div style={{ color: "#8B8FA0" }} className="text-xs mt-1">
                      {e.calendarName} · {e.date} {e.time} · {e.authorName || "—"} · комм. {e.commentCount}
                    </div>
                  </div>
                  <DangerBtn disabled={busy} onClick={() => remove("event", e.id)} />
                </div>
              )}
            />
          ) : tab === "comments" ? (
            <AdminList
              empty="Комментариев нет"
              items={comments}
              render={(c) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ color: "#232323" }} className="text-sm">
                      <span className="font-semibold">{c.authorName}</span>: {c.text}
                    </div>
                    <div style={{ color: "#8B8FA0" }} className="text-xs mt-1">
                      {c.calendarName} · {c.eventTitle}
                    </div>
                  </div>
                  <DangerBtn disabled={busy} onClick={() => remove("comment", c.id)} />
                </div>
              )}
            />
          ) : tab === "ideas" ? (
            <AdminList
              empty="Идей нет"
              items={ideas}
              render={(i) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ color: "#232323" }} className="font-semibold">{i.title}</div>
                    <div style={{ color: "#8B8FA0" }} className="text-xs mt-1">
                      {i.calendarName} · {i.status} · {i.voteCount} голосов · {i.authorName}
                    </div>
                  </div>
                  <DangerBtn disabled={busy} onClick={() => remove("idea", i.id)} />
                </div>
              )}
            />
          ) : tab === "users" ? (
            <AdminList
              empty="Пользователей нет"
              items={users}
              render={(u) => (
                <div>
                  <div style={{ color: "#232323" }} className="font-semibold">
                    {u.name}{u.isGuest ? " · гость" : ""}
                  </div>
                  <div style={{ color: "#8B8FA0" }} className="text-xs mt-1">
                    календарей: {u.calendarCount}
                  </div>
                </div>
              )}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AdminList({ items, empty, render }) {
  if (!items?.length) {
    return <p style={{ color: "#8B8FA0" }} className="text-sm text-center py-8">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          style={{ background: "#FFFDF8", border: "1px solid #DCD4C0" }}
          className="rounded-xl px-3 py-2.5"
        >
          {render(item)}
        </div>
      ))}
    </div>
  );
}

function DangerBtn({ onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ color: "#D8635B" }}
      className="ui-press-static ui-hit p-1.5 rounded-lg hover:bg-red-50"
      aria-label="Удалить"
      title="Удалить"
    >
      <Trash2 size={14} />
    </button>
  );
}
