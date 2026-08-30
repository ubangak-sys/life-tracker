"use strict";

/* ============================================================
   Жизнь в балансе — локальный трекер привычек
   Данные хранятся в localStorage браузера.
   ============================================================ */

const LS_ACTIONS = "lifechecker_actions_v1";
const LS_RECORDS = "lifechecker_records_v1";
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

/* ---------- Действия по умолчанию ---------- */
function defaultActions() {
  return [
    { id: "s1", title: "Сон 7–9 часов",                    weight: 20, category: "sleep",        icon: "🌙" },
    { id: "s2", title: "Лёг спать до 23:30",               weight: 15, category: "sleep",        icon: "🛏️" },
    { id: "s3", title: "Подъём бодрым, без «досыпания»",   weight: 10, category: "sleep",        icon: "🌅" },
    { id: "n1", title: "Стакан воды после пробуждения",    weight: 5,  category: "nutrition",    icon: "💧" },
    { id: "n2", title: "Водный баланс 2 л за день",        weight: 10, category: "nutrition",    icon: "🚰" },
    { id: "n3", title: "Полноценный завтрак",              weight: 10, category: "nutrition",    icon: "🍳" },
    { id: "n4", title: "Овощи и фрукты (5 порций)",        weight: 10, category: "nutrition",    icon: "🥦" },
    { id: "n5", title: "Без сахара и фастфуда",            weight: 15, category: "nutrition",    icon: "🚫" },
    { id: "a1", title: "Зарядка / разминка",               weight: 10, category: "activity",     icon: "🤸" },
    { id: "a2", title: "Тренировка 30+ минут",             weight: 25, category: "activity",     icon: "🏋️" },
    { id: "a3", title: "Прогулка на свежем воздухе",       weight: 15, category: "activity",     icon: "🚶" },
    { id: "m1", title: "Медитация / дыхание 10 минут",     weight: 15, category: "mind",         icon: "🧘" },
    { id: "m2", title: "Чтение 30 минут",                  weight: 15, category: "mind",         icon: "📚" },
    { id: "m3", title: "Планирование дня",                 weight: 15, category: "mind",         icon: "📝" },
    { id: "m4", title: "Рефлексия / дневник",              weight: 10, category: "mind",         icon: "✍️" },
    { id: "p1", title: "Глубокая работа без отвлечений",   weight: 25, category: "productivity", icon: "🎯" },
    { id: "p2", title: "Выполнены 3 главные задачи",       weight: 20, category: "productivity", icon: "✅" },
    { id: "p3", title: "Цифровой детокс (соцсети < 1 ч)",  weight: 15, category: "productivity", icon: "📵" },
    { id: "r1", title: "Время с близкими",                 weight: 15, category: "rest",         icon: "👨‍👩‍👧" },
    { id: "r2", title: "Отдых / любимое хобби",            weight: 15, category: "rest",         icon: "🎨" },
    { id: "r3", title: "Уборка и порядок",                 weight: 10, category: "rest",         icon: "🧹" },
    { id: "r4", title: "Растяжка / уход перед сном",       weight: 10, category: "rest",         icon: "🧖" },
  ];
}

/* ---------- Состояние ---------- */
let actions = loadJSON(LS_ACTIONS, defaultActions());
let records = loadJSON(LS_RECORDS, {});

let editingId = null;       // id редактируемого действия (или null для нового)
let chartRange = 14;        // сколько дней показывать на графике

/* ---------- Утилиты ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function save() {
  localStorage.setItem(LS_ACTIONS, JSON.stringify(actions));
  localStorage.setItem(LS_RECORDS, JSON.stringify(records));
}

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateRu(d) {
  return d.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function todayRecord() {
  const k = dateKey();
  if (!records[k]) records[k] = { done: [] };
  return records[k];
}

function maxPoints() {
  return actions.reduce((s, a) => s + a.weight, 0);
}

function scoreFor(key) {
  const rec = records[key];
  if (!rec || !rec.done) return 0;
  const weights = new Map(actions.map((a) => [a.id, a.weight]));
  return rec.done.reduce((s, id) => s + (weights.get(id) || 0), 0);
}

function uid() {
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Рендер: шапка / сегодня ---------- */
function renderToday() {
  const d = new Date();
  document.getElementById("todayDate").textContent = formatDateRu(d);

  const rec = todayRecord();
  const max = maxPoints();
  const earned = scoreFor(dateKey());
  const doneCount = rec.done.length;
  const pct = max > 0 ? earned / max : 0;

  document.getElementById("todayPoints").textContent = earned;
  document.getElementById("todayMax").textContent = max;
  document.getElementById("doneLine").textContent =
    `${doneCount} из ${actions.length} действий`;

  // кольцо прогресса
  const C = 326.73;
  const ring = document.getElementById("ringFg");
  ring.style.strokeDashoffset = String(C * (1 - pct));
  ring.style.stroke = pct >= 0.8 ? "var(--good)" : pct >= 0.5 ? "var(--mid)" : "var(--accent)";
  document.getElementById("ringPct").textContent = Math.round(pct * 100) + "%";

  // оценка за день
  const grade = document.getElementById("gradeBadge");
  grade.className = "grade";
  if (doneCount === 0) {
    grade.textContent = "—";
  } else if (pct >= 0.8) {
    grade.textContent = "A";
    grade.classList.add("good");
  } else if (pct >= 0.6) {
    grade.textContent = "B";
    grade.classList.add("good");
  } else if (pct >= 0.4) {
    grade.textContent = "C";
    grade.classList.add("mid");
  } else {
    grade.textContent = "D";
    grade.classList.add("bad");
  }

  document.getElementById("streakBadge").textContent = computeStreak();
}

function computeStreak() {
  let streak = 0;
  const d = new Date();
  // если сегодня ещё ничего не отмечено — считаем серию со вчерашнего дня
  if (scoreFor(dateKey(d)) === 0) {
    d.setDate(d.getDate() - 1);
  }
  let guard = 0;
  while (guard++ < 5000) {
    const k = dateKey(d);
    if (scoreFor(k) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
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
    .map(
      (c) => `
      <div class="stat-card">
        <span class="stat-label">${c.label}</span>
        <span class="stat-value">${c.value}</span>
        <span class="stat-sub">${c.sub}</span>
      </div>`
    )
    .join("");
}

function fmtKeyRu(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/* ---------- Рендер: чек-лист ---------- */
function renderChecklist() {
  const rec = todayRecord();
  const doneSet = new Set(rec.done);
  const wrap = document.getElementById("checklist");

  if (actions.length === 0) {
    wrap.innerHTML = `<div class="empty">Действий пока нет — добавьте первое ниже.</div>`;
    return;
  }

  wrap.innerHTML = CATEGORIES.map((cat) => {
    const items = actions.filter((a) => a.category === cat.id);
    if (items.length === 0) return "";
    const rows = items
      .map((a) => {
        const checked = doneSet.has(a.id);
        return `
        <label class="item ${checked ? "done" : ""}" data-id="${a.id}">
          <input type="checkbox" ${checked ? "checked" : ""} data-id="${a.id}" />
          <span class="checkbox"></span>
          <span class="icon">${a.icon || "✅"}</span>
          <span class="title">${escapeHtml(a.title)}</span>
          <span class="weight">+${a.weight}</span>
        </label>`;
      })
      .join("");
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  wrap.innerHTML = days
    .map(({ key, date }) => {
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
    })
    .join("");

  axis.innerHTML = `
    <span>${fmtKeyRu(days[0].key)}</span>
    <span>${fmtKeyRu(days[days.length - 1].key)}</span>`;
}

/* ---------- Рендер: список действий (управление) ---------- */
function renderActionsList() {
  const wrap = document.getElementById("actionsList");
  if (actions.length === 0) {
    wrap.innerHTML = `<div class="empty">Список пуст.</div>`;
    return;
  }
  wrap.innerHTML = actions
    .map((a) => {
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
    })
    .join("");
}

/* ---------- События чек-листа ---------- */
function onChecklistChange(e) {
  const input = e.target.closest("input[type=checkbox][data-id]");
  if (!input) return;
  const id = input.dataset.id;
  const rec = todayRecord();
  if (input.checked) {
    if (!rec.done.includes(id)) rec.done.push(id);
  } else {
    rec.done = rec.done.filter((x) => x !== id);
  }
  save();
  renderToday();
  renderStats();
  renderChart();
  // обновляем только визуальное состояние текущей строки
  input.closest(".item").classList.toggle("done", input.checked);
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
  document.getElementById("modalTitle").textContent = action
    ? "Редактировать действие"
    : "Добавить действие";
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

function onFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("fTitle").value.trim();
  const weight = parseInt(document.getElementById("fWeight").value, 10);
  const category = document.getElementById("fCategory").value;
  const icon = document.getElementById("fIcon").value.trim() || "✅";

  if (!title) return;

  if (editingId) {
    const a = actions.find((x) => x.id === editingId);
    if (a) Object.assign(a, { title, weight, category, icon });
  } else {
    actions.push({ id: uid(), title, weight, category, icon });
  }

  save();
  closeModal();
  renderAll();
}

/* ---------- Управление действиями ---------- */
function onActionsListClick(e) {
  const editBtn = e.target.closest(".edit[data-id]");
  const delBtn = e.target.closest(".del[data-id]");
  if (editBtn) {
    const a = actions.find((x) => x.id === editBtn.dataset.id);
    if (a) openModal(a);
  } else if (delBtn) {
    const a = actions.find((x) => x.id === delBtn.dataset.id);
    if (a && confirm(`Удалить действие «${a.title}»?`)) {
      actions = actions.filter((x) => x.id !== a.id);
      // убрать из всех записей дня
      Object.values(records).forEach((r) => {
        if (r.done) r.done = r.done.filter((id) => id !== a.id);
      });
      save();
      renderAll();
    }
  }
}

function restoreDefaults() {
  if (!confirm("Заменить текущий список действий на набор по умолчанию? Ваши отметки за прошлые дни сохранятся.")) return;
  actions = defaultActions();
  save();
  renderAll();
}

/* ---------- Данные: экспорт / импорт / очистка ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ actions, records }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `life-tracker-${dateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.actions) || typeof data.records !== "object") {
        throw new Error("bad format");
      }
      if (!confirm("Импорт заменит текущие действия и записи. Продолжить?")) return;
      actions = data.actions;
      records = data.records;
      save();
      renderAll();
    } catch (err) {
      alert("Не удалось прочитать файл: неверный формат.");
    }
  };
  reader.readAsText(file);
}

function wipeData() {
  if (!confirm("Удалить ВСЕ данные (действия и всю историю)? Это действие необратимо.")) return;
  localStorage.removeItem(LS_ACTIONS);
  localStorage.removeItem(LS_RECORDS);
  actions = defaultActions();
  records = {};
  save();
  renderAll();
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
  renderAll();

  document.getElementById("checklist").addEventListener("change", onChecklistChange);
  document.getElementById("actionsList").addEventListener("click", onActionsListClick);
  document.getElementById("actionForm").addEventListener("submit", onFormSubmit);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById("addAction").addEventListener("click", () => openModal(null));
  document.getElementById("restoreDefaults").addEventListener("click", restoreDefaults);
  document.getElementById("resetToday").addEventListener("click", () => {
    const rec = todayRecord();
    if (rec.done.length === 0) return;
    if (confirm("Сбросить все отметки за сегодня?")) {
      rec.done = [];
      save();
      renderAll();
    }
  });

  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  document.getElementById("rangeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    chartRange = parseInt(btn.dataset.range, 10);
    document.querySelectorAll("#rangeToggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderChart();
  });

  document.getElementById("exportData").addEventListener("click", exportData);
  document.getElementById("importData").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("wipeData").addEventListener("click", wipeData);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("modalBackdrop").hidden) closeModal();
  });
});
