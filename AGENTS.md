# AGENTS.md

本檔是給下一個 Codex/session 的交接紀錄。請先讀完這份，再繼續實作或回報。

## 專案與對話脈絡

- 專案位置：`C:\Users\user1\Desktop\NUU\BACKEND_W15_FOR_FINAL\bf1042`
- 使用者語言偏好：繁體中文。
- 專案主體：早餐店訂餐系統，Bun + TypeScript + Elysia backend、React/Vite frontend、Drizzle ORM + Neon PostgreSQL、Better Auth + Google OAuth。
- 第十週講義位置：
  `bf1042-docs-hub/bf1042-docs-hub/00_teaching/05_1_V10_RBAC權限系統設計與實作講義.md`
- 使用者要求的目前主線：依第十週講義先完成 `V10.1 基礎版本化（必做）`，暫不做 V10.2 UX、V10.3 進階功能，也暫不做完整 RBAC。

## 目前實作狀態

已實作 V10.1 基礎版本化，尚未 commit。

核心改動：

- `PG_SCHEMA` 預設從 `bf_v9` 改為 `bf_v10`。
- `drizzle.config.ts` 的 migration 輸出改為 `drizzle-v10`，避免沿用舊 `drizzle/` 的 V8/V9 migration。
- 新增乾淨 V10 初始化 migration：
  - `drizzle-v10/0000_v10_initial.sql`
  - `drizzle-v10/meta/_journal.json`
  - migration 內含 `CREATE SCHEMA IF NOT EXISTS "bf_v10";`
  - 靜態檢查過：不含 `bf_v8`、`bf_v9`、`DROP TABLE`、危險 `CASCADE`。
- `menu_items` 已改成版本化資料模型：
  - `id` 為字串版本 ID，例如 `001-01`、`001-02`
  - 新增 `entity_id`、`logical_id`、`version`、`is_current_version`、`supersedes`、`change_reason`、`created_at`、`created_by`
  - `entity_id + version` unique、`logical_id` index、`is_current_version` index
- `order_items` 已改成只存 `menu_item_id`，FK 指向特定 `menu_items.id`，不再存 `name/price/category/description/image_url` 快照欄位。
- 新增 `db/repositories/menuRepository.ts`，集中處理：
  - `getCurrentMenu`
  - `getMenuVersion`
  - `createMenuItem`
  - `updateMenuItemVersion`
  - `retireCurrentVersion`
  - `validateMenuItemsAreCurrent`
- `PgStore` 已改為：
  - 新增菜單時建立初版 `logicalId-01`
  - 更新菜單時建立新版，不覆蓋舊版
  - 刪除菜單時只讓 current version 下架，不實體刪除
  - 加入購物車只允許 current menu version
  - 送出訂單時檢查購物車內所有版本仍是 current；過期則回錯誤碼 `MENU_ITEM_NOT_CURRENT`
  - reload 訂單時 JOIN `order_items.menu_item_id -> menu_items.id` 還原 nested `items[].item`
- `JsonFileStore` 也已跟上字串 ID 與簡易版本化，避免 `STORE_DRIVER` 不是 postgres 時 build/type 出錯。
- `backend.ts` 已改為：
  - `PATCH /api/menu/:id` 不再 parse number，傳入 `id` 或 `logicalId`
  - `DELETE /api/menu/:id` 不再 parse number
  - 加購或送出若遇到過期菜單版本，回 `409`
- `frontend/src/App.tsx` 已改為：
  - 購物車 key 從 `Record<number, number>` 改為 `Record<string, number>`
  - menu item ID 不再 `Number(...)`
  - 409 時顯示「菜單品項已更新，請重新整理」類型提示
- 新增測試：
  - `tests/v10-menu-versioning.test.ts`
  - 驗證 menu item ID 是版本字串，order update body 不再接受 number itemId。

## 重要檔案

下一個 session 若要繼續 V10.1，優先看這些：

- `db/schema.ts`
- `db/auth-schema.ts`
- `db/repositories/menuRepository.ts`
- `store/pg/PgStore.ts`
- `store/json/JsonFileStore.ts`
- `store/Store.ts`
- `shared/contracts.ts`
- `shared/route-schemas.ts`
- `backend.ts`
- `frontend/src/App.tsx`
- `drizzle-v10/0000_v10_initial.sql`
- `scripts/run-migration.ts`
- `tests/v10-menu-versioning.test.ts`

舊的 `drizzle/` 目錄是 legacy V8/V9 migration，不要把它當 V10 migration 來源。

## 已驗證命令

以下只記錄「當時本機曾經跑過」的狀態，方便排查 TypeScript/build 方向的問題；但依使用者目前決策，這些本地結果不作為專案完成或失敗的檢核標準。最終檢核只看 Render 部署、Render runtime、Neon 連線/migration、以及線上 API/瀏覽器實際行為。

以下命令在目前狀態通過：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts
```

另外曾跑過：

```bash
bun run build:backend
bun run build:frontend
```

兩者也通過。

注意：全域 `bunx tsc --noEmit` 會失敗，原因主要是 repo 內有許多歷史教材備份檔，例如 `backend_05.ts`、`backend_06.ts`、`backend.v9.pre-better-auth.ts`，它們本來就引用舊 contracts、舊 auth 或缺少 `@elysiajs/static`。不要把這些歷史檔的錯誤誤判為目前入口檔失敗。

## 尚未驗證/待下一步

尚未跑 Neon 實際 migration，因為目前 checkout 沒有 `.env` / `DATABASE_URL`。

下一步若使用者提供或恢復正確 env，可做：

```bash
$env:PG_SCHEMA = "bf_v10"
bun run db:migrate
```

若要產生 Drizzle 新 snapshot/migration，要先注意：

- `bun run db:generate` 現在會輸出到 `drizzle-v10`
- 不要讓 `drizzle-kit generate` 覆蓋或混入舊 `drizzle/`
- 生成後一定要人工檢查 SQL：
  - 必須使用 `bf_v10`
  - 不可出現 `bf_v8` 或 `bf_v9`
  - 不可出現危險的 `DROP TABLE ... CASCADE`
  - `order_items` 應使用 `menu_item_id` text FK 指向 `menu_items.id`

## 目前 git/worktree 提醒

截至撰寫本檔時，`git status --short` 顯示這些主要修改/新增：

- 修改：
  - `backend.ts`
  - `db/auth-schema.ts`
  - `db/schema.ts`
  - `drizzle.config.ts`
  - `frontend/src/App.tsx`
  - `package.json`
  - `scripts/run-migration.ts`
  - `shared/contracts.ts`
  - `shared/route-schemas.ts`
  - `store/Store.ts`
  - `store/json/JsonFileStore.ts`
  - `store/pg/PgStore.ts`
- 新增未追蹤：
  - `db/repositories/`
  - `drizzle-v10/`
  - `tests/`
  - `bf1042-docs-hub/`

`bf1042-docs-hub/` 是使用者上傳的講義資料夾；不要修改或刪除，除非使用者明確要求。

## 實作邊界

請維持以下邊界，除非使用者明確改需求：

- 不實作 V10.2 UX 優化：
  - 不做價格變動提示 UI
  - 不做購物車失效細緻處理
  - 不做版本歷史查詢 API
- 不實作 V10.3 進階功能：
  - 不做 display order 表
  - 不做 major/minor version
  - 不做 A/B testing
  - 不做促銷系統
- 不實作完整 RBAC：
  - 不新增 roles 欄位
  - 不新增 role_requests
  - 不做前端權限元件

目前只完成講義 V10.1「菜單版本化 + 訂單引用特定菜單版本」主線。

## 已知注意事項

- `node_modules` 已由 `bun install` 補上，因為原 checkout 缺依賴，測試/build 一開始無法解析 `zod`、`elysia`。
- `bun run build` 會產生/更新 `dist` 與 `public` build 產物；目前 git status 沒顯示它們為 modified，可能是 ignored 或未變更。
- Windows 上 `git diff --check` 只出現 LF/CRLF 提醒，沒有 whitespace error。
- 若要做 API smoke test，需要真實 Better Auth session cookie；目前沒有 `.env`，所以沒有跑實際登入/下單/送出流程。
- `.env.example` 不會作為 Render 實際部署 env 來源；正式 env 由 Render Dashboard 設定匯入。若之後整理文件可順手修正其中的 `PG_SCHEMA=bf_v9`，但不要把 `.env.example` 當成部署阻塞點。

## Render/Neon 部署理解

使用者的真正驗收目標不是只有本機 build 通過，而是 GitHub 推上去後由 Render 部署，Render 上的前後端能連到 Neon PostgreSQL，並且實際從瀏覽器打 API 完成登入、讀菜單、下單、送出訂單。

目前對線上部署的理解：

- Render 會從 GitHub 指定 branch 觸發 build/deploy；本機驗證只是第一層，Render build log 與 runtime log 才是正式部署問題的主要證據。
- 使用者多半會直接 push 到 GitHub 讓 Render deploy；檢核方式只看 Render/Neon 線上結果，不看本地。本地測試成功或失敗都不代表最終狀態，下一個 Codex 不要把本地測試包裝成完成依據。
- Render Web Service 必須監聽 Render 指定的 `PORT`，並且 host 需可被容器外部連線。此專案 `backend.ts` 目前是 `const host = process.env.HOST || "localhost";`，所以 Render 環境必須設定 `HOST=0.0.0.0`，否則可能只綁 localhost。`.env.example` 也有提醒這件事。
- Neon 是 PostgreSQL，相對於本機驗證，真正重要的是 migration 是否能在 Neon 上建立 `bf_v10` schema、Better Auth tables、`menu_items`、`orders`、`order_items`，以及 app runtime 是否能用 `DATABASE_URL` 正常查寫。
- migration 建議使用 direct/non-pooled Neon URL 放在 `DATABASE_URL_MIGRATION`；runtime `DATABASE_URL` 可依部署需求使用一般連線或 pooled URL。不要用錯 schema：V10 應使用 `PG_SCHEMA=bf_v10`。
- Render 上至少要確認這些 env：`PORT` 由 Render 給、`HOST=0.0.0.0`、`DATABASE_URL`、`DATABASE_URL_MIGRATION`（若部署時跑 migration）、`PG_SCHEMA=bf_v10`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL=https://<render-service>`、Google OAuth client env、以及必要時的 `API_ALLOWED_ORIGIN`。
- 若前端和後端同 origin，cookie/session 問題較單純；若前後端分開 origin，`API_ALLOWED_ORIGIN` 不能隨便用 `*` 期待 cookie auth 正常跨站運作，因為目前 backend CORS 的 credentials 行為會受 allowed origin 設定影響。

## 登入/帳號管理理解

目前專案登入管理是 Better Auth + Google OAuth + session cookie + Neon/Postgres auth tables。

重點：

- `auth/better-auth.ts` 建立 Better Auth instance，adapter 使用 Drizzle/Postgres，schema 來自 `db/auth-schema.ts`。
- `BETTER_AUTH_SECRET` 是啟動必要條件，且不能是 `replaceme`；缺少時應在啟動期直接報錯。
- 目前沒有 email/password 登入，`emailAndPassword.enabled = false`；登入入口是 Google OAuth，且只有在 `GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 都存在時才啟用。
- `BETTER_AUTH_URL` 是 Better Auth base URL，Render 上必須改成正式服務 URL，不能留 `localhost`。
- `trustedOrigins` 預設包含 `BETTER_AUTH_URL`，若 `API_ALLOWED_ORIGIN` 有設定且不是 `*`，也會加入 trusted origins，主要是處理 CSRF/origin 驗證。
- `backend.ts` 以 `GET /api/auth/*` 和 `POST /api/auth/*` 轉交給 `auth.handler(request)`；註解提醒不能用 `app.mount("/api/auth", auth.handler)`。
- `getCurrentUser(request)` 透過 `auth.api.getSession({ headers })` 讀 session，轉成公開的 `SessionUser`，只暴露 `id/email/name`。
- `requireUser()` 保護訂單相關 API；目前 `/api/orders/current`、`/api/orders/history`、建立訂單、讀/改訂單、送出訂單都需要登入。
- 菜單 CRUD 目前尚未接完整 RBAC，這符合目前只做 V10.1 的邊界；不要誤以為已有 admin 權限系統。
- frontend 會呼叫 `/api/auth/get-session` 檢查登入狀態，Google 登入會 POST `/api/auth/sign-in/social`，登出則走自訂 `/api/sign-out` proxy，以避開正式環境 origin 設定錯誤時 Better Auth sign-out 403 但前端誤判已登出的問題。
- `auth/better-auth.ts` 內仍有一段舊註解寫 V9/bf_v9；實際 schema 預設已是 `bf_v10`。若下一步做清理，應更新這個註解。

## 使用者偏好的 Git/部署工作流

使用者已明確表示期末專案期間會採用簡化流程：確認某版可運行後，GitHub 以 force push 方式更新，Render 從 GitHub 部署驗證。不要反覆要求使用者改成複雜分支管理；這不是目前專案成本能承擔的方向。

可以給的務實建議：

- 若使用者要 force push，優先建議 `git push --force-with-lease`，比裸 `--force` 多一層保護。
- 每次確認 Render 可運行後，建議建立可回復點，例如 tag `render-ok-v10.1-YYYYMMDD-HHMM` 或 backup branch。這不等於複雜分支管理，只是保留救援點。
- code 壞掉通常可以靠 Git 回退；DB migration 壞掉比較麻煩。涉及 Neon schema/data 的改動要比前端或普通 backend 改動更保守，migration SQL 需人工看過。
- 回報部署錯誤時，最有用的是 Render build log、Render runtime log、HTTP status/response body、瀏覽器 Network request、Neon migration output，而不是只說「不能跑」。

## 和 Codex 跨 session 協作建議

使用者常需要換 session 以釋放上下文。下一個 Codex 應先讀本檔，不要從零重新猜專案。

建議使用者每次新 session 開頭貼或要求：

- 「先讀 `AGENTS.md`，再看 `git status --short`，不要改檔，先回報你理解的目前狀態。」
- 明確說這次只做哪個階段，例如「只做 V10.1 Neon migration smoke」或「開始 V10.2 UX，不動 V10.3/RBAC」。
- 若是部署錯誤，直接提供 Render build log/runtime log 的關鍵段落、URL、發生時間、操作步驟、HTTP status、response body。
- 若是資料庫錯誤，提供 `PG_SCHEMA` 目標、跑的命令、migration output、Neon console 看到的 schema/table 狀態。
- 檢核方式只看 Render，不看本地；下一個 Codex 不應反覆要求先在本地跑完所有測試，也不應用本地測試結果判定完成或失敗。重點應放在 Render 部署設定、build log、runtime log、Neon schema/migration 與線上 API 行為。
- 若要 Codex 改碼，先要求它說明將修改哪些檔案與驗證方式；確認後再叫它實作。小修可直接實作，大改建議先產生計畫。
- 每次 force push 前，讓 Codex 先整理「本輪改了什麼、跑過哪些驗證、還沒驗證什麼」，這會比單純看 diff 更適合期末交付節奏。

## 建議給下一個 session 的第一步

1. 先讀本檔與 `git status --short`。
2. 若使用者要繼續 V10.1 驗證，優先要求/確認 `.env`：
   - `DATABASE_URL`
   - `DATABASE_URL_MIGRATION`（可選）
   - `PG_SCHEMA=bf_v10`
   - `BETTER_AUTH_SECRET`
   - Google OAuth env（若要測登入）
3. 跑 `bun run db:migrate` 套到 Neon。
4. 啟動 app 後手動或 REST 驗證：
   - seed 後 `GET /api/menu` 回 current items，如 `001-01`
   - 更新 `001` 後出現 `001-02`，且 `001-01` 非 current
   - 舊 cart 送出時回 `409`
   - 新 current version 可正常下單
   - 再次改價後舊訂單仍顯示當時版本資料
