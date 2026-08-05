function pad(n) {
  return String(n).padStart(2, "0");
}

function toCompact(dateStr, timeStr, fallback = "12:00") {
  const t = timeStr || fallback;
  const [y, m, d] = dateStr.split("-");
  const [hh, mm] = t.split(":");
  return `${y}${m}${d}T${pad(hh)}${pad(mm)}00`;
}

function addHour(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "12:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
  dt.setHours(dt.getHours() + 1);
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}

export function googleCalendarUrl(ev) {
  const start = toCompact(ev.date, ev.time, "12:00");
  let endDate = ev.date;
  let endTime = ev.endTime || "";
  if (!endTime) {
    if (ev.time) {
      const next = addHour(ev.date, ev.time);
      endDate = next.date;
      endTime = next.time;
    } else {
      endTime = "13:00";
    }
  }
  const end = toCompact(endDate, endTime);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "Встреча",
    dates: `${start}/${end}`,
    details: ev.description || "",
    location: ev.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcsForUser(userId, filename = "meetings.ics", calendarId) {
  const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
  const a = document.createElement("a");
  a.href = `/api/users/${userId}/events.ics${q}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
