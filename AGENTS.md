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
  - `PG_SCHEMA=bf_v10`
  - 菜單品項使用版本 ID，例如 `001-01`、`001-02`
  - 訂單引用特定 `menu_items.id`
  - 舊版菜單不可加入購物車，舊購物車送出會回 `409`

- `V10.2 菜單管理與版本展示`
  - 登入後可新增、編輯、下架菜單
  - `GET /api/menu/:id/history`
  - 菜單卡片顯示 logical id、版本 badge、近期更新提示
  - 圖片 URL 預覽與載入失敗提示已修正

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

### 已本機完成，待使用者 Render 驗證

- `V10.3C Admin 使用者角色管理`
  - `GET /api/admin/users`
  - `PATCH /api/admin/users/:userId/roles`
  - admin 可直接分配或移除使用者 roles
  - 後端永遠保留 `customer`
  - 禁止 admin 移除自己的 `admin` role
  - 前端新增 admin-only「使用者角色管理」卡片

- `V10.3D RBAC 審計紀錄`
  - 新增 `role_audit_logs` table
  - 新增 migration：`drizzle-v10/0003_v10_role_audit_logs.sql`
  - 新增 `GET /api/admin/role-audit-logs`
  - admin 核准/拒絕角色申請會寫入 audit log
  - admin 直接更新使用者 roles 會寫入 audit log
  - 前端新增 admin-only「角色異動紀錄」卡片
  - `RBAC_ADMIN_EMAILS` 自動授予 admin 暫不追溯記錄

## 重要檔案

- Backend/API：`backend.ts`
- Auth schema：`db/auth-schema.ts`
- App schema：`db/schema.ts`
- Contracts：`shared/contracts.ts`
- Route schemas：`shared/route-schemas.ts`
- RBAC guards：`shared/guards.ts`
- Frontend：`frontend/src/App.tsx`
- V10 migrations：`drizzle-v10/`
- Render startup：`scripts/start.ts`
- Tests：`tests/v10-menu-versioning.test.ts`、`tests/v10-rbac.test.ts`、`tests/v10-role-requests.test.ts`、`tests/v10-admin-users.test.ts`、`tests/v10-role-audit-logs.test.ts`
- 報告：`報告.md`

Legacy `drizzle/` 是 V8/V9 migration，不要拿來當 V10 migration 來源。

## 本機驗證命令

V10.3D 本輪完成後建議跑：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts
git diff --check
```

不要用全 repo `bunx tsc --noEmit` 當主要檢核，repo 內有歷史教材備份檔。

## Render 驗證清單

V10.3D push 後請使用者在線上確認：

- Render migration log 出現 `0003_v10_role_audit_logs`
- admin 登入後看到「角色異動紀錄」區塊
- admin 核准一筆 staff/chef 申請後，審計紀錄出現「申請核准」
- admin 拒絕一筆申請後，審計紀錄出現「申請拒絕」
- admin 直接修改一般使用者 roles 後，審計紀錄出現「直接更新」
- 非 admin 使用者看不到審計紀錄區塊，也無法呼叫 `/api/admin/role-audit-logs`

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

V10.3D 有新 migration。涉及 Neon schema/data 的改動比前端更需要保守，push 前請確認 `drizzle-v10/0003_v10_role_audit_logs.sql` 不含 legacy schema 或危險 drop。

## 尚未做的後續項目

- V10.3C/V10.3D Render 線上驗證紀錄更新
- admin 使用者搜尋/分頁
- audit log 匯出
- audit log 分頁
- 店員/廚房專用訂單工作台
- display order
- major/minor version
- A/B testing
- 促銷系統

## 下一個 session 建議流程

1. 先讀本檔與 `報告.md`。
2. 跑 `git status --short`。
3. 若接續 V10.3D，優先看 `db/schema.ts`、`backend.ts`、`frontend/src/App.tsx`、`shared/contracts.ts`、`shared/route-schemas.ts`、`tests/v10-role-audit-logs.test.ts`。
4. 先完成本機 test/build/tsc/diff，再交給使用者做 Render 線上驗證。
