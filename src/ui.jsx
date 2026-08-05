import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Eye, EyeOff } from "lucide-react";

const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = ["00", "15", "30", "45"];
const PRESETS = ["10:00", "12:00", "15:00", "18:00", "19:00", "20:00"];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function toKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

const fieldShell = {
  background: "#FFFDF8",
  border: "1.5px solid #DCD4C0",
  borderRadius: 14,
  color: "#232323",
};

const labelStyle = { color: "#8B8FA0" };

export function FieldLabel({ children }) {
  return <label style={labelStyle} className="block text-xs font-medium tracking-wide">{children}</label>;
}

export function TextField({
  label, value, onChange, placeholder, type = "text", autoFocus, onKeyDown, className = "mb-3",
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={fieldShell}
        className="ui-field w-full px-3.5 py-2.5 outline-none text-sm"
      />
    </div>
  );
}

export function PasswordField({
  label, value, onChange, placeholder, onKeyDown, autoFocus, className = "mb-3",
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div className="relative">
        <input
          autoFocus={autoFocus}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={fieldShell}
          className="ui-field w-full px-3.5 py-2.5 pr-12 outline-none text-sm"
          autoComplete={label?.includes("Повтор") ? "new-password" : "current-password"}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          style={{ color: "#8B8FA0" }}
          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center rounded-r-[12px]"
          tabIndex={-1}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        >
          {show
            ? <EyeOff size={16} strokeWidth={1.75} />
            : <Eye size={16} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}

export function TextArea({ label, value, onChange, placeholder, rows = 2, className = "mb-3" }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={fieldShell}
        className="ui-field w-full px-3.5 py-2.5 outline-none text-sm resize-none"
      />
    </div>
  );
}

function formatDateRu(value) {
  if (!value) return "Выберите дату";
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function DateField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const base = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!value) return;
    const d = new Date(value + "T00:00:00");
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [value]);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shiftMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <div className="mb-3 relative" ref={rootRef}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={fieldShell}
        className="ui-field ui-press w-full px-3.5 py-2.5 mt-1 outline-none text-sm flex items-center justify-between text-left"
      >
        <span style={{ color: value ? "#232323" : "#8B8FA0" }}>{formatDateRu(value)}</span>
        <CalendarDays size={16} style={{ color: "#E8A33D" }} />
      </button>

      {open && (
        <div
          style={{ background: "#FFFDF8", border: "1.5px solid #DCD4C0", borderRadius: 14, zIndex: 50, width: 228 }}
          className="picker-pop is-open absolute left-0 mt-1.5 p-2.5 shadow-xl"
        >
          <div className="flex items-center justify-between mb-1.5">
            <button type="button" onClick={() => shiftMonth(-1)} className="ui-press-static ui-hit p-1 rounded-full hover:bg-black/5" style={{ color: "#232323" }} aria-label="Предыдущий месяц">
              <ChevronLeft size={14} strokeWidth={1.75} />
            </button>
            <div style={{ fontFamily: "Fraunces, serif", color: "#232323" }} className="text-xs capitalize tabular-nums">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} className="ui-press-static ui-hit p-1 rounded-full hover:bg-black/5" style={{ color: "#232323" }} aria-label="Следующий месяц">
              <ChevronRight size={14} strokeWidth={1.75} />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-0.5">
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ color: "#8B8FA0" }} className="text-center text-[9px] uppercase py-0.5">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} className="h-7" />;
              const key = toKey(viewYear, viewMonth, d);
              const selected = key === value;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(key); setOpen(false); }}
                  style={{
                    background: selected ? "#E8A33D" : "transparent",
                    color: selected ? "#1B1F2A" : "#232323",
                  }}
                  className="ui-press-static h-7 w-full rounded-md text-[11px] font-medium tabular-nums hover:bg-black/5"
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function parseTime(value) {
  if (!value) return { h: "12", m: "00" };
  const [h = "12", m = "00"] = value.split(":");
  const minute = MINUTES.includes(m) ? m : MINUTES.reduce((best, cur) =>
    Math.abs(Number(cur) - Number(m)) < Math.abs(Number(best) - Number(m)) ? cur : best
  , "00");
  return { h: pad(Number(h) || 0), m: minute };
}

function WheelColumn({ items, value, onChange, accent = "#2E8B8B" }) {
  const listRef = useRef(null);
  const itemH = 32;

  useEffect(() => {
    const idx = Math.max(0, items.indexOf(value));
    if (listRef.current) {
      listRef.current.scrollTop = idx * itemH;
    }
  }, [items, value]);

  return (
    <div className="relative flex-1">
      <div
        aria-hidden
        style={{ top: itemH, borderColor: `${accent}55`, background: `${accent}14` }}
        className="pointer-events-none absolute left-0 right-0 h-8 rounded-lg border"
      />
      <div
        ref={listRef}
        className="time-wheel h-24 overflow-y-auto snap-y snap-mandatory py-8"
        onScroll={(e) => {
          const idx = Math.round(e.currentTarget.scrollTop / itemH);
          const next = items[Math.min(items.length - 1, Math.max(0, idx))];
          if (next && next !== value) onChange(next);
        }}
      >
        {items.map((item) => {
          const active = item === value;
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                onChange(item);
                if (listRef.current) {
                  listRef.current.scrollTo({ top: items.indexOf(item) * itemH, behavior: "smooth" });
                }
              }}
              style={{ color: active ? "#232323" : "#8B8FA0", height: itemH }}
              className="w-full snap-center text-sm font-semibold transition-colors duration-150"
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimeField({ label, value, onChange, placeholder = "—" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const parsed = parseTime(value || "12:00");
  const [h, setH] = useState(parsed.h);
  const [m, setM] = useState(parsed.m);

  useEffect(() => {
    if (!open) return;
    const p = parseTime(value || "12:00");
    setH(p.h);
    setM(p.m);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function apply(nextH = h, nextM = m) {
    onChange(`${nextH}:${nextM}`);
  }

  return (
    <div className="mb-3 relative" ref={rootRef}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={fieldShell}
        className="ui-field ui-press w-full px-3.5 py-2.5 mt-1 outline-none text-sm flex items-center justify-between text-left"
      >
        <span style={{ color: value ? "#232323" : "#8B8FA0" }}>{value || placeholder}</span>
        <Clock size={16} style={{ color: "#2E8B8B" }} />
      </button>

      {open && (
        <div
          style={{ background: "#FFFDF8", border: "1.5px solid #DCD4C0", borderRadius: 16, zIndex: 50, width: 220 }}
          className="picker-pop is-open absolute left-0 mt-1.5 p-3 shadow-xl"
        >
          <div
            style={{ fontFamily: "Fraunces, serif", color: "#232323" }}
            className="text-center text-2xl tracking-wide mb-2"
          >
            {h}:{m}
          </div>

          <div className="flex gap-2 mb-2">
            <WheelColumn
              items={HOURS}
              value={h}
              onChange={(next) => { setH(next); apply(next, m); }}
              accent="#2E8B8B"
            />
            <div style={{ color: "#8B8FA0" }} className="self-center text-lg font-semibold pb-1">:</div>
            <WheelColumn
              items={MINUTES}
              value={m}
              onChange={(next) => { setM(next); apply(h, next); }}
              accent="#E8A33D"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const [ph, pm] = p.split(":");
                  setH(ph); setM(pm); apply(ph, pm);
                }}
                style={{
                  background: value === p ? "#E8A33D" : "#F0EBE0",
                  color: value === p ? "#1B1F2A" : "#5b5f6b",
                }}
                className="ui-press rounded-full px-2.5 py-1 text-[11px] font-semibold"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{ color: "#8B8FA0" }}
              className="ui-press text-xs px-1 py-1 rounded-md hover:bg-black/5"
            >
              Очистить
            </button>
            <button
              type="button"
              onClick={() => { apply(); setOpen(false); }}
              style={{ background: "#232323", color: "#F7F3EA" }}
              className="ui-press text-xs rounded-full px-3.5 py-1.5 font-semibold"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function formatTimeRange(time, endTime) {
  if (time && endTime) return `${time}–${endTime}`;
  if (time) return time;
  if (endTime) return `до ${endTime}`;
  return "";
}
