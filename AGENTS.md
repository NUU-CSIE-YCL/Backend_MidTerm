# AGENTS.md

本檔是給下一個 Codex/session 的交接紀錄。請先讀完本檔，再讀 `報告.md`，接著看 `git status --short`。

## 目前結論

- 專案目前已完成並已由使用者在 Render 線上驗證到 `V10.2`。
- 本輪已實作 `V10.3A RBAC 基礎切片`，目前待使用者推上 Render 做線上驗證。
- `V10.1 基礎版本化` 已完成：菜單品項版本化、訂單引用特定菜單版本、舊菜單版本不可再加入購物車或結帳。
- `V10.2 菜單管理與版本展示` 已完成：登入後可在網站管理菜單、建立新版、下架、查版本歷史、顯示版本提示與圖片錯誤提示。
- 下一階段若繼續做完整角色申請/審核，應視為 `V10.3B`，不要再把 V10.1/V10.2 當成待完成項目。

## 專案脈絡

- 專案位置：`C:\Users\user1\Desktop\NUU\BACKEND_W15_FOR_FINAL\bf1042`
- 使用者語言偏好：繁體中文。
- 專案主體：早餐店訂餐系統。
- 技術棧：Bun + TypeScript + Elysia backend、React/Vite frontend、Drizzle ORM + Neon PostgreSQL、Better Auth + Google OAuth。
- 第十週講義位置：`bf1042-docs-hub/bf1042-docs-hub/00_teaching/05_1_V10_RBAC權限系統設計與實作講義.md`
- 使用者的部署驗收方式：GitHub 推上去後由 Render 部署，實際在 Render 網站與 Neon 資料庫驗證。

## 已完成狀態

### V10.1 已完成並驗證

- `PG_SCHEMA` 目標為 `bf_v10`。
- V10 migration 使用 `drizzle-v10/`，不再沿用 legacy `drizzle/` 的 V8/V9 migration。
- `scripts/start.ts` 會在 Render 啟動時先執行 migration，再啟動後端。
- `menu_items` 已版本化：
  - `id` 是版本 ID，例如 `001-01`、`001-02`
  - `logical_id` 表示同一品項
  - `version` 表示版本序號
  - `is_current_version` 表示目前可售版本
  - `supersedes` 與 `change_reason` 用於版本追蹤
- `order_items.menu_item_id` 指向特定 `menu_items.id`，歷史訂單會保留當時購買的菜單版本。
- 加入購物車與送出訂單會檢查品項是否仍為 current version，過期版本會回 `409`。

### V10.2 已完成並驗證

- 登入後顯示菜單管理 UI。
- 可從網站新增品項、編輯品項建立新版、下架品項。
- 菜單 mutation endpoint 已需要登入：
  - `POST /api/menu`
  - `PATCH /api/menu/:id`
  - `DELETE /api/menu/:id`
- 已新增版本歷史 API：
  - `GET /api/menu/:id/history`
  - `id` 可用 logical id 或版本 id
- 前端菜單卡片會顯示 logical id、版本 badge、近期調整提示。
- 管理 UI 可顯示版本歷史與修改原因。
- 圖片 UX 已修正：
  - 使用者輸入有效圖片 URL 時會顯示該圖片
  - 圖片載入失敗時會明確顯示「圖片載入失敗，顯示備用圖」
  - 失敗時提供「開啟原圖」連結
  - 菜單管理表單有圖片 URL 即時預覽

### V10.3A 已本機實作，待 Render 驗證

- `bf_v10.user` 新增 `roles text[]`，預設 `["customer"]`。
- 新增 migration：`drizzle-v10/0001_v10_rbac_roles.sql`，已加入 `drizzle-v10/meta/_journal.json`。
- 新增 shared role contract：`customer | staff | chef | owner | admin`。
- `SessionUser` 已包含 `roles`。
- 新增 `shared/guards.ts`，提供 `hasRole`、`hasAnyRole`、`hasAllRoles`、`requireAnyRole`。
- 新增 `GET /api/users/me`，回傳目前登入使用者與 roles。
- `RBAC_ADMIN_EMAILS` 可用逗號分隔 email，自動把指定 Google 帳號補成 `admin`。
- `POST/PATCH/DELETE /api/menu` 已改為只有 `owner/admin` 可操作。
- `GET /api/orders` 已改為只有 `staff/chef/owner/admin` 可查看所有訂單。
- 顧客自己的購物車、下單、訂單歷史流程維持不變。
- 前端會顯示角色 badge，且只有 `owner/admin` 會看到菜單管理 UI。

## 重要檔案

後端與資料模型：

- `backend.ts`
- `db/schema.ts`
- `db/auth-schema.ts`
- `db/schema-name.ts`
- `db/repositories/menuRepository.ts`
- `store/Store.ts`
- `store/pg/PgStore.ts`
- `store/json/JsonFileStore.ts`
- `shared/contracts.ts`
- `shared/route-schemas.ts`
- `shared/guards.ts`

migration 與啟動：

- `drizzle-v10/0000_v10_initial.sql`
- `drizzle-v10/meta/_journal.json`
- `scripts/run-migration.ts`
- `scripts/start.ts`
- `drizzle.config.ts`

前端：

- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/package.json`

測試與文件：

- `tests/v10-menu-versioning.test.ts`
- `tests/v10-rbac.test.ts`
- `報告.md`
- `AGENTS.md`

注意：`drizzle/` 是 legacy V8/V9 migration，不要把它當成 V10 migration 來源。

## 已驗證

本機驗證曾通過：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts
git diff --check
```

Render 線上驗證已由使用者完成：

- Render build 成功。
- Render runtime 成功啟動。
- migration 成功建立或沿用 `bf_v10` schema。
- 網站可登入。
- 可新增、編輯、下架菜單。
- 改價後會建立新版，舊版不再是 current。
- 可查看版本歷史。
- 圖片 URL 顯示與失敗提示已驗證成功。

V10.3A 本輪本機驗證已通過：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts
git diff --check
```

## Render/Neon 注意事項

Render env 需要維持：

- `HOST=0.0.0.0`
- `PG_SCHEMA=bf_v10`
- `DATABASE_URL`
- `DATABASE_URL_MIGRATION`，若部署時跑 migration 建議使用 direct/non-pooled Neon URL
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://<render-service>`
- Google OAuth 相關 env
- `RBAC_ADMIN_EMAILS=<你的 Google email>`，用於 V10.3A 初始 admin bootstrap
- 必要時設定 `API_ALLOWED_ORIGIN`

`.env.example` 不會自動成為 Render env 來源。Render 的正式 env 由 Dashboard 匯入。

## 目前尚未做

這些屬於 V10.3B 或後續強化，不屬於 V10.3A：

- `roles`、`role_requests` 或權限申請流程。
- admin 審核角色申請。
- 直接分配或移除使用者角色的後台 UI。
- 菜單顯示排序 display order。
- major/minor version。
- A/B testing。
- 促銷系統。
- 更完整的購物車失效 UI，例如自動提示替換成新版。
- 更細的管理者審計紀錄與後台操作紀錄。

## 下一個 session 建議

1. 先讀 `AGENTS.md` 與 `報告.md`。
2. 看 `git status --short`，確認是否只有文件變更或是否有使用者新改動。
3. 若使用者問目前進度，回答：V10.1 與 V10.2 都已完成並經 Render 驗證；V10.3A 已本機實作，待 Render 驗證。
4. 若使用者要求繼續開發，先判斷是否進入 V10.3B；不要回頭重做 V10.1/V10.2。
5. 涉及 Neon schema 或 migration 時要保守，先檢查 SQL，避免動到 legacy `bf_v8`、`bf_v9` 或舊 `drizzle/`。

## 使用者偏好的工作流

- 使用者期末專案期間偏好簡化流程：確認可運行後直接推 GitHub，交由 Render 部署驗證。
- 若需要 force push，建議使用 `git push --force-with-lease`。
- 本地測試可作為輔助，但正式驗收以 Render/Neon 線上行為為準。
- 回報部署問題時，最有用的是 Render build log、runtime log、HTTP status/response body、瀏覽器 Network request 與 Neon migration output。
