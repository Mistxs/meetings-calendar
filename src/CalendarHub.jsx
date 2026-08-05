import React, { useEffect, useState } from "react";
import { CalendarDays, Link2, Loader2, Lock, Plus, Users } from "lucide-react";
import { api } from "./api";
import { TextField } from "./ui";

export default function CalendarHub({ user, onOpen, onLogout, joinPreview }) {
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("link");
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await api.listCalendars(user.id);
        setCalendars(Array.isArray(list) ? list : []);
        setError(null);
      } catch (e) {
        setError(e.message || "Не удалось загрузить календари");
      } finally {
        setLoading(false);
      }
    })();
  }, [user.id]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const cal = await api.createCalendar({
        name: name.trim(),
        visibility,
        userId: user.id,
      });
      onOpen(cal);
    } catch (e) {
      setError(e.message || "Не удалось создать");
    } finally {
      setBusy(false);
    }
  }

  async function acceptJoin() {
    if (!joinPreview?.token) return;
    setJoining(true);
    try {
      const cal = await api.joinCalendar(joinPreview.token, user.id);
      onOpen(cal);
    } catch (e) {
      setError(e.message || "Не удалось присоединиться");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{ background: "#1B1F2A", minHeight: "100vh" }} className="flex items-center justify-center p-6">
      <div style={{ background: "#F7F3EA", borderRadius: 20 }} className="auth-card w-full max-w-md p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <div style={{ color: "#8B8FA0" }} className="text-xs uppercase tracking-widest mb-2">
              Ваши пространства
            </div>
            <h1 style={{ fontFamily: "Fraunces, serif", color: "#232323" }} className="text-2xl">
              Календари
            </h1>
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{ color: "#8B8FA0" }}
            className="text-xs font-semibold underline-offset-2 hover:underline"
          >
            Выйти · {user.name}
          </button>
        </div>
        <p style={{ color: "#5b5f6b" }} className="text-sm mb-5 leading-relaxed">
          У каждой команды свой календарь. Создайте новый или откройте по приглашению.
        </p>

        {joinPreview && (
          <div
            style={{ background: "#2E8B8B14", border: "1.5px solid #2E8B8B55" }}
            className="rounded-2xl p-4 mb-4"
          >
            <div style={{ color: "#2E8B8B" }} className="text-xs font-bold uppercase tracking-widest mb-1">
              Приглашение
            </div>
            <div style={{ color: "#232323" }} className="font-semibold mb-3">
              {joinPreview.name}
            </div>
            <button
              type="button"
              onClick={acceptJoin}
              disabled={joining}
              style={{ background: "#2E8B8B", color: "#F7F3EA" }}
              className="ui-press-static w-full rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            >
              {joining && <Loader2 className="animate-spin" size={14} />}
              Присоединиться
            </button>
          </div>
        )}

        {error && (
          <div style={{ color: "#D8635B" }} className="text-sm mb-3">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div style={{ color: "#8B8FA0" }} className="text-xs uppercase tracking-widest">
            Мои · {calendars.length}
          </div>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            style={{ color: "#E8A33D" }}
            className="ui-press-static text-sm font-semibold flex items-center gap-1 rounded-md px-1.5 py-1"
          >
            <Plus size={14} /> Создать
          </button>
        </div>

        <div className={`auth-slot ${showNew ? "is-open" : ""}`}>
          <div className="auth-slot-inner">
            <div style={{ background: "#FFFDF8", border: "1.5px solid #DCD4C0" }} className="rounded-2xl p-4 mb-3">
              <TextField
                label="Название"
                className="mb-3"
                value={name}
                onChange={setName}
                placeholder="Например, Друзья / Команда"
              />
              <div style={{ color: "#8B8FA0" }} className="text-xs font-medium tracking-wide mb-1.5">
                Доступ
              </div>
              <div style={{ background: "#E8E2D4" }} className="flex rounded-xl p-1 gap-0.5 mb-3">
                {[
                  ["link", "По ссылке", Link2],
                  ["private", "Приватный", Lock],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVisibility(id)}
                    style={{
                      background: visibility === id ? "#F7F3EA" : "transparent",
                      color: "#232323",
                    }}
                    className={`ui-press-static flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1 ${
                      visibility === id ? "shadow-sm" : ""
                    }`}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={create}
                disabled={!name.trim() || busy}
                style={{
                  background: name.trim() && !busy ? "#E8A33D" : "#DCD4C0",
                  color: "#1B1F2A",
                }}
                className="ui-press-static w-full rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="animate-spin" size={14} />}
                Создать календарь
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10" style={{ color: "#8B8FA0" }}>
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : calendars.length === 0 ? (
          <p style={{ color: "#8B8FA0" }} className="text-sm text-center py-8">
            Пока нет календарей. Создайте первый или откройте ссылку-приглашение.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {calendars.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(c)}
                style={{ background: "#FFFDF8", border: "1.5px solid #DCD4C0" }}
                className="ui-press-static text-left rounded-2xl px-4 py-3 flex items-center gap-3"
              >
                <div
                  style={{ background: "#E8A33D22", color: "#E8A33D" }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                >
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div style={{ color: "#232323" }} className="font-semibold truncate">
                    {c.name}
                  </div>
                  <div style={{ color: "#8B8FA0" }} className="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} /> {c.memberCount ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {c.visibility === "private" ? <Lock size={11} /> : <Link2 size={11} />}
                      {c.visibility === "private" ? "Приватный" : "По ссылке"}
                    </span>
                    {c.role === "owner" && <span>владелец</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
