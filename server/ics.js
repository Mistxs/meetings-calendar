function pad(n) {
  return String(n).padStart(2, "0");
}

function fold(line) {
  const chunks = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function escapeText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toStamp(dateStr, timeStr, fallback = "00:00") {
  const t = timeStr || fallback;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hh || 0)}${pad(mm || 0)}00`;
}

function addHour(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
  dt.setHours(dt.getHours() + 1);
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}

function nowStamp() {
  const n = new Date();
  return (
    `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T` +
    `${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`
  );
}

export function eventsToIcs(events, calendarName = "Мои встречи") {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `PRODID:-//meetings-cal//RU`,
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const ev of events) {
    const start = toStamp(ev.date, ev.time, "12:00");
    let endDate = ev.date;
    let endTime = ev.endTime || ev.end_time || "";
    if (!endTime) {
      if (ev.time) {
        const next = addHour(ev.date, ev.time);
        endDate = next.date;
        endTime = next.time;
      } else {
        endTime = "13:00";
      }
    }
    const end = toStamp(endDate, endTime);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}@meetings-cal`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(fold(`SUMMARY:${escapeText(ev.title)}`));
    if (ev.location) lines.push(fold(`LOCATION:${escapeText(ev.location)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${escapeText(ev.description)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
