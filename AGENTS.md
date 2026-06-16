# AGENTS.md

本檔是給下一個 Codex/session 的交接紀錄。請先讀完這份，再看 `報告.md` 與 `git status --short`。

## 專案脈絡

- 專案位置：`C:\Users\user1\Desktop\NUU\BACKEND_W15_FOR_FINAL\bf1042`
- 使用者語言偏好：繁體中文。
- 技術棧：Bun + TypeScript + Elysia backend、React/Vite frontend、Drizzle ORM + Neon PostgreSQL、Better Auth + Google OAuth。
- 第十週講義：`bf1042-docs-hub/bf1042-docs-hub/00_teaching/05_1_V10_RBAC權限系統設計與實作講義.md`
- 正式驗收以使用者提供的 Render 部署、Render runtime、Neon migration、線上瀏覽器/API 驗證為準。

## 目前版本狀態

### 已完成且使用者回報 Render 驗證成功

- `V10.1 基礎版本化`
  - 菜單品項使用版本 ID，例如 `001-01`、`001-02`
  - 訂單引用特定 `menu_items.id`
  - 舊版菜單不可加入購物車，舊購物車送出會回 `409`

- `V10.2 菜單管理與版本展示`
  - 登入後可新增、編輯、下架菜單
  - `GET /api/menu/:id/history`
  - 圖片 URL 預覽與載入失敗提示已修正

- `V10.3A RBAC 基礎`
  - `user.roles text[] not null default ARRAY['customer']`
  - `RBAC_ADMIN_EMAILS` 自動授予初始 admin
  - 菜單 mutation 需要 `owner/admin`
  - `GET /api/orders` 需要 `staff/chef/owner/admin`

- `V10.3B 角色申請與 Admin 審核`
  - 使用者可申請 `staff/chef`
  - admin 可核准或拒絕申請

- `V10.3C Admin 使用者角色管理`
  - `GET /api/admin/users`
  - `PATCH /api/admin/users/:userId/roles`
  - admin 可直接分配或移除使用者 roles
  - 禁止 admin 移除自己的 `admin` role

- `V10.3D RBAC 審計紀錄`
  - `role_audit_logs` table
  - `GET /api/admin/role-audit-logs`
  - 角色申請審核與 admin 直接改 roles 都會留下紀錄

### 已本機完成，待使用者 Render 驗證

- `V10.4A 店員/廚房訂單工作台`
  - 訂單狀態擴充為 `pending | submitted | preparing | ready | completed`
  - 新增 `GET /api/orders/workbench`
  - 新增 `PATCH /api/orders/:id/status`
  - `chef/owner/admin` 可處理 `submitted -> preparing -> ready`
  - `staff/owner/admin` 可處理 `ready -> completed`
  - 前端新增「訂單工作台」區塊
  - 顧客歷史訂單顯示真實狀態
  - 不新增 migration，因為 `orders.status` 已是 text

## 重要檔案

- Backend/API：`backend.ts`
- App schema：`db/schema.ts`
- Contracts：`shared/contracts.ts`
- Route schemas：`shared/route-schemas.ts`
- Store 介面：`store/Store.ts`
- PostgreSQL store：`store/pg/PgStore.ts`
- JSON store：`store/json/JsonFileStore.ts`
- Frontend：`frontend/src/App.tsx`
- V10 migrations：`drizzle-v10/`
- Tests：`tests/v10-menu-versioning.test.ts`、`tests/v10-rbac.test.ts`、`tests/v10-role-requests.test.ts`、`tests/v10-admin-users.test.ts`、`tests/v10-role-audit-logs.test.ts`、`tests/v10-order-workbench.test.ts`
- 報告：`報告.md`

Legacy `drizzle/` 是 V8/V9 migration，不要拿來當 V10 migration 來源。

## 本機驗證命令

V10.4A 本輪完成後建議跑：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts
git diff --check
```

不要用全 repo `bunx tsc --noEmit` 當主要檢核，repo 內有歷史教材備份檔。

## Render 驗證清單

V10.4A push 後請使用者在線上確認：

- 顧客送出訂單後，staff/chef/owner/admin 可在「訂單工作台」看到該訂單
- chef 可將 `submitted` 改為 `preparing`
- chef 可將 `preparing` 改為 `ready`
- staff 可將 `ready` 改為 `completed`
- 顧客重新整理後，在「我的訂單歷史」看到狀態變化
- customer 帳號看不到「訂單工作台」
- staff 不可把 `submitted` 改成 `preparing`
- chef 不可把 `ready` 改成 `completed`

## Render/Neon 注意事項

Render env 至少需要：

- `HOST=0.0.0.0`
- `PG_SCHEMA=bf_v10`
- `DATABASE_URL`
- `DATABASE_URL_MIGRATION`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://<render-service>`
- Google OAuth env
- `RBAC_ADMIN_EMAILS=<你的 Google email>`
- 視部署方式設定 `API_ALLOWED_ORIGIN`

V10.4A 不新增 migration。若 Render log 有 migration 訊息，應是既有 migration already applied 或正常略過。

## 尚未做的後續項目

- V10.4A Render 線上驗證紀錄更新
- 訂單付款、桌號、叫號、取餐通知
- 訂單取消、退款、重開訂單
- WebSocket 即時推播
- audit log 分頁/匯出
- admin 使用者搜尋/分頁
- display order
- major/minor version
- A/B testing
- 促銷系統

## 下一個 session 建議流程

1. 先讀本檔與 `報告.md`。
2. 跑 `git status --short`。
3. 若接續 V10.4A，優先看 `shared/contracts.ts`、`store/Store.ts`、`store/pg/PgStore.ts`、`store/json/JsonFileStore.ts`、`backend.ts`、`frontend/src/App.tsx`。
4. 先完成本機 test/build/tsc/diff，再交給使用者做 Render 線上驗證。
