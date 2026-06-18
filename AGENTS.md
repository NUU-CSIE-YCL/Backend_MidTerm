# AGENTS.md

## 最新交接摘要：V10.3G + V10.3E

- 使用者已回報上一輪 `V10.3 菜單版本化進階功能` 已通過 Render 驗證，但前端管理區仍有部分英文文案。
- 本輪目標：
  - `V10.3G 管理介面中文化與收合體驗`
  - `V10.3E A/B 測試穩定分流最小切片`
- 已新增 `GET /api/menu/experimented?visitorKey=<string>`：
  - 公開可讀。
  - 使用 `shared/menu-experiments.ts` 的穩定 hash 分流。
  - 同一 `visitorKey + experimentKey` 會得到同一 variant。
  - 無 A/B metadata 的品項照常顯示。
  - 不改既有 `GET /api/menu`。
- 前端公開菜單已改為優先呼叫 experimented menu；失敗時 fallback 到 `GET /api/menu`。
- 前端新增 `CollapsibleSection`，並開始套用在管理/營運區塊：
  - 角色與權限管理
  - 營運摘要
  - 訂單工作台
  - 菜單管理
  - 價格分析與 A/B 測試
- 前端 V10.3 進階區英文文案已改為中文：
  - version level/note
  - price analysis
  - A/B experiments
  - loading/refresh/variant/orders/qty/revenue 等主要顯示字串
- 新增測試：
  - `tests/v10-menu-experiment-split.test.ts`
- 注意：本輪進行中途工具因 usage limit 無法執行 `bun run build` / `bun test`。下一個 session 或額度恢復後，請優先跑：
  - `bun run build`
  - `bun test`
  - TypeScript 入口檢查，加入 `tests/v10-menu-experiment-split.test.ts`
  - `git diff --check`

## 最新交接摘要：V10.3 菜單版本化進階功能

- 使用者已回報 `V10.5C 單品特價與折扣價基礎`、`V10.6A 營運報表 CSV 匯出` 已通過 Render 驗證。
- 本輪已實作老師講義 V10.3 進階功能中的三個可展示切片：
  - `分級版本管理（major/minor version）`
  - `價格敏感度分析`
  - `A/B 測試支援` 的 metadata 與後台彙整，不做顧客隨機分流
- 新增 migrations：
  - `drizzle-v10/0011_v10_menu_semantic_versions.sql`
  - `drizzle-v10/0012_v10_menu_ab_test_metadata.sql`
- `menu_items` 新增欄位：`major_version`、`minor_version`、`version_note`、`experiment_key`、`experiment_variant`。
- `PATCH /api/menu/:id` 新增 `version_level: "minor" | "major"`：
  - minor：major 不變、minor + 1
  - major：major + 1、minor reset 為 0
  - 既有版本 ID 如 `001-02` 不改，避免破壞訂單引用
- 新增 API：
  - `GET /api/menu/:id/price-analysis`，需要 `owner/admin`
  - `GET /api/menu/experiments`，需要 `owner/admin`
- 前端菜單管理已新增 version level、version note、A/B test key、A/B variant、`Price analysis` 按鈕，以及 admin-only 的 `Price analysis` / `A/B experiments` 摘要區。
- 新增測試：
  - `tests/v10-menu-semantic-version.test.ts`
  - `tests/v10-price-analysis.test.ts`
  - `tests/v10-menu-ab-test.test.ts`
- 本機驗證已通過：`bun test`、`bun run build`、入口檔 TypeScript check。

### Render 驗證建議

- Render migration log 應出現 `0011_v10_menu_semantic_versions` 與 `0012_v10_menu_ab_test_metadata`。
- owner/admin 編輯菜單時可選 `minor` 或 `major`。
- 編輯同一品項後，價格分析可看到不同版本的價格、銷售份數與營收。
- owner/admin 可設定 `experiment_key` / `experiment_variant`，並在 A/B experiments 摘要區看到彙整。
- customer 公開菜單與下單流程不應因 A/B metadata 改變。

## 最新交接：V10.5C + V10.6A 合併實作中

- 使用者已回報 `V10.5B 菜單分類與售完/隱藏狀態` Render 驗證成功。
- 本輪正在實作兩個階段：
  - `V10.5C 單品特價與折扣價基礎`
  - `V10.6A 營運報表 CSV 匯出`
- 本輪資料庫 migration：
  - `drizzle-v10/0010_v10_menu_sale_price.sql`
  - `menu_items.sale_price integer null`
  - `menu_items.promotion_label text not null default ''`
- 本輪主要 API/contract：
  - `MenuItem.salePrice`
  - `MenuItem.promotionLabel`
  - `POST /api/menu`、`PATCH /api/menu/:id` 可接 `sale_price`、`promotion_label`
  - `sale_price` 必須大於 0 且低於原價；`null` 代表取消特價
  - `GET /api/reports/orders.csv?range=today|all`，需要 `staff/owner/admin`
- 本輪重要驗證：
  - 特價品項加入購物車與送出訂單時，`total` 使用 `salePrice ?? price`
  - 舊訂單仍保留當時 menu version 的特價資訊
  - CSV 匯出不包含 email、roles、OAuth 或其他使用者身份欄位

## 最新交接補充：V10.5B 菜單分類與售完/隱藏狀態

- 使用者已回報 `V10.5A 菜單顯示排序` Render 驗證成功。
- 本輪實作 `V10.5B 菜單分類與售完/隱藏狀態`：
  - 新增 migration：`drizzle-v10/0009_v10_menu_availability.sql`
  - `menu_items` 新增 `is_sold_out`、`is_hidden`
  - `MenuItem` 新增 `isSoldOut`、`isHidden`
  - `GET /api/menu` 公開菜單過濾 hidden
  - 新增 `GET /api/menu/admin`，owner/admin 可看完整 current menu
  - 售完品項公開可見但不可加入購物車
  - 隱藏品項公開不可見且不可加入購物車
  - 前端菜單管理表單新增「售完」「隱藏」checkbox
- 本輪測試需包含：`tests/v10-menu-availability.test.ts`
- Render 驗證重點：
  - migration log 出現 `0009_v10_menu_availability`
  - owner/admin 可切換售完與隱藏
  - 售完品項仍顯示但無法加入購物車
  - 隱藏品項不顯示在公開菜單
  - 取消隱藏後回到原本排序位置

## 最新交接補充：V10.5A 菜單顯示排序

- 使用者已回報 `V10.4H 營運摘要看板` Render 驗證成功。
- 本輪實作 `V10.5A 菜單顯示排序`：
  - 新增 migration：`drizzle-v10/0008_v10_menu_display_order.sql`
  - `menu_items` 新增 `display_order integer not null default 0`
  - `MenuItem` 新增 `displayOrder`
  - `GET /api/menu` 依 `displayOrder asc, id asc` 回傳
  - `POST /api/menu` 可選 `display_order`
  - `PATCH /api/menu/:id` 建立新版時保留原排序
  - 新增 `PATCH /api/menu/reorder`，需要 `owner/admin`
  - 前端菜單管理表格新增排序值與「上移 / 下移」
- 新增根目錄文件：`接下來可能的任務清單.md`
  - 只供人類閱讀與 session 交接
  - 不做網站 UI、不做 API、不做 DB
- 本輪測試需包含：`tests/v10-menu-display-order.test.ts`
- Render 驗證重點：
  - migration log 出現 `0008_v10_menu_display_order`
  - owner/admin 可調整排序
  - customer 看不到排序控制，但公開菜單順序會變
  - 編輯菜單建立新版後排序位置不變

## 最新交接補充：V10.4H 營運摘要看板

- 使用者已回報 `V10.4G 退款與取消訂單重開` Render 驗證成功。
- 本輪實作 `V10.4H 營運摘要看板`，不新增 migration。
- 新增 API：`GET /api/orders/operations-summary?range=today|all`
  - 需要 `staff/owner/admin`
  - `chef` 不可查看營收摘要，仍使用訂單工作台處理製作流程
  - `customer` 不可查看
- 摘要由既有 orders 推導：
  - 排除 `pending` 購物車
  - `today` 使用 Asia/Taipei 日期判斷
  - 回傳訂單總數、待處理數、完成數、取消數、已付款數、已退款數
  - 回傳 `grossRevenue`、`refundedAmount`、`netRevenue`、`unpaidAmount`
  - 回傳各 order status 固定計數
- 前端新增 admin/staff/owner 可見的「營運摘要」區塊：
  - 今日/全部切換
  - 重新整理按鈕
  - 顯示淨營收、有效訂單、待處理、售後與各狀態數量
- 新增測試：`tests/v10-operations-summary.test.ts`
- 本輪建議驗證：
  - `bun test`
  - `bun run build`
  - `bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts tests/v10-order-cancellation.test.ts tests/v10-order-payment.test.ts tests/v10-pickup-board.test.ts tests/v10-auto-refresh.test.ts tests/v10-refund-reopen.test.ts tests/v10-operations-summary.test.ts`
  - `git diff --check`
- Render 驗證清單：
  - staff/owner/admin 登入後看到「營運摘要」
  - customer/chef 看不到「營運摘要」
  - customer 送出訂單後，staff 的今日摘要有效訂單與未收款金額增加
  - staff 完成取餐並收款後，淨營收增加
  - staff 退款後，退款金額增加且淨營收下降
  - 今日/全部切換可正常更新數字

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

- `V10.4B 取餐資訊與顧客備註`
  - `drizzle-v10/0004_v10_order_pickup_info.sql`
  - `orders.customer_note text not null default ''`
  - `Order.customerNote`
  - `OrderResponse.pickupCode`，由 `order.id` 推導，例如 `A-0007`
  - 顧客送出訂單時可填寫備註
  - 工作台與顧客歷史訂單顯示取餐編號與備註
  - 使用者已回報 Render 驗證成功

### 本輪正在實作，待 Render 驗證

- `V10.4C 訂單取消流程`
  - 新增 `cancelled` 訂單狀態
  - 新增 migration：`drizzle-v10/0005_v10_order_cancellation_info.sql`
  - `orders.cancel_reason text not null default ''`
  - `orders.cancelled_by text null references user(id)`
  - `orders.cancelled_at timestamp with time zone null`
  - 新增 `PATCH /api/orders/:id/cancel`
  - customer 只能取消自己的 `submitted` 訂單
  - `staff/owner/admin` 可取消 `submitted/preparing/ready` 訂單
  - `pending/completed/cancelled` 不可取消
  - chef 不負責取消訂單
  - 前端在歷史訂單與工作台顯示取消操作與取消資訊

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
- Tests：`tests/v10-menu-versioning.test.ts`、`tests/v10-rbac.test.ts`、`tests/v10-role-requests.test.ts`、`tests/v10-admin-users.test.ts`、`tests/v10-role-audit-logs.test.ts`、`tests/v10-order-workbench.test.ts`、`tests/v10-order-pickup-info.test.ts`、`tests/v10-order-cancellation.test.ts`
- 報告：`報告.md`

Legacy `drizzle/` 是 V8/V9 migration，不要拿來當 V10 migration 來源。

## 本機驗證命令

V10.4C 本輪完成後建議跑：

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts tests/v10-order-cancellation.test.ts
git diff --check
```

注意：不要跑全 repo `bunx tsc --noEmit` 當作主要檢核，因為 repo 內有歷史教材備份檔，常引用舊 contracts 或舊 auth。

## Render 驗證清單

V10.4C push 後請使用者在線上確認：

- migration log 出現 `0005_v10_order_cancellation_info`
- customer 送出訂單後，可在「我的訂單歷史」取消 `submitted` 訂單
- customer 無法取消已進入 `preparing/ready/completed` 的訂單
- staff 可在工作台取消 `submitted/preparing/ready` 訂單
- chef 看不到取消操作，或呼叫取消 API 回 `403`
- 取消後訂單顯示「已取消」，且不再出現下一步製作/完成按鈕

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

V10.4C 新增 migration。因為專案 migration runner 會依 journal 重跑 migration，`0005_v10_order_cancellation_info.sql` 必須保持 idempotent。

## 尚未做的後續項目

- V10.4C Render 線上驗證紀錄更新
- 訂單付款
- 訂單退款、重開訂單
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
3. 若接續 V10.4C，優先看 `shared/contracts.ts`、`shared/route-schemas.ts`、`db/schema.ts`、`store/Store.ts`、`store/pg/PgStore.ts`、`store/json/JsonFileStore.ts`、`backend.ts`、`frontend/src/App.tsx`。
4. 先完成本機 test/build/tsc/diff，再交給使用者做 Render 線上驗證。

## V10.4D 交接更新

- 使用者已回報 `V10.4C 訂單取消流程` Render 驗證成功。
- 使用者已回報「購物車舊版/已下架品項仍可看見並清空」小修正 Render 驗證成功。
- 本輪正在實作 `V10.4D 到店付款狀態`。

### V10.4D 範圍

- 新增 migration：`drizzle-v10/0006_v10_order_payment_status.sql`
- `orders` 新增：
  - `payment_status text not null default 'unpaid'`
  - `paid_by text null references user(id)`
  - `paid_at timestamp with time zone null`
- `Order` / `OrderResponse` 新增：
  - `paymentStatus`
  - `paidBy`
  - `paidAt`
- 新訂單預設 `unpaid`。
- customer 送出訂單後仍是 `unpaid`。
- `chef/owner/admin` 將訂單推進到 `ready` 時不改付款狀態。
- `staff/owner/admin` 執行 `ready -> completed` 時同步設為 `paid`，並記錄 `paidBy`、`paidAt`。
- `cancelled` 訂單不可付款；取消流程不新增付款狀態變更。
- 不新增獨立 payment endpoint，付款只透過完成取餐流程發生。

### V10.4D 本機驗證命令

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts tests/v10-order-cancellation.test.ts tests/v10-order-payment.test.ts
git diff --check
```

### V10.4D Render 驗證清單

- migration log 出現 `0006_v10_order_payment_status`。
- customer 送出訂單後，在歷史訂單看到 `未付款`。
- chef 推進到 `ready` 後仍是 `未付款`。
- staff 點「完成取餐並收款」後，訂單變成 `completed` 且顯示 `已付款`。
- customer 重新整理後，在歷史訂單看到 `已付款`。
- cancelled 訂單不會顯示收款操作。

## V10.4E 交接更新

- 使用者已回報 `V10.4D 到店付款狀態` Render 驗證成功。
- 本輪正在實作 `V10.4E 取餐叫號看板與顧客狀態提示`。
- 本輪不新增 migration，直接由 `orders.status === "ready"` 推導公開叫號資料。

### V10.4E 範圍

- 新增公開 API：`GET /api/orders/pickup-board`
- API 不需要登入，方便店面展示螢幕或顧客查看。
- API 只回傳 `ready` 訂單，依建立時間新到舊排序，最多 20 筆。
- API 只回傳公開欄位：`id`、`pickupCode`、`status`、`createdAt`、`createdAtTaipei`。
- 不回傳 `userId`、餐點內容、金額、備註、付款資訊。
- 前端新增公開「取餐叫號」區塊，提供手動重新整理。
- 顧客歷史訂單中，`ready` 訂單顯示「餐點已完成，請依取餐編號取餐」提示。

### V10.4E 本機驗證命令

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts tests/v10-order-cancellation.test.ts tests/v10-order-payment.test.ts tests/v10-pickup-board.test.ts
git diff --check
```

### V10.4E Render 驗證清單

- 未登入訪客也能看到「取餐叫號」區塊。
- customer 送出訂單後，看板不顯示該訂單。
- chef 將訂單推進到 `ready` 後，看板顯示該訂單取餐編號。
- customer 在「我的訂單歷史」看到 ready 取餐提示。
- staff 點「完成取餐並收款」後，看板移除該訂單。
- `GET /api/orders/pickup-board` 不回傳個資、備註、餐點、金額或付款資訊。

## V10.4F 交接更新

- 使用者已回報 `V10.4E 取餐叫號看板與顧客狀態提示` Render 驗證成功。
- 本輪正在實作 `V10.4F 即時感自動刷新`。
- 本輪不新增 migration、不導入 WebSocket、不改訂單狀態規則。

### V10.4F 範圍

- 新增自動刷新策略工具：`shared/auto-refresh.ts`
- 取餐叫號看板每 10 秒自動刷新。
- 已登入使用者每 15 秒自動刷新目前購物車與我的訂單歷史。
- `staff/chef/owner/admin` 每 10 秒自動刷新訂單工作台。
- admin RBAC 管理列表、角色申請列表、審計紀錄不自動刷新。
- 使用者正在送出訂單、清空購物車、更新訂單狀態或取消訂單時，polling 會跳過該輪，避免覆蓋操作中狀態。

### V10.4F 本機驗證命令

```bash
bun test
bun run build
bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts tests/v10-order-cancellation.test.ts tests/v10-order-payment.test.ts tests/v10-pickup-board.test.ts tests/v10-auto-refresh.test.ts
git diff --check
```

### V10.4F Render 驗證清單

- 未登入訪客停留在首頁，取餐叫號看板會自動刷新。
- customer 登入後，其他角色把訂單推進到 `ready`，顧客歷史訂單可在下一輪自動看到 ready 提示。
- chef/staff 工作台在其他人操作後會自動更新。
- staff 完成取餐並收款後，叫號看板在下一輪自動移除該訂單。
- 手動重新整理按鈕仍可正常使用。
## 最新交接補充：V10.4G 退款與取消訂單重開

- 使用者已回報 `V10.4F 即時感自動刷新` Render 驗證成功。
- 本輪實作 `V10.4G 退款與取消訂單重開`：
  - 新增 migration：`drizzle-v10/0007_v10_refund_reopen_info.sql`
  - `orders` 新增 `refund_reason`、`refunded_by`、`refunded_at`
  - `paymentStatus` 擴充為 `unpaid | paid | refunded`
  - 新增 `PATCH /api/orders/:id/refund`
  - 新增 `PATCH /api/orders/:id/reopen`
  - `staff/owner/admin` 可退款 `completed + paid` 訂單
  - `staff/owner/admin` 可將 `cancelled` 訂單重開為 `submitted`
  - `customer/chef` 不可退款或重開
  - 退款不改 `Order.status`，只把 `paymentStatus` 改為 `refunded`
  - 重開保留 items、total、customerNote、pickupCode，清空取消資訊
- 前端工作台新增「退款」與「重開訂單」操作，顧客歷史與工作台顯示退款資訊。
- 本輪驗證建議：
  - `bun test`
  - `bun run build`
  - `bunx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target esnext --jsx react-jsx --allowImportingTsExtensions backend.ts frontend/src/App.tsx tests/v10-menu-versioning.test.ts tests/v10-rbac.test.ts tests/v10-role-requests.test.ts tests/v10-admin-users.test.ts tests/v10-role-audit-logs.test.ts tests/v10-order-workbench.test.ts tests/v10-order-pickup-info.test.ts tests/v10-order-cancellation.test.ts tests/v10-order-payment.test.ts tests/v10-pickup-board.test.ts tests/v10-auto-refresh.test.ts tests/v10-refund-reopen.test.ts`
  - `git diff --check`
- Render 驗證清單：
  - migration log 出現 `0007_v10_refund_reopen_info`
  - staff 對 `completed + paid` 訂單退款後，顧客歷史訂單顯示 `已退款`
  - refunded 訂單不能再退款
  - staff 對 cancelled 訂單按「重開訂單」後，訂單回到工作台 submitted 狀態
  - chef 可繼續將重開訂單推進到 preparing/ready
  - customer/chef 看不到退款或重開操作
