import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from"react";
import {
  ChevronLeft, ChevronRight, X, Camera, Plus, MapPin, Clock,
  MessageCircle, Check, Users, Loader2, CalendarDays, LogOut, UserRound,
  Download, ExternalLink, Lightbulb, List, LayoutGrid,
} from"lucide-react";
import { api } from"./api";
import { TextField, PasswordField, TextArea, DateField, TimeField, formatTimeRange } from"./ui";
import { downloadIcsForUser, googleCalendarUrl } from"./calendarExport";
import IdeasBoard from"./Ideas";

const STORAGE_KEY ="meetings-cal:user";
const LAST_NAME_KEY ="meetings-cal:last-name";
const LAYOUT_KEY ="meetings-cal:layout";
const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function pad(n) { return n < 10 ?"0" + n :"" + n; }
function toKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayKey() { const t = new Date(); return toKey(t.getFullYear(), t.getMonth(), t.getDate()); }

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name) return parsed;
  } catch { /* ignore */ }
  return null;
}

function loadLastName() {
  return localStorage.getItem(LAST_NAME_KEY) || loadStoredUser()?.name ||"";
}

function loadLayout() {
  const v = localStorage.getItem(LAYOUT_KEY);
  return v ==="list" ?"list" :"calendar";
}

function saveStoredUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(LAST_NAME_KEY, user.name);
}

function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatDateHeading(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const key = dateStr;
  if (key === todayKey()) return"Сегодня";
  const t = new Date();
  t.setDate(t.getDate() + 1);
  if (key === toKey(t.getFullYear(), t.getMonth(), t.getDate())) return"Завтра";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function resizeImage(file, maxDim = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Avatar({ name, size = 28 }) {
  const letter = (name ||"?").trim().charAt(0).toUpperCase();
  const hue = (name ||"").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{ width: size, height: size, borderRadius:"50%", background: `hsl(${hue} 45% 42%)`, color:"#F7F3EA", fontFamily:"Fraunces, serif" }}
      className="flex items-center justify-center text-xs font-semibold shrink-0"
    >
      {letter}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState("calendar");
  const [layout, setLayout] = useState(() => loadLayout());
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [events, setEvents] = useState([]);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [openEvent, setOpenEvent] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState(null);

  function changeLayout(next) {
    setLayout(next);
    localStorage.setItem(LAYOUT_KEY, next);
  }

  useEffect(() => {
    (async () => {
      const stored = loadStoredUser();
      if (!stored) {
        setAuthReady(true);
        return;
      }
      try {
        const fresh = await api.getUser(stored.id);
        setUser(fresh);
        saveStoredUser(fresh);
      } catch {
        clearStoredUser();
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listEvents();
      setEvents(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError(e.message ||"Не удалось загрузить встречи");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyEvents = useCallback(async () => {
    if (!user) return;
    try {
      const list = await api.myEvents(user.id,"yes");
      setMyEvents(Array.isArray(list) ? list : []);
    } catch {
      setMyEvents([]);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadEvents();
  }, [user, loadEvents]);

  useEffect(() => {
    if (user && view ==="cabinet") loadMyEvents();
  }, [user, view, loadMyEvents]);

  function handleAuth(nextUser) {
    setUser(nextUser);
    saveStoredUser(nextUser);
  }

  function logout() {
    clearStoredUser();
    setUser(null);
    setEvents([]);
    setMyEvents([]);
    setView("calendar");
    setOpenEvent(null);
  }

  function replaceEvent(updated) {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setMyEvents((prev) => {
      const going = updated.rsvps?.[user?.name] ==="yes";
      const exists = prev.some((e) => e.id === updated.id);
      if (going && !exists) return [...prev, updated].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
      if (!going) return prev.filter((e) => e.id !== updated.id);
      return prev.map((e) => (e.id === updated.id ? updated : e));
    });
    setOpenEvent(updated);
  }

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function eventsOn(key) {
    return events.filter((e) => e.date === key).sort((a, b) => (a.time ||"").localeCompare(b.time ||""));
  }

  function changeMonth(delta) {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  }

  function goToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDay(t.getDate());
    setView("calendar");
  }

  const selectedKey = selectedDay ? toKey(year, month, selectedDay) : null;
  const selectedEvents = selectedKey ? eventsOn(selectedKey) : [];

  if (!authReady) {
    return (
      <div style={{ background:"#1B1F2A", minHeight:"100vh" }} className="flex items-center justify-center">
        <FontLoader />
        <Loader2 className="animate-spin" size={28} style={{ color:"#E8A33D" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <FontLoader />
        <AuthScreen onAuth={handleAuth} />
      </>
    );
  }

  return (
    <div style={{ background:"#1B1F2A", minHeight:"100vh" }} className="pb-10">
      <FontLoader />
      <Header
        name={user.name}
        isGuest={!!user.isGuest}
        saving={saving}
        view={view}
        onToday={goToday}
        onCalendar={() => setView("calendar")}
        onIdeas={() => setView("ideas")}
        onCabinet={() => setView("cabinet")}
        onLogout={logout}
      />

      <div className="max-w-2xl mx-auto px-4 mt-4">
        {error && (
          <div style={{ background:"#D8635B22", border:"1px solid #D8635B", color:"#D8635B" }} className="rounded-lg px-3 py-2 text-sm mb-3">
            {error}
          </div>
        )}

        <div key={`${view}-${layout}`} className="anim-view">
        {view ==="cabinet" ? (
          <Cabinet
            user={user}
            events={myEvents}
            loading={loading}
            onOpen={(ev) => setOpenEvent(ev)}
          />
        ) : view ==="ideas" ? (
          <IdeasBoard
            user={user}
            onScheduled={(ev) => {
              if (ev) {
                setEvents((prev) => (prev.some((e) => e.id === ev.id) ? prev : [...prev, ev]));
                setError(null);
              }
            }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-3">
              <LayoutToggle layout={layout} onChange={changeLayout} />
              <button
                onClick={() => setShowNew(true)}
                style={{ background:"#E8A33D", color:"#1B1F2A" }}
                className="ui-press flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold"
              >
                <Plus size={15} /> Встреча
              </button>
            </div>

            {layout ==="list" ? (
              <EventsListView
                events={events}
                loading={loading}
                userName={user.name}
                onOpen={(ev) => setOpenEvent(ev)}
              />
            ) : (
              <>
                <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => changeMonth(-1)} aria-label="Предыдущий месяц" style={{ color:"#232323" }} className="ui-press-static p-2 rounded-full hover:bg-black/5">
                      <ChevronLeft size={20} strokeWidth={1.75} />
                    </button>
                    <div style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-xl capitalize tabular-nums">
                      {MONTHS[month]} {year}
                    </div>
                    <button onClick={() => changeMonth(1)} aria-label="Следующий месяц" style={{ color:"#232323" }} className="ui-press-static p-2 rounded-full hover:bg-black/5">
                      <ChevronRight size={20} strokeWidth={1.75} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 mb-1">
                    {WEEKDAYS.map((w) => (
                      <div key={w} style={{ color:"#8B8FA0" }} className="text-center text-[11px] font-medium uppercase tracking-wide py-1">{w}</div>
                    ))}
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center py-16" style={{ color:"#8B8FA0" }}>
                      <Loader2 className="animate-spin" size={22} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {cells.map((d, i) => {
                        if (d === null) return <div key={i} />;
                        const key = toKey(year, month, d);
                        const dayEvents = eventsOn(key);
                        const isToday = key === todayKey();
                        const isSelected = key === selectedKey;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedDay(d)}
                            style={{
                              background: isSelected ?"#232323" : isToday ?"#E8A33D22" :"transparent",
                              color: isSelected ?"#F7F3EA" :"#232323",
                              border: isToday && !isSelected ?"1.5px solid #E8A33D" :"1.5px solid transparent",
                              minHeight: 52,
                            }}
                            className="ui-press-static rounded-xl p-1 flex flex-col items-center justify-start relative hover:bg-black/[0.04]"
                          >
                            <span className="text-sm font-medium mt-0.5 tabular-nums">{d}</span>
                            {dayEvents.length > 0 && (
                              <div className="flex -space-x-1.5 mt-1">
                                {dayEvents.slice(0, 3).map((e, idx) => (
                                  <div
                                    key={e.id}
                                    style={{
                                      width: 16, height: 16, borderRadius:"50%",
                                      border:"1.5px solid" + (isSelected ?"#232323" :"#F7F3EA"),
                                      background: e.photo ? `url(${e.photo}) center/cover` :"#2E8B8B",
                                      transform: `rotate(${idx % 2 === 0 ? -6 : 6}deg)`,
                                    }}
                                  />
                                ))}
                                {dayEvents.length > 3 && (
                                  <span className="text-[9px] ml-1" style={{ color: isSelected ?"#F7F3EA" :"#8B8FA0" }}>+{dayEvents.length - 3}</span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedDay && (
                  <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-4 mt-4 shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-lg">
                        {selectedDay} {MONTHS[month]}
                      </div>
                    </div>

                    {selectedEvents.length === 0 ? (
                      <p style={{ color:"#8B8FA0" }} className="text-sm py-4 text-center">Пока ничего не запланировано на этот день.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selectedEvents.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={() => setOpenEvent(ev)} userName={user.name} />)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>

      {showNew && (
        <NewEventModal
          defaultDate={selectedKey || todayKey()}
          onClose={() => setShowNew(false)}
          onCreate={async (payload) => {
            setSaving(true);
            try {
              const ev = await api.createEvent({ ...payload, userId: user.id });
              setEvents((prev) => [...prev, ev]);
              setShowNew(false);
              setOpenEvent(ev);
              setError(null);
            } catch (e) {
              setError(e.message ||"Не удалось создать встречу");
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {openEvent && (
        <EventDetailModal
          event={events.find((e) => e.id === openEvent.id) || myEvents.find((e) => e.id === openEvent.id) || openEvent}
          name={user.name}
          onClose={() => setOpenEvent(null)}
          onRsvp={async (status) => {
            setSaving(true);
            try {
              const updated = await api.setRsvp(openEvent.id, user.id, status);
              replaceEvent(updated);
              setError(null);
            } catch (e) {
              setError(e.message ||"Не удалось сохранить ответ");
            } finally {
              setSaving(false);
            }
          }}
          onComment={async (text) => {
            setSaving(true);
            try {
              const updated = await api.addComment(openEvent.id, user.id, text);
              replaceEvent(updated);
              setError(null);
            } catch (e) {
              setError(e.message ||"Не удалось отправить комментарий");
            } finally {
              setSaving(false);
            }
          }}
          onDelete={async (id) => {
            setSaving(true);
            try {
              await api.deleteEvent(id);
              setEvents((prev) => prev.filter((e) => e.id !== id));
              setMyEvents((prev) => prev.filter((e) => e.id !== id));
              setOpenEvent(null);
              setError(null);
            } catch (e) {
              setError(e.message ||"Не удалось удалить");
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("guest"); // guest | login | register
  const [nameDraft, setNameDraft] = useState(() => loadLastName());
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    if (mode !=="guest" && !password) return;
    if (mode ==="register") {
      if (password.length < 4) {
        setError("Пароль — минимум 4 символа");
        return;
      }
      if (password !== password2) {
        setError("Пароли не совпадают");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      let user;
      if (mode ==="guest") user = await api.guest(trimmed);
      else if (mode ==="register") user = await api.register(trimmed, password);
      else user = await api.login(trimmed, password);
      onAuth(user);
    } catch (e) {
      setError(e.message ||"Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mode ==="guest"
    ? !!nameDraft.trim()
    : !!(nameDraft.trim() && password && (mode ==="login" || password2));

  const titles = {
    guest:"Как гость",
    login:"С возвращением",
    register:"Регистрация",
  };
  const hints = {
    guest:"Только имя — можно создавать встречи и отмечаться. Без пароля, для быстрого участия.",
    login:"Войдите по имени и паролю, чтобы видеть встречи и отмечать участие.",
    register:"Имя увидят друзья. Пароль нужен только вам — минимум 4 символа.",
  };
  const actions = {
    guest:"Продолжить как гость",
    login:"Войти",
    register:"Создать аккаунт",
  };

  return (
    <div style={{ background:"#1B1F2A", minHeight:"100vh" }} className="flex items-center justify-center p-6">
      <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="auth-card anim-pop w-full max-w-sm p-7 shadow-2xl">
        <div style={{ color:"#8B8FA0" }} className="text-xs uppercase tracking-widest mb-2">Общий календарь встреч</div>
        <h1 style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-2xl mb-2">
          {titles[mode]}
        </h1>
        <p style={{ color:"#5b5f6b" }} className="text-sm mb-5 leading-relaxed">{hints[mode]}</p>

        <div style={{ background:"#E8E2D4" }} className="flex rounded-xl p-1 mb-5 gap-0.5">
          {[
            ["guest","Гость"],
            ["login","Вход"],
            ["register","Рег."],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setMode(id); setError(null); if (id ==="guest") { setPassword(""); setPassword2(""); } }}
              style={{ background: mode === id ?"#F7F3EA" :"transparent", color:"#232323" }}
              className={`ui-press-static flex-1 rounded-lg py-2 text-sm font-semibold ${mode === id ?"shadow-sm" :""}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <TextField
            label="Имя"
            autoFocus
            className="mb-0"
            value={nameDraft}
            onChange={setNameDraft}
            onKeyDown={(e) => { if (e.key ==="Enter") submit(); }}
            placeholder="Например, Аня"
          />

          <div className={`auth-slot ${mode !=="guest" ?"is-open" :""}`}>
            <div className="auth-slot-inner flex flex-col gap-3">
              <PasswordField
                label="Пароль"
                className="mb-0"
                value={password}
                onChange={setPassword}
                onKeyDown={(e) => { if (e.key ==="Enter") submit(); }}
                placeholder="••••"
              />
              <div className={`auth-slot ${mode ==="register" ?"is-open" :""}`}>
                <div className="auth-slot-inner">
                  <PasswordField
                    label="Повтор пароля"
                    className="mb-0"
                    value={password2}
                    onChange={setPassword2}
                    onKeyDown={(e) => { if (e.key ==="Enter") submit(); }}
                    placeholder="••••"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ color:"#D8635B" }} className="text-sm mt-3">{error}</div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          style={{ background: canSubmit && !busy ?"#E8A33D" :"#DCD4C0", color:"#1B1F2A" }}
          className="ui-press-static w-full rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 mt-5"
        >
          {busy && <Loader2 className="animate-spin" size={16} />}
          {actions[mode]}
        </button>
      </div>
    </div>
  );
}

function LayoutToggle({ layout, onChange }) {
  const items = [
    { id:"calendar", label:"Календарь", icon: LayoutGrid },
    { id:"list", label:"Список", icon: List },
  ];
  return (
    <div style={{ background:"#F7F3EA" }} className="inline-flex rounded-xl p-1 gap-1 shadow-sm">
      {items.map(({ id, label, icon: Icon }) => {
        const active = layout === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              background: active ?"#232323" :"transparent",
              color: active ?"#F7F3EA" :"#5b5f6b",
            }}
            className="ui-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function EventsListView({ events, loading, userName, onOpen }) {
  if (loading) {
    return (
      <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="flex justify-center py-16 shadow-xl" >
        <Loader2 className="animate-spin" size={22} style={{ color:"#8B8FA0" }} />
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => `${a.date}${a.time ||""}`.localeCompare(`${b.date}${b.time ||""}`));
  const upcoming = sorted.filter((e) => e.date >= todayKey());
  const past = sorted.filter((e) => e.date < todayKey()).reverse();

  function groupByDate(list) {
    const map = new Map();
    for (const ev of list) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
    return [...map.entries()];
  }

  if (sorted.length === 0) {
    return (
      <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-8 shadow-xl text-center">
        <p style={{ color:"#8B8FA0" }} className="text-sm">Встреч пока нет. Создайте первую!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {upcoming.length > 0 && (
        <section style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-4 shadow-xl">
          <div style={{ color:"#8B8FA0" }} className="text-xs uppercase tracking-widest mb-3">
            Предстоящие · {upcoming.length}
          </div>
          <div className="flex flex-col gap-4">
            {groupByDate(upcoming).map(([date, dayEvents]) => (
              <div key={date}>
                <div style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-base mb-2">
                  {formatDateHeading(date)}
                </div>
                <div className="flex flex-col gap-2">
                  {dayEvents.map((ev) => (
                    <EventRow key={ev.id} ev={ev} onOpen={() => onOpen(ev)} userName={userName} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-4 shadow-xl opacity-80">
          <div style={{ color:"#8B8FA0" }} className="text-xs uppercase tracking-widest mb-3">
            Прошедшие · {past.length}
          </div>
          <div className="flex flex-col gap-4">
            {groupByDate(past).map(([date, dayEvents]) => (
              <div key={date}>
                <div style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-base mb-2">
                  {formatDateHeading(date)}
                </div>
                <div className="flex flex-col gap-2">
                  {dayEvents.map((ev) => (
                    <EventRow key={ev.id} ev={ev} onOpen={() => onOpen(ev)} userName={userName} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && past.length > 0 && (
        <p style={{ color:"#8B8FA0" }} className="text-sm text-center">Нет предстоящих встреч.</p>
      )}
    </div>
  );
}

function Cabinet({ user, events, loading, onOpen }) {
  const upcoming = events.filter((e) => e.date >= todayKey());
  const past = events.filter((e) => e.date < todayKey());

  return (
    <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-5 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={user.name} size={48} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-xl">{user.name}</div>
            {user.isGuest && (
              <span style={{ background:"#E8A33D33", color:"#8a5a12" }} className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5">
                Гость
              </span>
            )}
          </div>
          <div style={{ color:"#8B8FA0" }} className="text-sm">
            {user.isGuest
              ?"Гостевой режим · можно создавать встречи и отмечаться"
              :"Личный кабинет · мероприятия, куда вы идёте"}
          </div>
        </div>
      </div>

      {events.length > 0 && (
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => downloadIcsForUser(user.id, `meetings-${user.name}.ics`)}
              style={{ background:"#232323", color:"#F7F3EA" }}
              className="ui-press flex-1 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Download size={15} />
              Apple Calendar (.ics)
            </button>
            <button
              onClick={() => downloadIcsForUser(user.id, `meetings-${user.name}.ics`)}
              style={{ background:"#2E8B8B", color:"#F7F3EA" }}
              className="ui-press flex-1 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Download size={15} />
              Google Calendar (.ics)
            </button>
          </div>
          <p style={{ color:"#8B8FA0" }} className="text-xs mt-2">
            Скачайте .ics и откройте в Apple Calendar, либо импортируйте файл в Google Calendar → Настройки → Импорт.
            У каждой встречи есть быстрая ссылка «в Google».
          </p>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex justify-center py-10" style={{ color:"#8B8FA0" }}>
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : events.length === 0 ? (
        <p style={{ color:"#8B8FA0" }} className="text-sm text-center py-8">
          Пока нет встреч с отметкой «Приду». Откройте событие в календаре и отметьтесь.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <section>
            <div style={{ color:"#8B8FA0" }} className="text-xs uppercase tracking-widest mb-2">
              Предстоящие · {upcoming.length}
            </div>
            {upcoming.length === 0 ? (
              <p style={{ color:"#8B8FA0" }} className="text-sm">Нет предстоящих встреч.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={() => onOpen(ev)} showExport userName={user.name} />)}
              </div>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <div style={{ color:"#8B8FA0" }} className="text-xs uppercase tracking-widest mb-2">
                Прошедшие · {past.length}
              </div>
              <div className="flex flex-col gap-2 opacity-70">
                {past.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={() => onOpen(ev)} userName={user.name} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Header({ name, isGuest, saving, view, onToday, onCalendar, onIdeas, onCabinet, onLogout }) {
  const nav = [
    { id:"calendar", label:"Календарь", icon: CalendarDays, onClick: onCalendar },
    { id:"ideas", label:"Идеи", icon: Lightbulb, onClick: onIdeas },
    { id:"cabinet", label:"Кабинет", icon: UserRound, onClick: onCabinet },
  ];

  return (
    <div style={{ background:"#232323" }} className="px-4 pt-4 pb-3">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div style={{ color:"#E8A33D" }} className="text-[11px] uppercase tracking-widest">Общий календарь</div>
            <div style={{ fontFamily:"Fraunces, serif", color:"#F7F3EA" }} className="text-2xl leading-tight truncate">Встречи с друзьями</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && <span style={{ color:"#8B8FA0" }} className="text-xs hidden sm:inline">сохранение…</span>}
            {isGuest && (
              <span style={{ background:"#E8A33D33", color:"#E8A33D" }} className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 hidden sm:inline">
                Гость
              </span>
            )}
            <button onClick={onToday} style={{ color:"#F7F3EA", borderColor:"#8B8FA0" }} className="ui-press text-xs border rounded-full px-3 py-1.5 hidden sm:inline">Сегодня</button>
            <button onClick={onLogout} title="Выйти" style={{ color:"#8B8FA0" }} className="ui-press-static ui-hit p-1.5 rounded-lg hover:bg-white/5" aria-label="Выйти">
              <LogOut size={16} strokeWidth={1.75} />
            </button>
            <Avatar name={name} size={30} />
          </div>
        </div>

        <nav style={{ background:"#1B1F2A" }} className="flex rounded-xl p-1 gap-1">
          {nav.map(({ id, label, icon: Icon, onClick }) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={onClick}
                style={{
                  color: active ?"#1B1F2A" :"#F7F3EA",
                  background: active ?"#E8A33D" :"transparent",
                }}
                className="ui-press-static flex-1 rounded-lg py-2 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-white/5"
              >
                <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function EventRow({ ev, onOpen, showExport = false, userName }) {
  const yesCount = Object.values(ev.rsvps || {}).filter((v) => v ==="yes").length;
  const range = formatTimeRange(ev.time, ev.endTime);
  const myStatus = userName ? ev.rsvps?.[userName] : null;
  return (
    <div className="ui-card rounded-xl p-3 flex items-center gap-3" style={{ background: "#FFFDF8" }}>
      <button onClick={onOpen} className="flex items-center gap-3 text-left flex-1 min-w-0">
        {ev.photo ? (
          <img src={ev.photo} alt="" className="ui-img" style={{ width: 44, height: 44, borderRadius: 10, objectFit:"cover" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, background:"#2E8B8B22", color:"#2E8B8B" }} className="flex items-center justify-center shrink-0">
            <Camera size={18} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div style={{ color:"#232323" }} className="font-semibold text-sm truncate">{ev.title}</div>
            {myStatus ==="yes" && (
              <span style={{ background:"#2E8B8B22", color:"#2E8B8B" }} className="shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5">Иду</span>
            )}
            {myStatus ==="no" && (
              <span style={{ background:"#D8635B22", color:"#D8635B" }} className="shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5">Не иду</span>
            )}
          </div>
          <div style={{ color:"#8B8FA0" }} className="text-xs flex items-center gap-2 mt-0.5 flex-wrap">
            {ev.date && <span>{ev.date.split("-").reverse().join(".")}</span>}
            {range && <span className="flex items-center gap-1"><Clock size={11} />{range}</span>}
            {ev.location && <span className="flex items-center gap-1"><MapPin size={11} />{ev.location}</span>}
            {yesCount > 0 && <span className="flex items-center gap-1"><Users size={11} />{yesCount}</span>}
            {ev.comments?.length > 0 && <span className="flex items-center gap-1"><MessageCircle size={11} />{ev.comments.length}</span>}
          </div>
        </div>
      </button>
      {showExport && (
        <a
          href={googleCalendarUrl(ev)}
          target="_blank"
          rel="noreferrer"
          title="Добавить в Google Calendar"
          onClick={(e) => e.stopPropagation()}
          style={{ color:"#2E8B8B", borderColor:"#DCD4C0" }}
          className="ui-press shrink-0 p-2 rounded-full border hover:bg-black/5"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function ModalShell({ onClose, children }) {
  const [phase, setPhase] = useState("enter"); // enter | open | leave
  const panelRef = useRef(null);
  const innerRef = useRef(null);
  const heightReady = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const inner = innerRef.current;
    if (!panel || !inner) return;

    const apply = () => {
      const max = Math.round(window.innerHeight * 0.88);
      const next = Math.min(inner.offsetHeight, max);
      if (!heightReady.current) {
        panel.style.transition = "none";
        panel.style.height = `${next}px`;
        void panel.offsetHeight;
        panel.style.transition = "";
        heightReady.current = true;
        return;
      }
      panel.style.height = `${next}px`;
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(inner);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  function requestClose() {
    if (phase === "leave") return;
    setPhase("leave");
    window.setTimeout(onClose, 170);
  }

  return (
    <div
      className={`modal-backdrop ${phase === "open" ? "is-open" : ""} ${phase === "leave" ? "is-leave" : ""}`}
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
      >
        <div ref={innerRef} className="modal-panel-inner">
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
}

function NewEventModal({ defaultDate, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    try { setPhoto(await resizeImage(file)); } catch { /* ignore */ } finally { setPhotoBusy(false); }
  }

  async function submit() {
    if (!title.trim() || !date || busy) return;
    if (time && endTime && endTime < time) {
      setLocalError("Время окончания раньше начала");
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      await onCreate({
        title: title.trim(),
        date,
        time,
        endTime,
        location: location.trim(),
        description: description.trim(),
        photo,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      {(close) => (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-xl">Новая встреча</h2>
            <button onClick={close} style={{ color:"#8B8FA0" }} className="ui-press-static ui-hit p-1 rounded-lg" aria-label="Закрыть"><X size={20} /></button>
          </div>

          <TextField label="Название" value={title} onChange={setTitle} placeholder="Пикник в парке" />
          <DateField label="Дата" value={date} onChange={setDate} />

          <div className="grid grid-cols-2 gap-2">
            <TimeField label="Начало" value={time} onChange={setTime} placeholder="Выберите" />
            <TimeField label="Окончание" value={endTime} onChange={setEndTime} placeholder="Выберите" />
          </div>

          <TextField label="Место" value={location} onChange={setLocation} placeholder="Парк Горького" />
          <TextArea label="Описание" value={description} onChange={setDescription} placeholder="Берём плед и что-нибудь вкусное" />

          <div style={{ color:"#8B8FA0" }} className="text-xs font-medium mb-1">Фото</div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {photo ? (
            <div className="relative inline-block mb-3">
              <img src={photo} alt="" className="ui-img" style={{ width: 90, height: 90, borderRadius: 12, objectFit:"cover" }} />
              <button onClick={() => setPhoto(null)} style={{ background:"#232323", color:"#F7F3EA" }} className="ui-press absolute -top-2 -right-2 rounded-full p-1" aria-label="Убрать фото"><X size={12} /></button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={photoBusy} style={{ borderColor:"#DCD4C0", color:"#8B8FA0", background:"#FFFDF8" }} className="ui-press-static w-full border-2 border-dashed rounded-xl py-4 mb-3 flex items-center justify-center gap-2 text-sm hover:bg-black/[0.03]">
              {photoBusy ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
              {photoBusy ?"Обработка…" :"Добавить фото"}
            </button>
          )}

          {localError && <div style={{ color:"#D8635B" }} className="text-sm mb-2">{localError}</div>}

          <button onClick={submit} disabled={!title.trim() || !date || busy} style={{ background: title.trim() && date && !busy ?"#E8A33D" :"#DCD4C0", color:"#1B1F2A" }} className="ui-press w-full rounded-xl py-2.5 font-semibold mt-1 flex items-center justify-center gap-2">
            {busy && <Loader2 className="animate-spin" size={16} />}
            Создать встречу
          </button>
        </>
      )}
    </ModalShell>
  );
}

function EventDetailModal({ event, name, onClose, onRsvp, onComment, onDelete }) {
  const [comment, setComment] = useState("");
  const rsvps = event.rsvps || {};
  const myStatus = rsvps[name];
  const yesList = Object.entries(rsvps).filter(([, v]) => v ==="yes").map(([n]) => n);
  const noList = Object.entries(rsvps).filter(([, v]) => v ==="no").map(([n]) => n);
  const dateObj = new Date(event.date +"T00:00:00");
  const range = formatTimeRange(event.time, event.endTime);

  async function addComment() {
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment("");
    await onComment(text);
  }

  return (
    <ModalShell onClose={onClose}>
      {(close) => (
        <>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-xl leading-tight">{event.title}</h2>
              <div style={{ color:"#8B8FA0" }} className="text-sm mt-1 flex items-center gap-3 flex-wrap">
                <span>{dateObj.getDate()} {MONTHS[dateObj.getMonth()]}</span>
                {range && <span className="flex items-center gap-1"><Clock size={12} />{range}</span>}
                {event.location && <span className="flex items-center gap-1"><MapPin size={12} />{event.location}</span>}
              </div>
            </div>
            <button onClick={close} style={{ color:"#8B8FA0" }} className="ui-press-static ui-hit p-1 rounded-lg" aria-label="Закрыть"><X size={20} /></button>
          </div>

          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
            style={{ background:"#2E8B8B18", color:"#2E8B8B", borderColor:"#2E8B8B44" }}
            className="ui-press mb-3 inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-3 py-1.5"
          >
            <ExternalLink size={12} /> В Google Calendar
          </a>

          {event.photo && <img src={event.photo} alt="" style={{ width:"100%", maxHeight: 220, objectFit:"cover", borderRadius: 14 }} className="ui-img mb-3" />}
          {event.description && <p style={{ color:"#3f4351" }} className="text-sm mb-4">{event.description}</p>}

          <div style={{ borderColor:"#DCD4C0" }} className="border-t pt-3 mb-4">
            <div style={{ color:"#8B8FA0" }} className="text-xs font-medium mb-2">Придёте?</div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => onRsvp("yes")} style={{ background: myStatus ==="yes" ?"#2E8B8B" :"#2E8B8B18", color: myStatus ==="yes" ?"#F7F3EA" :"#2E8B8B" }} className="ui-press flex-1 rounded-xl py-2 text-sm font-semibold flex items-center justify-center gap-1">
                <Check size={15} /> Приду
              </button>
              <button onClick={() => onRsvp("no")} style={{ background: myStatus ==="no" ?"#D8635B" :"#D8635B18", color: myStatus ==="no" ?"#F7F3EA" :"#D8635B" }} className="ui-press flex-1 rounded-xl py-2 text-sm font-semibold flex items-center justify-center gap-1">
                <X size={15} /> Не приду
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-xs" style={{ color:"#8B8FA0" }}>
              {yesList.length > 0 && <span>Идут: {yesList.join(", ")}</span>}
              {noList.length > 0 && <span>Не идут: {noList.join(", ")}</span>}
              {yesList.length === 0 && noList.length === 0 && <span>Пока никто не отметился</span>}
            </div>
          </div>

          <div style={{ borderColor:"#DCD4C0" }} className="border-t pt-3">
            <div style={{ color:"#8B8FA0" }} className="text-xs font-medium mb-2">Комментарии</div>
            <div className="flex flex-col gap-3 mb-3 max-h-52 overflow-y-auto">
              {(event.comments || []).length === 0 && <p style={{ color:"#8B8FA0" }} className="text-sm">Комментариев пока нет.</p>}
              {(event.comments || []).map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.name} size={26} />
                  <div>
                    <div className="text-sm"><span style={{ color:"#232323" }} className="font-semibold">{c.name}</span></div>
                    <div style={{ color:"#3f4351" }} className="text-sm">{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 mb-0">
                <TextField
                  value={comment}
                  onChange={setComment}
                  onKeyDown={(e) => { if (e.key ==="Enter") addComment(); }}
                  placeholder="Написать комментарий…"
                  className="mb-0"
                />
              </div>
              <button onClick={addComment} disabled={!comment.trim()} style={{ background: comment.trim() ?"#E8A33D" :"#DCD4C0", color:"#1B1F2A", height: 42 }} className="ui-press rounded-xl px-4 text-sm font-semibold mb-3">Отпр.</button>
            </div>
          </div>

          <button onClick={() => onDelete(event.id)} style={{ color:"#D8635B" }} className="ui-press-static w-full text-xs mt-5 py-1 rounded-lg hover:bg-red-50">Удалить встречу</button>
        </>
      )}
    </ModalShell>
  );
}

function FontLoader() {
  useEffect(() => {
    if (document.getElementById("meetup-fonts")) return;
    const link = document.createElement("link");
    link.id ="meetup-fonts";
    link.rel ="stylesheet";
    link.href ="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}
