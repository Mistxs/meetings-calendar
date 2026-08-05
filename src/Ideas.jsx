import React, { useCallback, useEffect, useState } from"react";
import {
  Lightbulb, Loader2, Plus, ThumbsUp, Trash2, Check, ChevronDown, ChevronUp,
} from"lucide-react";
import { api } from"./api";
import { TextField, TextArea, DateField, TimeField, formatTimeRange } from"./ui";

const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];

function formatDateRu(value) {
  if (!value) return"";
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
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

export default function IdeasBoard({ user, onScheduled }) {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listIdeas(user.id);
      setIdeas(sortIdeas(Array.isArray(list) ? list : []));
      setError(null);
    } catch (e) {
      setError(e.message ||"Не удалось загрузить идеи");
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  async function wrap(id, fn) {
    setBusyId(id ||"new");
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e.message ||"Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ background:"#F7F3EA", borderRadius: 20 }} className="p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={20} style={{ color:"#E8A33D" }} />
            <h2 style={{ fontFamily:"Fraunces, serif", color:"#232323" }} className="text-xl">Идеи для встреч</h2>
          </div>
          <p style={{ color:"#8B8FA0" }} className="text-sm">
            Предложите идею, проголосуйте за понравившиеся и выберите удобную дату.
          </p>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          style={{ background:"#E8A33D", color:"#1B1F2A" }}
          className="ui-press-static shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold"
        >
          <Plus size={15} /> Идея
        </button>
      </div>

      {error && (
        <div style={{ background:"#D8635B22", border:"1px solid #D8635B", color:"#D8635B" }} className="rounded-lg px-3 py-2 text-sm mb-3">
          {error}
        </div>
      )}

      {showNew && (
        <NewIdeaForm
          busy={busyId ==="new"}
          onCancel={() => setShowNew(false)}
          onCreate={async (payload) => {
            await wrap("new", async () => {
              const idea = await api.createIdea({ ...payload, userId: user.id });
              setIdeas((prev) => [idea, ...prev]);
              setShowNew(false);
            });
          }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12" style={{ color:"#8B8FA0" }}>
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : ideas.length === 0 ? (
        <p style={{ color:"#8B8FA0" }} className="text-sm text-center py-10">
          Пока нет идей. Будьте первым — предложите встречу!
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              user={user}
              busy={busyId === idea.id}
              onVote={() => wrap(idea.id, async () => {
                const updated = await api.voteIdea(idea.id, user.id);
                setIdeas((prev) => patchIdea(prev, updated));
              })}
              onAddDate={async (payload) => {
                await wrap(idea.id, async () => {
                  const updated = await api.addIdeaDate(idea.id, { ...payload, userId: user.id });
                  setIdeas((prev) => patchIdea(prev, updated));
                });
              }}
              onVoteDate={(dateId) => wrap(idea.id, async () => {
                const updated = await api.voteIdeaDate(dateId, user.id);
                setIdeas((prev) => patchIdea(prev, updated));
              })}
              onSchedule={(dateId) => wrap(idea.id, async () => {
                const result = await api.scheduleIdea(idea.id, dateId, user.id);
                setIdeas((prev) => patchIdea(prev, result.idea));
                onScheduled?.(result.event);
              })}
              onDelete={() => wrap(idea.id, async () => {
                await api.deleteIdea(idea.id, user.id);
                setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function sortIdeas(list) {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status ==="open" ? -1 : 1;
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/** Keep date row order stable after votes so the list doesn't reshuffle under the cursor. */
function mergeIdea(prev, updated) {
  if (!prev) return updated;
  const prevDates = prev.dates || [];
  const nextById = new Map((updated.dates || []).map((d) => [d.id, d]));
  const dates = [];
  for (const d of prevDates) {
    const next = nextById.get(d.id);
    if (next) {
      dates.push(next);
      nextById.delete(d.id);
    }
  }
  for (const d of nextById.values()) dates.push(d);
  return { ...updated, dates };
}

function patchIdea(prev, updated) {
  return prev.map((i) => (i.id === updated.id ? mergeIdea(i, updated) : i));
}

function NewIdeaForm({ onCreate, onCancel, busy }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div style={{ background:"#FFFDF8", border:"1.5px solid #DCD4C0", borderRadius: 16 }} className="p-4 mb-4">
      <TextField label="Название" value={title} onChange={setTitle} placeholder="Кино и пицца" />
      <TextArea label="Описание" value={description} onChange={setDescription} placeholder="Что задумано, где примерно…" />
      <div className="flex gap-2">
        <button
          onClick={() => title.trim() && onCreate({ title: title.trim(), description: description.trim() })}
          disabled={!title.trim() || busy}
          style={{ background: title.trim() && !busy ?"#E8A33D" :"#DCD4C0", color:"#1B1F2A" }}
          className="flex-1 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="animate-spin" size={14} />}
          Опубликовать
        </button>
        <button onClick={onCancel} style={{ color:"#8B8FA0", borderColor:"#DCD4C0" }} className="rounded-xl px-4 text-sm border">
          Отмена
        </button>
      </div>
    </div>
  );
}

function IdeaCard({ idea, user, busy, onVote, onAddDate, onVoteDate, onSchedule, onDelete }) {
  const [expanded, setExpanded] = useState(idea.status ==="open");
  const [showDateForm, setShowDateForm] = useState(false);
  const isOpen = idea.status ==="open";
  const isAuthor = idea.createdBy === user.id;

  return (
    <div style={{ background:"#FFFDF8", border:"1.5px solid #DCD4C0" }} className="rounded-[20px] p-3">
      <div className="flex gap-3">
        <button
          onClick={onVote}
          disabled={busy}
          style={{
            background: idea.votedByMe ?"#E8A33D" :"#F0EBE0",
            color: idea.votedByMe ?"#1B1F2A" :"#232323",
          }}
          className="ui-press-static shrink-0 w-14 rounded-xl flex flex-col items-center justify-center gap-0.5 py-2"
          title={idea.votedByMe ?"Убрать голос" :"Голосовать"}
        >
          <ThumbsUp size={16} strokeWidth={idea.votedByMe ? 2.25 : 1.75} fill={idea.votedByMe ? "currentColor" : "none"} />
          <span className="text-sm font-bold tabular-nums">{idea.voteCount}</span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div style={{ color:"#232323" }} className="font-semibold text-base leading-snug">{idea.title}</div>
              <div style={{ color:"#8B8FA0" }} className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1"><Avatar name={idea.authorName} size={16} />{idea.authorName}</span>
                {!isOpen && (
                  <span style={{ background:"#2E8B8B22", color:"#2E8B8B" }} className="rounded-full px-2 py-0.5 font-semibold">
                    В календаре
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isAuthor && isOpen && (
                <button onClick={onDelete} disabled={busy} style={{ color:"#D8635B" }} className="ui-press-static ui-hit p-1.5 rounded-lg hover:bg-red-50" title="Удалить" aria-label="Удалить">
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
              <button onClick={() => setExpanded((v) => !v)} style={{ color:"#8B8FA0" }} className="ui-press-static ui-hit p-1.5 rounded-lg hover:bg-black/5" aria-label={expanded ? "Свернуть" : "Развернуть"}>
                <span className="icon-swap size-4">
                  <span className={`is-abs ${expanded ? "is-on" : "is-off"}`}><ChevronUp size={16} strokeWidth={1.75} /></span>
                  <span className={expanded ? "is-off" : "is-on"}><ChevronDown size={16} strokeWidth={1.75} /></span>
                </span>
              </button>
            </div>
          </div>

          {idea.description && (
            <p style={{ color:"#3f4351" }} className="text-sm mt-2">{idea.description}</p>
          )}

          {idea.voters?.length > 0 && (
            <p style={{ color:"#8B8FA0" }} className="text-xs mt-2">
              За идею: {idea.voters.join(",")}
            </p>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ borderColor:"#DCD4C0" }} className="border-t mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div style={{ color:"#8B8FA0" }} className="text-xs uppercase tracking-widest">
              Варианты дат · {idea.dates?.length || 0}
            </div>
            {isOpen && (
              <button
                onClick={() => setShowDateForm((v) => !v)}
                style={{ color:"#2E8B8B" }}
                className="ui-press-static text-xs font-semibold flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-teal-50"
              >
                <Plus size={12} /> Предложить дату
              </button>
            )}
          </div>

          {showDateForm && isOpen && (
            <AddDateForm
              busy={busy}
              onCancel={() => setShowDateForm(false)}
              onAdd={async (payload) => {
                await onAddDate(payload);
                setShowDateForm(false);
              }}
            />
          )}

          {(idea.dates || []).length === 0 ? (
            <p style={{ color:"#8B8FA0" }} className="text-sm py-2">Пока нет вариантов дат.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {idea.dates.map((d) => {
                const range = formatTimeRange(d.time, d.endTime);
                return (
                  <div
                    key={d.id}
                    style={{ border:"1px solid #DCD4C0", background: d.votedByMe ?"#E8A33D14" :"#F7F3EA66" }}
                    className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                  >
                    <button
                      onClick={() => isOpen && onVoteDate(d.id)}
                      disabled={!isOpen || busy}
                      style={{
                        background: d.votedByMe ?"#2E8B8B" :"#F0EBE0",
                        color: d.votedByMe ?"#F7F3EA" :"#232323",
                        opacity: isOpen ? 1 : 0.7,
                      }}
                      className="ui-press-static shrink-0 min-w-10 rounded-lg px-2 py-1.5 text-xs font-bold flex items-center justify-center gap-1"
                      title="Голос за эту дату"
                    >
                      <ThumbsUp size={12} />
                      <span className="tabular-nums">{d.voteCount}</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div style={{ color:"#232323" }} className="text-sm font-medium">
                        {formatDateRu(d.date)}
                        {range ? ` · ${range}` :""}
                      </div>
                      <div style={{ color:"#8B8FA0" }} className="text-[11px] truncate">
                        предложил(а) {d.proposedByName}
                        {d.voters?.length ? ` · ${d.voters.join(", ")}` :""}
                      </div>
                    </div>
                    {isOpen && (
                      <button
                        onClick={() => onSchedule(d.id)}
                        disabled={busy}
                        style={{ background:"#232323", color:"#F7F3EA" }}
                        className="ui-press-static shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1"
                        title="Создать встречу на эту дату"
                      >
                        <Check size={12} /> В календарь
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddDateForm({ onAdd, onCancel, busy }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [localError, setLocalError] = useState(null);

  async function submit() {
    if (!date) return;
    if (time && endTime && endTime < time) {
      setLocalError("Время окончания раньше начала");
      return;
    }
    setLocalError(null);
    await onAdd({ date, time, endTime });
  }

  return (
    <div style={{ background:"#F7F3EA", borderRadius: 14 }} className="p-3 mb-3">
      <DateField label="Дата" value={date} onChange={setDate} />
      <div className="grid grid-cols-2 gap-2">
        <TimeField label="Начало" value={time} onChange={setTime} placeholder="—" />
        <TimeField label="Окончание" value={endTime} onChange={setEndTime} placeholder="—" />
      </div>
      {localError && <div style={{ color:"#D8635B" }} className="text-xs mb-2">{localError}</div>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!date || busy}
          style={{ background: date && !busy ?"#2E8B8B" :"#DCD4C0", color: date && !busy ?"#F7F3EA" :"#1B1F2A" }}
          className="flex-1 rounded-xl py-2 text-sm font-semibold flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="animate-spin" size={14} />}
          Добавить вариант
        </button>
        <button onClick={onCancel} style={{ color:"#8B8FA0" }} className="text-sm px-3">Отмена</button>
      </div>
    </div>
  );
}
