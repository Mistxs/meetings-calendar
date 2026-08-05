async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("Сервер недоступен. Перезапустите npm run dev (API на порту 3001).");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || `Ошибка ${res.status}`);
  return data;
}

export const api = {
  register: (name, password) =>
    request("/api/register", { method: "POST", body: JSON.stringify({ name, password }) }),
  login: (name, password) =>
    request("/api/login", { method: "POST", body: JSON.stringify({ name, password }) }),
  guest: (name) =>
    request("/api/guest", { method: "POST", body: JSON.stringify({ name }) }),
  getUser: (id) => request(`/api/users/${id}`),

  listCalendars: (userId) =>
    request(`/api/calendars?userId=${encodeURIComponent(userId)}`),
  createCalendar: (payload) =>
    request("/api/calendars", { method: "POST", body: JSON.stringify(payload) }),
  getCalendar: (slug, userId) =>
    request(`/api/calendars/${encodeURIComponent(slug)}?userId=${encodeURIComponent(userId)}`),
  updateCalendar: (slug, payload) =>
    request(`/api/calendars/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  rotateInvite: (slug, userId) =>
    request(`/api/calendars/${encodeURIComponent(slug)}/rotate-invite`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  deleteCalendar: (slug, userId) =>
    request(`/api/calendars/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    }),
  previewJoin: (token) => request(`/api/join/${encodeURIComponent(token)}`),
  joinCalendar: (token, userId) =>
    request(`/api/join/${encodeURIComponent(token)}`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  listEvents: (calendarId, userId) =>
    request(
      `/api/events?calendarId=${encodeURIComponent(calendarId)}&userId=${encodeURIComponent(userId)}`
    ),
  myEvents: (userId, status = "yes", calendarId) => {
    const q = new URLSearchParams({ status });
    if (calendarId) q.set("calendarId", calendarId);
    return request(`/api/users/${userId}/events?${q}`);
  },
  createEvent: (payload) =>
    request("/api/events", { method: "POST", body: JSON.stringify(payload) }),
  deleteEvent: (id, userId) =>
    request(`/api/events/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    }),
  setRsvp: (eventId, userId, status) =>
    request(`/api/events/${eventId}/rsvp`, {
      method: "POST",
      body: JSON.stringify({ userId, status }),
    }),
  addComment: (eventId, userId, text) =>
    request(`/api/events/${eventId}/comments`, {
      method: "POST",
      body: JSON.stringify({ userId, text }),
    }),
  listIdeas: (calendarId, userId) =>
    request(
      `/api/ideas?calendarId=${encodeURIComponent(calendarId)}&userId=${encodeURIComponent(userId || "")}`
    ),
  createIdea: (payload) =>
    request("/api/ideas", { method: "POST", body: JSON.stringify(payload) }),
  deleteIdea: (id, userId) =>
    request(`/api/ideas/${id}`, { method: "DELETE", body: JSON.stringify({ userId }) }),
  voteIdea: (id, userId) =>
    request(`/api/ideas/${id}/vote`, { method: "POST", body: JSON.stringify({ userId }) }),
  addIdeaDate: (id, payload) =>
    request(`/api/ideas/${id}/dates`, { method: "POST", body: JSON.stringify(payload) }),
  voteIdeaDate: (dateId, userId) =>
    request(`/api/ideas/dates/${dateId}/vote`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  scheduleIdea: (id, dateId, userId) =>
    request(`/api/ideas/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ dateId, userId }),
    }),

  adminLogin: (username, password) =>
    request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  adminLogout: (token) =>
    request("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminMe: (token) =>
    request("/api/admin/me", { headers: { Authorization: `Bearer ${token}` } }),
  adminStats: (token) =>
    request("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }),
  adminCalendars: (token) =>
    request("/api/admin/calendars", { headers: { Authorization: `Bearer ${token}` } }),
  adminUpdateCalendar: (token, id, payload) =>
    request(`/api/admin/calendars/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
  adminGrantAccess: (token, id, userId) =>
    request(`/api/admin/calendars/${id}/access`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    }),
  adminDeleteCalendar: (token, id) =>
    request(`/api/admin/calendars/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminEvents: (token, calendarId) => {
    const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return request(`/api/admin/events${q}`, { headers: { Authorization: `Bearer ${token}` } });
  },
  adminDeleteEvent: (token, id) =>
    request(`/api/admin/events/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminComments: (token, calendarId) => {
    const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return request(`/api/admin/comments${q}`, { headers: { Authorization: `Bearer ${token}` } });
  },
  adminDeleteComment: (token, id) =>
    request(`/api/admin/comments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminIdeas: (token, calendarId) => {
    const q = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : "";
    return request(`/api/admin/ideas${q}`, { headers: { Authorization: `Bearer ${token}` } });
  },
  adminDeleteIdea: (token, id) =>
    request(`/api/admin/ideas/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminUsers: (token) =>
    request("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
};
