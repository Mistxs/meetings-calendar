import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Eye, EyeOff } from "lucide-react";

const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

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
  return <label style={labelStyle} className="text-xs font-medium tracking-wide">{children}</label>;
}

export function TextField({
  label, value, onChange, placeholder, type = "text", autoFocus, onKeyDown, className = "",
}) {
  return (
    <div className={`mb-3 ${className}`}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={fieldShell}
        className="w-full px-3.5 py-2.5 mt-1 outline-none text-sm transition-shadow focus:shadow-[0_0_0_3px_rgba(232,163,61,0.28)]"
      />
    </div>
  );
}

export function PasswordField({ label, value, onChange, placeholder, onKeyDown, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mb-3">
      {label && <FieldLabel>{label}</FieldLabel>}
      <div className="relative mt-1">
        <input
          autoFocus={autoFocus}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={fieldShell}
          className="w-full px-3.5 py-2.5 pr-11 outline-none text-sm transition-shadow focus:shadow-[0_0_0_3px_rgba(232,163,61,0.28)]"
          autoComplete={label?.includes("Повтор") ? "new-password" : "current-password"}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          style={{ color: "#8B8FA0" }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
          tabIndex={-1}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export function TextArea({ label, value, onChange, placeholder, rows = 2 }) {
  return (
    <div className="mb-3">
      {label && <FieldLabel>{label}</FieldLabel>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={fieldShell}
        className="w-full px-3.5 py-2.5 mt-1 outline-none text-sm resize-none transition-shadow focus:shadow-[0_0_0_3px_rgba(232,163,61,0.28)]"
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
        className="w-full px-3.5 py-2.5 mt-1 outline-none text-sm flex items-center justify-between text-left transition-shadow focus:shadow-[0_0_0_3px_rgba(232,163,61,0.28)]"
      >
        <span style={{ color: value ? "#232323" : "#8B8FA0" }}>{formatDateRu(value)}</span>
        <CalendarDays size={16} style={{ color: "#E8A33D" }} />
      </button>

      {open && (
        <div
          style={{ background: "#FFFDF8", border: "1.5px solid #DCD4C0", borderRadius: 16, zIndex: 40 }}
          className="absolute left-0 right-0 mt-2 p-3 shadow-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-full hover:bg-black/5" style={{ color: "#232323" }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ fontFamily: "Fraunces, serif", color: "#232323" }} className="text-sm capitalize">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-full hover:bg-black/5" style={{ color: "#232323" }}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ color: "#8B8FA0" }} className="text-center text-[10px] uppercase py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} />;
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
                  className="aspect-square rounded-lg text-sm font-medium hover:bg-black/5"
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

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = ["00", "15", "30", "45"];

function parseTime(value) {
  if (!value) return { h: "", m: "" };
  const [h = "", m = ""] = value.split(":");
  return { h, m: MINUTES.includes(m) ? m : (m ? m.padStart(2, "0") : "") };
}

export function TimeField({ label, value, onChange, placeholder = "—" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const { h, m } = parseTime(value);
  const display = value || placeholder;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(nextH, nextM) {
    if (!nextH || !nextM) return;
    onChange(`${nextH}:${nextM}`);
  }

  return (
    <div className="mb-3 relative" ref={rootRef}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={fieldShell}
        className="w-full px-3.5 py-2.5 mt-1 outline-none text-sm flex items-center justify-between text-left transition-shadow focus:shadow-[0_0_0_3px_rgba(232,163,61,0.28)]"
      >
        <span style={{ color: value ? "#232323" : "#8B8FA0" }}>{display}</span>
        <Clock size={16} style={{ color: "#2E8B8B" }} />
      </button>

      {open && (
        <div
          style={{ background: "#FFFDF8", border: "1.5px solid #DCD4C0", borderRadius: 16, zIndex: 40 }}
          className="absolute left-0 right-0 mt-2 p-3 shadow-xl"
        >
          <div className="flex gap-3">
            <div className="flex-1">
              <div style={labelStyle} className="text-[10px] uppercase mb-1">Часы</div>
              <div className="max-h-36 overflow-y-auto grid grid-cols-4 gap-1">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => pick(hour, m || "00")}
                    style={{
                      background: h === hour ? "#2E8B8B" : "#F0EBE0",
                      color: h === hour ? "#F7F3EA" : "#232323",
                    }}
                    className="rounded-lg py-1.5 text-xs font-semibold"
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-20">
              <div style={labelStyle} className="text-[10px] uppercase mb-1">Мин</div>
              <div className="flex flex-col gap-1">
                {MINUTES.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => pick(h || "12", min)}
                    style={{
                      background: m === min ? "#E8A33D" : "#F0EBE0",
                      color: m === min ? "#1B1F2A" : "#232323",
                    }}
                    className="rounded-lg py-1.5 text-xs font-semibold"
                  >
                    {min}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-3">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{ color: "#8B8FA0" }}
              className="text-xs"
            >
              Очистить
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: "#232323", color: "#F7F3EA" }}
              className="text-xs rounded-full px-3 py-1.5"
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
