# AGENTS.md

本檔是給下一個 Codex/session 的交接紀錄。請先讀完這份，再看 `報告.md` 與 `git status --short`。

## 專案脈絡

- 專案位置：`C:\Users\user1\Desktop\NUU\BACKEND_W15_FOR_FINAL\bf1042`
- 使用者語言偏好：繁體中文。
- 技術棧：Bun + TypeScript + Elysia backend、React/Vite frontend、Drizzle ORM + Neon PostgreSQL、Better Auth + Google OAuth。
- 第十週講義：`bf1042-docs-hub/bf1042-docs-hub/00_teaching/05_1_V10_RBAC權限系統設計與實作講義.md`
- 驗收節奏：本機測試只是第一層；正式完成依據以使用者提供的 Render 部署、Render runtime、Neon migration、線上瀏覽器/API 驗證為準。

## 目前版本狀態

### 已完成且 Render 驗證成功

- `V10.1 基礎版本化`
  - `PG_SCHEMA=bf_v10`
  - `drizzle-v10/0000_v10_initial.sql`
  - 菜單品項使用版本 ID，例如 `001-01`、`001-02`
  - 訂單引用特定 `menu_items.id`
  - 舊版菜單不可加入購物車，舊購物車送出會回 `409`

- `V10.2 菜單管理與版本展示`
  - 登入後可新增、編輯、下架菜單
  - `GET /api/menu/:id/history`
  - 菜單卡片顯示 logical id、版本 badge、近期更新提示
  - 圖片 URL 預覽與錯誤提示已修正：失敗時顯示「圖片載入失敗」與原圖連結，不再讓使用者誤以為網址沒存

- `V10.3A RBAC 基礎`
  - `user.roles text[] not null default ARRAY['customer']`
  - `RBAC_ADMIN_EMAILS` 自動授予初始 admin
  - `GET /api/users/me`
  - 菜單 mutation 需要 `owner/admin`
  - `GET /api/orders` 需要 `staff/chef/owner/admin`
  - 前端依 roles 顯示或隱藏菜單管理 UI

- `V10.3B 角色申請與 Admin 審核`
  - `role_requests` table 與 migration：`drizzle-v10/0002_v10_role_requests.sql`
  - 使用者可申請 `staff/chef`
  - 同一使用者同時只能有一筆 pending 申請
  - admin 可核准或拒絕申請
  - 核准後角色會合併進目標使用者 roles，並保留 `customer`
  - 使用者已回報 admin 驗證、staff/chef 申請與核准機制皆已在 Render 驗證成功

### 本輪正在實作

- `V10.3C Admin 使用者角色管理`
  - 新增 `GET /api/admin/users`
  - 新增 `PATCH /api/admin/users/:userId/roles`
  - admin 可查看所有使用者與 roles
  - admin 可直接分配或移除 `customer | staff | chef | owner | admin`
  - 後端永遠保留 `customer`
  - 禁止 admin 移除自己的 `admin` role，避免把自己鎖出後台
  - 前端新增 admin-only「使用者角色管理」卡片
  - 本輪不新增 migration，沿用 V10.3A 的 `user.roles`

## 重要檔案

- Backend/API：`backend.ts`
- Auth schema：`db/auth-schema.ts`
- App schema：`db/schema.ts`
- Menu repository：`db/repositories/menuRepository.ts`
- Store abstraction：`store/Store.ts`
- PostgreSQL store：`store/pg/PgStore.ts`
- JSON fallback store：`store/json/JsonFileStore.ts`
- Contracts：`shared/contracts.ts`
- Route schemas：`shared/route-schemas.ts`
- RBAC guards：`shared/guards.ts`
- Frontend：`frontend/src/App.tsx`
- V10 migrations：`drizzle-v10/`
- Render startup：`scripts/start.ts`
- Migration runner：`scripts/run-migration.ts`
- Tests：`tests/v10-menu-versioning.test.ts`、`tests/v10-rbac.test.ts`、`tests/v10-role-requests.test.ts`、`tests/v10-admin-users.test.ts`
- 報告：`報告.md`

Legacy `drizzle/` 是 V8/V9 migration，不要拿來當 V10 migration 來源。

## 本機驗證命令

V10.3C 本輪完成後建議跑：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts
git diff --check
```

注意：不要跑全 repo `bunx tsc --noEmit` 當作主要檢核，因為 repo 內有歷史教材備份檔，常引用舊 contracts 或舊 auth。

## Render 驗證清單

V10.3C push 後請使用者在線上確認：

- admin 登入後看到「使用者角色管理」區塊
- `GET /api/admin/users` 只有 admin 可成功
- admin 可把一般使用者加上 `owner`
- 該使用者重新整理或重新登入後 navbar roles 顯示 `owner`，並可看到菜單管理區
- admin 可移除一般使用者的 `owner`
- 該使用者重新整理後看不到菜單管理區
- admin 無法移除自己的 `admin` role

## Render/Neon 注意事項

Render env 至少需要：

- `HOST=0.0.0.0`
- `PG_SCHEMA=bf_v10`
- `DATABASE_URL`
- `DATABASE_URL_MIGRATION`（部署時跑 migration 建議使用 direct/non-pooled Neon URL）
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://<render-service>`
- Google OAuth env
- `RBAC_ADMIN_EMAILS=<你的 Google email>`
- 視部署方式設定 `API_ALLOWED_ORIGIN`

V10.3C 不新增 migration；若 Render log 有 migration 訊息，應是既有 migration already applied 或正常略過。

## 尚未做的後續項目

這些不是 V10.3C 範圍：

- 角色變更審計紀錄表
- admin 使用者搜尋/分頁
- owner/admin 角色申請流程
- display order
- major/minor version
- A/B testing
- 促銷系統
- 廚房/店員專用作業台

## 下一個 session 建議流程

1. 先讀本檔與 `報告.md`。
2. 跑 `git status --short`，確認是否有未完成改動。
3. 若正在接續 V10.3C，先看 `shared/contracts.ts`、`shared/route-schemas.ts`、`shared/guards.ts`、`backend.ts`、`frontend/src/App.tsx`、`tests/v10-admin-users.test.ts`。
4. 先完成本機 test/build/tsc/diff，再交給使用者做 Render 線上驗證。
