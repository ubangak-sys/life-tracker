# Настройка Supabase (облачная синхронизация)

Приложение хранит действия и отметки в облаке Supabase и синхронизирует их между устройствами.
Здесь — пошаговая настройка.

## 1. Создайте бесплатный проект

1. Откройте https://supabase.com/dashboard и войдите (удобно через **Continue with GitHub**).
2. Нажмите **New project**.
3. Заполните:
   - **Name:** `life-tracker`
   - **Database Password:** придумайте надёжный пароль (сохраните его, пригодится редко)
   - **Region:** ближайший к вам (например, `Central EU (Frankfurt)`)
4. Нажмите **Create new project** и подождите ~1–2 минуты, пока база поднимется.

## 2. Создайте таблицы (SQL)

1. В левом меню выберите **SQL Editor**.
2. Нажмите **New query** и вставьте скрипт ниже целиком.
3. Нажмите **Run** (или Ctrl+Enter).

```sql
-- Таблицы
create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  weight int not null default 10,
  category text not null,
  icon text,
  pos int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  done jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Безопасность: каждый видит только свои строки
alter table public.actions enable row level security;
alter table public.records enable row level security;

create policy "own_actions" on public.actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_records" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Проверка: в меню **Table Editor** должны появиться таблицы `actions` и `records`.

## 3. Настройте адрес для входа (redirect)

1. В левом меню: **Authentication → URL Configuration**.
2. **Site URL:** `https://ubangak-sys.github.io/life-tracker/`
3. В **Redirect URLs** нажмите **Add URL** и добавьте:
   - `https://ubangak-sys.github.io/life-tracker/`
   - `https://ubangak-sys.github.io/life-tracker/**`
4. Нажмите **Save**.

## 4. Получите ключи проекта

1. В левом меню: **Project Settings → API**.
2. Скопируйте два значения:
   - **Project URL** — вида `https://xxxx.supabase.co`
   - **anon public** ключ — длинная строка
3. Передайте эти два значения мне — я впишу их в `config.js` и опубликую обновление.

> Оба значения **публичные** и предназначены для использования в браузере. Данные защищены политиками RLS из шага 2 — каждый пользователь видит только свои записи.
