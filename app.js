"use strict";

/* ============================================================
   Жизнь в балансе — трекер привычек с облачной синхронизацией.
   Хранилище: Supabase (Postgres). Ключи берутся из config.js.
   Локальный localStorage — только резервный кеш на случай офлайна.
   ============================================================ */

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const LS_ACTIONS = "lifechecker_actions_v2";
const LS_RECORDS = "lifechecker_records_v2";
const LS_THEME = "lifechecker_theme";

/* ---------- Категории ---------- */
const CATEGORIES = [
  { id: "sleep",        label: "Сон",            icon: "🌙", color: "#7c8cf8" },
  { id: "nutrition",    label: "Питание",        icon: "🥗", color: "#5bc08a" },
  { id: "activity",     label: "Активность",     icon: "🏃", color: "#f7a15b" },
  { id: "mind",         label: "Разум",          icon: "🧠", color: "#b78bf0" },
  { id: "productivity", label: "Продуктивность", icon: "🎯", color: "#4db6d6" },
  { id: "rest",         label: "Отдых и быт",    icon: "🧘", color: "#e66a8e" },
];

const catMeta = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

/* ---------- Действия по умолчанию (id назначает база) ---------- */
function defaultActions() {
  return [
    { title: "Сон 7–9 часов",                    weight: 20, category: "sleep",        icon: "🌙" },
    { title: "Лёг спать до 23:30",               weight: 15, category: "sleep",        icon: "🛏️" },
    { title: "Подъём бодрым, без «досыпания»",   weight: 10, category: "sleep",        icon: "🌅" },
    { title: "Стакан воды после пробуждения",    weight: 5,  category: "nutrition",    icon: "💧" },
    { title: "Водный баланс 2 л за день",        weight: 10, category: "nutrition",    icon: "🚰" },
    { title: "Полноценный завтрак",              weight: 10, category: "nutrition",    icon: "🍳" },
    { title: "Овощи и фрукты (5 порций)",        weight: 10, category: "nutrition",    icon: "🥦" },
    { title: "Без сахара и фастфуда",            weight: 15, category: "nutrition",    icon: "🚫" },
    { title: "Зарядка / разминка",               weight: 10, category: "activity",     icon: "🤸" },
    { title: "Тренировка 30+ минут",             weight: 25, category: "activity",     icon: "🏋️" },
    { title: "Прогулка на свежем воздухе",       weight: 15, category: "activity",     icon: "🚶" },
    { title: "Медитация / дыхание 10 минут",     weight: 15, category: "mind",         icon: "🧘" },
    { title: "Чтение 30 минут",                  weight: 15, category: "mind",         icon: "📚" },
    { title: "Планирование дня",                 weight: 15, category: "mind",         icon: "📝" },
    { title: "Рефлексия / дневник",              weight: 10, category: "mind",         icon: "✍️" },
    { title: "Глубокая работа без отвлечений",   weight: 25, category: "productivity", icon: "🎯" },
    { title: "Выполнены 3 главные задачи",       weight: 20, category: "productivity", icon: "✅" },
    { title: "Цифровой детокс (соцсети < 1 ч)",  weight: 15, category: "productivity", icon: "📵" },
    { title: "Время с близкими",                 weight: 15, category: "rest",         icon: "👨‍👩‍👧" },
    { title: "Отдых / любимое хобби",            weight: 15, category: "rest",         icon: "🎨" },
    { title: "Уборка и порядок",                 weight: 10, category: "rest",         icon: "🧹" },
    { title: "Растяжка / уход перед сном",       weight: 10, category: "rest",         icon: "🧖" },
  ];
}

/* ---------- Состояние ---------- */
let sb = null;
let currentSession = null;

let actions = [];       // [{ id, title, weight, category, icon, pos }]
let records = {};       // { "YYYY-MM-DD": [actionId, ...] }
let chartRange = 14;
let editingId = null;

/* ---------- Утилиты ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveCache() {
  try {
    localStorage.setItem(LS_ACTIONS, JSON.stringify(actions));
    localStorage.setItem(LS_RECORDS, JSON.stringify(records));
  } catch (e) { /* ignore */ }
}

function loadCache() {
  actions = loadJSON(LS_ACTIONS, []);
  records = loadJSON(LS_RECORDS, {});
}

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateRu(d) {
  return d.toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtKeyRu(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function maxPoints() {
  return actions.reduce((s, a) => s + a.weight, 0);
}

function scoreFor(key) {
  const done = records[key] || [];
  const weights = new Map(actions.map((a) => [a.id, a.weight]));
  return done.reduce((s, id) => s + (weights.get(id) || 0), 0);
}

function computeStreak() {
  let streak = 0;
  const d = new Date();
  if (scoreFor(dateKey(d)) === 0) d.setDate(d.getDate() - 1);
  let guard = 0;
  while (guard++ < 5000) {
    if (scoreFor(dateKey(d)) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

/* ---------- UI: показ/скрытие ---------- */
function showLoading(on) {
  document.getElementById("loading").hidden = !on;
}
function showAuth() {
  document.getElementById("app").hidden = true;
  document.getElementById("authScreen").hidden = false;
}
function showApp() {
  document.getElementById("authScreen").hidden = true;
  document.getElementById("app").hidden = false;
}

function showAuthMsg(kind, text) {
  const el = document.getElementById("authMessage");
  el.hidden = false;
  el.className = "auth-message " + (kind === "ok" ? "ok" : "err");
  el.textContent = text;
}

/* ---------- Тема ---------- */
function applyTheme() {
  const saved = localStorage.getItem(LS_THEME) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").textContent = saved === "dark" ? "☀️" : "🌙";
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  localStorage.setItem(LS_THEME, next);
  applyTheme();
}

/* ---------- Аутентификация (magic link) ---------- */
async function initAuth() {
  if (!window.supabase || !window.supabase.createClient || !SUPABASE_URL ||
      !SUPABASE_ANON_KEY || SUPABASE_URL.includes("XXXX")) {
    document.getElementById("authScreen").hidden = false;
    document.getElementById("authForm").hidden = true;
    showAuthMsg("err", "Приложение не настроено: заполните SUPABASE_URL и SUPABASE_ANON_KEY в файле config.js");
    return;
  }

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await sb.auth.getSession();
  if (error) showAuthMsg("err", "Ошибка входа: " + error.message);
  currentSession = data.session;

  sb.auth.onAuthStateChange((event, newSession) => {
    currentSession = newSession;
    if (newSession) {
      showApp();
      loadData();
    } else {
      actions = [];
      records = {};
      showAuth();
    }
  });

  if (currentSession) {
    showApp();
    await loadData();
  } else {
    showAuth();
  }
}

async function onAuthFormSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const btn = document.getElementById("authSubmit");
  if (!email || !sb) return;

  btn.disabled = true;
  btn.textContent = "Отправляю…";
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  btn.disabled = false;
  btn.textContent = "Получить ссылку для входа";

  if (error) showAuthMsg("err", "Ошибка: " + error.message);
  else showAuthMsg("ok", "Ссылка отправлена на " + email + ". Откройте её, чтобы войти.");
}

async function signOut() {
  if (sb) await sb.auth.signOut();
}

/* ---------- Загрузка данных из Supabase ---------- */
async function loadData() {
  showLoading(true);
  try {
    const [aRes, rRes] = await Promise.all([
      sb.from("actions").select("*").order("pos", { ascending: true }).order("created_at", { ascending: true }),
      sb.from("records").select("*"),
    ]);
    if (aRes.error) throw aRes.error;
    if (rRes.error) throw rRes.error;

    if (aRes.data.length === 0) {
      // первый вход: создаём набор по умолчанию
      const seeded = defaultActions().map((d, i) => ({ ...d, pos: i, user_id: currentSession.user.id }));
      const ins = await sb.from("actions").insert(seeded).select();
      if (ins.error) throw ins.error;
      actions = ins.data;
    } else {
      actions = aRes.data;
    }

    records = {};
    rRes.data.forEach((r) => { records[r.date] = Array.isArray(r.done) ? r.done : []; });

    saveCache();
  } catch (err) {
    console.warn("Не удалось загрузить из облака, использую локальный кеш:", err && err.message);
    loadCache();
  }
  showLoading(false);
  renderAll();
}

/* ---------- Изменение отметки ---------- */
async function toggleAction(id, checked) {
  const today = dateKey();
  let done = Array.isArray(records[today]) ? records[today].slice() : [];
  if (checked) { if (!done.includes(id)) done.push(id); }
  else { done = done.filter((x) => x !== id); }
  records[today] = done;

  renderToday(); renderStats(); renderChart();
  saveCache();

  if (sb && currentSession) {
    const { error } = await sb.from("records").upsert(
      { user_id: currentSession.user.id, date: today, done },
      { onConflict: "user_id,date" }
    );
    if (error) console.warn("Не удалось сохранить отметку:", error.message);
  }
}

/* ---------- Рендер: сегодня ---------- */
function renderToday() {
  const d = new Date();
  document.getElementById("todayDate").textContent = formatDateRu(d);

  const max = maxPoints();
  const earned = scoreFor(dateKey());
  const done = records[dateKey()] || [];
  const doneCount = done.length;
  const pct = max > 0 ? earned / max : 0;

  document.getElementById("todayPoints").textContent = earned;
  document.getElementById("todayMax").textContent = max;
  document.getElementById("doneLine").textContent = `${doneCount} из ${actions.length} действий`;

  const C = 326.73;
  const ring = document.getElementById("ringFg");
  ring.style.strokeDashoffset = String(C * (1 - pct));
  ring.style.stroke = pct >= 0.8 ? "var(--good)" : pct >= 0.5 ? "var(--mid)" : "var(--accent)";
  document.getElementById("ringPct").textContent = Math.round(pct * 100) + "%";

  const grade = document.getElementById("gradeBadge");
  grade.className = "grade";
  if (doneCount === 0) {
    grade.textContent = "—";
  } else if (pct >= 0.8) {
    grade.textContent = "A"; grade.classList.add("good");
  } else if (pct >= 0.6) {
    grade.textContent = "B"; grade.classList.add("good");
  } else if (pct >= 0.4) {
    grade.textContent = "C"; grade.classList.add("mid");
  } else {
    grade.textContent = "D"; grade.classList.add("bad");
  }

  document.getElementById("streakBadge").textContent = computeStreak();
}

function renderStats() {
  const keys = Object.keys(records).filter((k) => scoreFor(k) > 0);
  const total = keys.reduce((s, k) => s + scoreFor(k), 0);
  const avg = keys.length ? Math.round(total / keys.length) : 0;

  let best = 0, bestKey = null;
  keys.forEach((k) => {
    const sc = scoreFor(k);
    if (sc > best) { best = sc; bestKey = k; }
  });

  const cards = [
    { label: "🔥 Серия", value: computeStreak(), sub: "дней подряд" },
    { label: "🏆 Лучший день", value: best, sub: bestKey ? fmtKeyRu(bestKey) : "ещё нет данных" },
    { label: "📊 Всего баллов", value: total, sub: `за ${keys.length} активных дней` },
    { label: "📈 Средний балл", value: avg, sub: "за активный день" },
  ];

  document.getElementById("statsGrid").innerHTML = cards
    .map((c) => `
      <div class="stat-card">
        <span class="stat-label">${c.label}</span>
        <span class="stat-value">${c.value}</span>
        <span class="stat-sub">${c.sub}</span>
      </div>`)
    .join("");
}

/* ---------- Рендер: чек-лист ---------- */
function renderChecklist() {
  const doneSet = new Set(records[dateKey()] || []);
  const wrap = document.getElementById("checklist");

  if (actions.length === 0) {
    wrap.innerHTML = `<div class="empty">Действий пока нет — добавьте первое ниже.</div>`;
    return;
  }

  wrap.innerHTML = CATEGORIES.map((cat) => {
    const items = actions.filter((a) => a.category === cat.id);
    if (items.length === 0) return "";
    const rows = items.map((a) => {
      const checked = doneSet.has(a.id);
      return `
        <label class="item ${checked ? "done" : ""}" data-id="${a.id}">
          <input type="checkbox" ${checked ? "checked" : ""} data-id="${a.id}" />
          <span class="checkbox"></span>
          <span class="icon">${a.icon || "✅"}</span>
          <span class="title">${escapeHtml(a.title)}</span>
          <span class="weight">+${a.weight}</span>
        </label>`;
    }).join("");
    return `
      <div class="cat-group">
        <div class="cat-head">
          <span class="cat-dot" style="background:${cat.color}"></span>
          <span>${cat.icon} ${cat.label}</span>
        </div>
        ${rows}
      </div>`;
  }).join("");
}

/* ---------- Рендер: график ---------- */
function renderChart() {
  const wrap = document.getElementById("chart");
  const axis = document.getElementById("chartAxis");
  const max = maxPoints() || 1;
  const days = [];
  for (let i = chartRange - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: dateKey(d), date: d });
  }

  wrap.innerHTML = days.map(({ key, date }) => {
    const sc = scoreFor(key);
    const pct = Math.min(1, sc / max);
    const height = Math.round(pct * 150);
    const isToday = key === dateKey();
    const color = pct >= 0.8 ? "var(--good)" : pct >= 0.5 ? "var(--mid)" : "var(--accent)";
    const label = date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
    const full = formatDateRu(date);
    return `
      <div class="bar-col ${isToday ? "today" : ""}" title="${full}: ${sc} из ${max} баллов">
        <div class="bar-track">
          <div class="bar" style="height:${height}px; background:${color}"></div>
        </div>
        <span class="bar-label">${label}</span>
      </div>`;
  }).join("");

  axis.innerHTML = `
    <span>${fmtKeyRu(days[0].key)}</span>
    <span>${fmtKeyRu(days[days.length - 1].key)}</span>`;
}

/* ---------- Рендер: список действий ---------- */
function renderActionsList() {
  const wrap = document.getElementById("actionsList");
  if (actions.length === 0) {
    wrap.innerHTML = `<div class="empty">Список пуст.</div>`;
    return;
  }
  wrap.innerHTML = actions.map((a) => {
    const cat = catMeta(a.category);
    return `
      <div class="action-row" data-id="${a.id}">
        <span class="icon">${a.icon || "✅"}</span>
        <span class="title">${escapeHtml(a.title)}</span>
        <span class="cat-tag" style="color:${cat.color}">${cat.icon} ${cat.label}</span>
        <span class="weight">${a.weight} пт</span>
        <button class="row-btn edit" data-id="${a.id}" title="Редактировать">✎</button>
        <button class="row-btn del" data-id="${a.id}" title="Удалить">🗑</button>
      </div>`;
  }).join("");
}

/* ---------- Модальное окно ---------- */
function fillCategorySelect(selected) {
  const sel = document.getElementById("fCategory");
  sel.innerHTML = CATEGORIES.map(
    (c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${c.icon} ${c.label}</option>`
  ).join("");
}

function openModal(action) {
  editingId = action ? action.id : null;
  document.getElementById("modalTitle").textContent = action ? "Редактировать действие" : "Добавить действие";
  document.getElementById("fTitle").value = action ? action.title : "";
  document.getElementById("fWeight").value = action ? action.weight : 10;
  document.getElementById("fIcon").value = action ? (action.icon || "") : "";
  fillCategorySelect(action ? action.category : "sleep");
  document.getElementById("modalBackdrop").hidden = false;
  document.getElementById("fTitle").focus();
}

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  editingId = null;
}

async function onFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("fTitle").value.trim();
  const weight = parseInt(document.getElementById("fWeight").value, 10);
  const category = document.getElementById("fCategory").value;
  const icon = document.getElementById("fIcon").value.trim() || "✅";

  if (!title) return;
  showLoading(true);

  if (editingId) {
    const { error } = await sb.from("actions").update({ title, weight, category, icon }).eq("id", editingId);
    if (error) {
      alert("Не удалось сохранить: " + error.message);
      showLoading(false);
      return;
    }
    const a = actions.find((x) => x.id === editingId);
    if (a) Object.assign(a, { title, weight, category, icon });
  } else {
    const { data, error } = await sb.from("actions")
      .insert({ user_id: currentSession.user.id, title, weight, category, icon, pos: actions.length })
      .select().single();
    if (error) {
      alert("Не удалось добавить: " + error.message);
      showLoading(false);
      return;
    }
    actions.push(data);
  }

  saveCache();
  showLoading(false);
  closeModal();
  renderAll();
}

async function deleteAction(id) {
  const a = actions.find((x) => x.id === id);
  if (!a) return;
  if (!confirm(`Удалить действие «${a.title}»?`)) return;

  showLoading(true);
  const { error } = await sb.from("actions").delete().eq("id", id);
  if (error) {
    alert("Не удалось удалить: " + error.message);
    showLoading(false);
    return;
  }
  actions = actions.filter((x) => x.id !== id);
  saveCache();
  showLoading(false);
  renderAll();
}

async function restoreDefaults() {
  if (!confirm("Заменить текущий список действий на набор по умолчанию? Отметки сохранятся.")) return;
  showLoading(true);
  try {
    await sb.from("actions").delete().eq("user_id", currentSession.user.id);
    const seeded = defaultActions().map((d, i) => ({ ...d, pos: i, user_id: currentSession.user.id }));
    const ins = await sb.from("actions").insert(seeded).select();
    if (ins.error) throw ins.error;
    actions = ins.data;
    saveCache();
  } catch (err) {
    alert("Не удалось восстановить: " + (err && err.message ? err.message : err));
  }
  showLoading(false);
  renderAll();
}

async function resetToday() {
  const today = dateKey();
  if (!(records[today] && records[today].length)) return;
  if (!confirm("Сбросить все отметки за сегодня?")) return;

  records[today] = [];
  renderToday(); renderStats(); renderChart();
  saveCache();
  await sb.from("records").upsert(
    { user_id: currentSession.user.id, date: today, done: [] },
    { onConflict: "user_id,date" }
  );
}

/* ---------- Экспорт / импорт / очистка ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ actions, records }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `life-tracker-${dateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try {
      data = JSON.parse(reader.result);
      if (!Array.isArray(data.actions) || typeof data.records !== "object") throw new Error("bad format");
    } catch (err) {
      alert("Не удалось прочитать файл: неверный формат.");
      return;
    }
    if (!confirm("Импорт заменит текущие действия и записи в облаке. Продолжить?")) return;

    showLoading(true);
    try {
      // 1) заменяем действия, сохраняя соответствие старых id новым
      await sb.from("actions").delete().eq("user_id", currentSession.user.id);
      const idMap = {};
      const newActions = [];
      for (let i = 0; i < data.actions.length; i++) {
        const a = data.actions[i];
        const { data: row, error } = await sb.from("actions")
          .insert({ user_id: currentSession.user.id, title: a.title, weight: a.weight, category: a.category, icon: a.icon || "", pos: i })
          .select().single();
        if (error) throw error;
        idMap[String(a.id)] = row.id;
        newActions.push(row);
      }
      actions = newActions;

      // 2) заменяем записи, пересчитывая id действий
      await sb.from("records").delete().eq("user_id", currentSession.user.id);
      records = {};
      const recs = [];
      Object.keys(data.records).forEach((date) => {
        const done = (Array.isArray(data.records[date]) ? data.records[date] : [])
          .map((id) => idMap[String(id)])
          .filter(Boolean);
        records[date] = done;
        recs.push({ user_id: currentSession.user.id, date, done });
      });
      if (recs.length) {
        const insR = await sb.from("records").insert(recs);
        if (insR.error) throw insR.error;
      }

      saveCache();
    } catch (err) {
      alert("Не удалось импортировать: " + (err && err.message ? err.message : err));
    }
    showLoading(false);
    renderAll();
  };
  reader.readAsText(file);
}

async function wipeData() {
  if (!confirm("Удалить ВСЕ данные (действия и всю историю)? Это действие необратимо.")) return;
  showLoading(true);
  try {
    await sb.from("actions").delete().eq("user_id", currentSession.user.id);
    await sb.from("records").delete().eq("user_id", currentSession.user.id);
    actions = [];
    records = {};
    saveCache();
    await loadData(); // пересоздаст набор по умолчанию
  } catch (err) {
    alert("Не удалось очистить: " + (err && err.message ? err.message : err));
    showLoading(false);
  }
}

/* ---------- Главный рендер ---------- */
function renderAll() {
  renderToday();
  renderStats();
  renderChecklist();
  renderChart();
  renderActionsList();
}

/* ---------- Инициализация ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  initAuth();

  document.getElementById("authForm").addEventListener("submit", onAuthFormSubmit);
  document.getElementById("signOut").addEventListener("click", signOut);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  document.getElementById("checklist").addEventListener("change", (e) => {
    const input = e.target.closest("input[type=checkbox][data-id]");
    if (!input) return;
    const id = input.dataset.id;
    input.closest(".item").classList.toggle("done", input.checked);
    toggleAction(id, input.checked);
  });

  document.getElementById("actionsList").addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit[data-id]");
    const delBtn = e.target.closest(".del[data-id]");
    if (editBtn) {
      const a = actions.find((x) => x.id === editBtn.dataset.id);
      if (a) openModal(a);
    } else if (delBtn) {
      deleteAction(delBtn.dataset.id);
    }
  });

  document.getElementById("actionForm").addEventListener("submit", onFormSubmit);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById("addAction").addEventListener("click", () => openModal(null));
  document.getElementById("restoreDefaults").addEventListener("click", restoreDefaults);
  document.getElementById("resetToday").addEventListener("click", resetToday);

  document.getElementById("rangeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    chartRange = parseInt(btn.dataset.range, 10);
    document.querySelectorAll("#rangeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderChart();
  });

  document.getElementById("exportData").addEventListener("click", exportData);
  document.getElementById("importData").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("wipeData").addEventListener("click", wipeData);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("modalBackdrop").hidden) closeModal();
  });
});
