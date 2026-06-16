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
  - 圖片 URL 預覽與錯誤提示已修正

- `V10.3A RBAC 基礎`
  - `user.roles text[] not null default ARRAY['customer']`
  - `RBAC_ADMIN_EMAILS` 自動授予初始 admin
  - `GET /api/users/me`
  - 菜單 mutation 需要 `owner/admin`
  - `GET /api/orders` 需要 `staff/chef/owner/admin`

- `V10.3B 角色申請與 Admin 審核`
  - 使用者可申請 `staff/chef`
  - admin 可核准或拒絕申請
  - 核准後角色會合併進目標使用者 roles，並保留 `customer`

- `V10.3C Admin 使用者角色管理`
  - `GET /api/admin/users`
  - `PATCH /api/admin/users/:userId/roles`
  - admin 可直接分配或移除角色
  - 禁止 admin 移除自己的 `admin` role

- `V10.3D RBAC 審計紀錄`
  - `role_audit_logs` table
  - `GET /api/admin/role-audit-logs`
  - 角色申請審核與 admin 直接改 roles 都會留下紀錄

- `V10.4A 店員/廚房訂單工作台`
  - 訂單狀態擴充為 `pending | submitted | preparing | ready | completed`
  - `GET /api/orders/workbench`
  - `PATCH /api/orders/:id/status`
  - `chef/owner/admin` 可處理 `submitted -> preparing -> ready`
  - `staff/owner/admin` 可處理 `ready -> completed`
  - 前端新增「訂單工作台」區塊
  - 顧客歷史訂單顯示真實狀態
  - 使用者已回報 Render 驗證成功

### 本輪正在實作，待 Render 驗證

- `V10.4B 取餐資訊與顧客備註`
  - 新增 migration：`drizzle-v10/0004_v10_order_pickup_info.sql`
  - `orders.customer_note text not null default ''`
  - `Order.customerNote`
  - `OrderResponse.pickupCode`，由 `order.id` 推導，例如 `A-0007`
  - `POST /api/orders/:id/submit` 接受可選 `{ customerNote?: string }`
  - 顧客送出訂單時可填寫備註，最多 120 字
  - 工作台與顧客歷史訂單顯示取餐編號與備註
  - 本輪不做付款、取消、退款、重開訂單、WebSocket 即時推播

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
- Tests：`tests/v10-menu-versioning.test.ts`、`tests/v10-rbac.test.ts`、`tests/v10-role-requests.test.ts`、`tests/v10-admin-users.test.ts`、`tests/v10-role-audit-logs.test.ts`、`tests/v10-order-workbench.test.ts`、`tests/v10-order-pickup-info.test.ts`
- 報告：`報告.md`

Legacy `drizzle/` 是 V8/V9 migration，不要拿來當 V10 migration 來源。

## 本機驗證命令

V10.4B 本輪完成後建議跑：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts
git diff --check
```

注意：不要跑全 repo `bunx tsc --noEmit` 當作主要檢核，因為 repo 內有歷史教材備份檔，常引用舊 contracts 或舊 auth。

## Render 驗證清單

V10.4B push 後請使用者在線上確認：

- Render migration log 出現 `0004_v10_order_pickup_info`
- customer 填寫備註並送出訂單
- customer 在「我的訂單歷史」看到取餐編號與備註
- chef/staff 在「訂單工作台」看到同一筆訂單的取餐編號與備註
- chef/staff 完成 V10.4A 狀態流轉後，備註與取餐編號仍保留
- 未填備註時，訂單顯示「無備註」或空備註狀態

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

V10.4B 新增 migration。因為專案 migration runner 會依 journal 重跑 migration，`0004_v10_order_pickup_info.sql` 必須保持 idempotent。

## 尚未做的後續項目

- V10.4B Render 線上驗證紀錄更新
- 訂單付款
- 訂單取消、退款、重開訂單
- WebSocket 即時推播
- audit log 匯出/搜尋
- admin 使用者搜尋/分頁
- display order
- major/minor version
- 促銷系統
- A/B testing

## 下一個 session 建議流程

1. 先讀本檔與 `報告.md`。
2. 跑 `git status --short`。
3. 若接續 V10.4B，優先看 `shared/contracts.ts`、`shared/route-schemas.ts`、`db/schema.ts`、`store/Store.ts`、`store/pg/PgStore.ts`、`store/json/JsonFileStore.ts`、`backend.ts`、`frontend/src/App.tsx`。
4. 先完成本機 test/build/tsc/diff，再交給使用者做 Render 線上驗證。
