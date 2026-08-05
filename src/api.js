async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

export const api = {
  register: (name, password) =>
    request("/api/register", { method: "POST", body: JSON.stringify({ name, password }) }),
  login: (name, password) =>
    request("/api/login", { method: "POST", body: JSON.stringify({ name, password }) }),
  getUser: (id) => request(`/api/users/${id}`),
  listEvents: () => request("/api/events"),
  myEvents: (userId, status = "yes") =>
    request(`/api/users/${userId}/events?status=${encodeURIComponent(status)}`),
  createEvent: (payload) =>
    request("/api/events", { method: "POST", body: JSON.stringify(payload) }),
  deleteEvent: (id) => request(`/api/events/${id}`, { method: "DELETE" }),
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
  listIdeas: (userId) =>
    request(`/api/ideas?userId=${encodeURIComponent(userId || "")}`),
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
};
