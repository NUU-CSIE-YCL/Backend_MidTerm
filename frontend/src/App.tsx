import {
  Fragment,
  useEffect,
  useState,
  useMemo,
  type FormEvent,
} from "react";
import "./App.css";
import type {
  ApiDataResponse,
  MenuItem,
  Order,
  Role,
  SessionUser,
} from "../../shared/contracts.ts";
import { hasAnyRole } from "../../shared/guards.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const fallbackImageUrl =
  "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80";
const menuManagerRoles = ["owner", "admin"] as const satisfies readonly Role[];
const roleLabels: Record<Role, string> = {
  customer: "顧客",
  staff: "店員",
  chef: "廚房",
  owner: "店長",
  admin: "管理員",
};

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

interface MenuFormState {
  logical_id: string;
  name: string;
  price: string;
  category: string;
  description: string;
  image_url: string;
  change_reason: string;
}

function createEmptyMenuForm(): MenuFormState {
  return {
    logical_id: "",
    name: "",
    price: "",
    category: "",
    description: "",
    image_url: "",
    change_reason: "",
  };
}

function createMenuFormFromItem(item: MenuItem): MenuFormState {
  return {
    logical_id: item.logicalId,
    name: item.name,
    price: String(item.price),
    category: item.category,
    description: item.description,
    image_url: item.image_url,
    change_reason: "",
  };
}

function formatVersionTime(value?: string): string {
  if (!value) return "未記錄";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MenuImage({
  src,
  alt,
  mode = "card",
}: {
  src: string;
  alt: string;
  mode?: "card" | "preview";
}) {
  const imageUrl = src.trim();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  const isShowingFallback = imageUrl.length === 0 || hasError;
  const displayedImageUrl = isShowingFallback ? fallbackImageUrl : imageUrl;
  const noticeTitle =
    imageUrl.length === 0
      ? "尚未輸入圖片 URL"
      : "圖片載入失敗，顯示備用圖";
  const noticeHint =
    mode === "preview"
      ? "請使用可公開存取的圖片直連網址。"
      : "原始圖片無法載入。";

  return (
    <div className="relative h-full w-full bg-base-300">
      <img
        src={displayedImageUrl}
        alt={alt}
        className="h-full w-full object-cover"
        loading={mode === "card" ? "lazy" : "eager"}
        onError={() => {
          setHasError(true);
        }}
      />
      {isShowingFallback ? (
        <div className="absolute inset-x-2 bottom-2 rounded bg-base-100/95 p-2 text-xs shadow">
          <p className="font-semibold text-warning">{noticeTitle}</p>
          <p className="opacity-70">{noticeHint}</p>
          {imageUrl ? (
            <a
              className="link link-primary"
              href={imageUrl}
              rel="noreferrer"
              target="_blank"
            >
              開啟原圖
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuImagePreview({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">圖片預覽</span>
        <span className="text-xs opacity-70">支援 https 或站內路徑</span>
      </div>
      <div className="h-36 overflow-hidden rounded bg-base-300">
        <MenuImage src={imageUrl} alt="菜單圖片預覽" mode="preview" />
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<
    Record<string, number>
  >({});
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [menuForm, setMenuForm] = useState<MenuFormState>(() =>
    createEmptyMenuForm(),
  );
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [isSavingMenu, setIsSavingMenu] = useState(false);
  const [retiringMenuId, setRetiringMenuId] = useState<string | null>(null);
  const [menuAdminMessage, setMenuAdminMessage] = useState("");
  const [menuAdminError, setMenuAdminError] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(
    null,
  );
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [historyByLogicalId, setHistoryByLogicalId] = useState<
    Record<string, MenuItem[]>
  >({});

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<string, number>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartTotal(0);
    setIsCartOpen(false);
  }

  async function fetchMenuItems(): Promise<MenuItem[]> {
    const response = await fetch(buildApiUrl("/api/menu"));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  async function refreshMenu(): Promise<MenuItem[]> {
    const fetchedItems = await fetchMenuItems();
    setItems(fetchedItems);
    return fetchedItems;
  }

  async function loadCurrentOrder(): Promise<Order | null> {
    const response = await fetch(buildApiUrl("/api/orders/current"), {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Load current order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order | null>;
    const currentOrder = payload?.data;

    if (!currentOrder) {
      resetCartState();
      return null;
    }

    setOrderId(currentOrder.id);
    syncCartFromOrder(currentOrder);
    return currentOrder;
  }

  async function loadOrderHistory(): Promise<void> {
    setHistoryLoading(true);

    try {
      const response = await fetch(buildApiUrl("/api/orders/history"), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Load history failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order[]>;
      setHistoryOrders(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshUserOrders(): Promise<void> {
    await Promise.all([loadCurrentOrder(), loadOrderHistory()]);
  }

  useEffect(() => {
    let mounted = true;

    // 從 app-level session endpoint 恢復登入狀態，包含 RBAC roles。
    async function restoreSession() {
      try {
        const res = await fetch(buildApiUrl("/api/users/me"), {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { user?: SessionUser } | null;
          if (data?.user && mounted) {
            setUser(data.user);
          }
        }
      } catch {
        // session 無法取得，維持未登入狀態
      }
    }
    void restoreSession();

    async function loadInitialMenu() {
      try {
        const fetchedItems = await fetchMenuItems();

        if (mounted) {
          setItems(fetchedItems);
        }
      } catch (fetchError) {
        if (mounted) {
          setError("無法取得菜單資料，請稍後再試。");
          console.error(fetchError);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialMenu();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setHistoryOrders([]);
      setIsCartOpen(false);
      resetCartState();
      return;
    }

    void refreshUserOrders().catch((refreshError) => {
      setActionError("載入使用者訂單資料失敗，請稍後再試。");
      console.error(refreshError);
    });
  }, [user]);

  const grouped = useMemo(() => {
    const groupedItems = items.reduce(
      (acc, item) => {
        const category = item?.category || "未分類";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );

    const categories = Object.keys(groupedItems).sort((a, b) =>
      a.localeCompare(b, "zh-Hant"),
    );

    return { groupedItems, categories };
  }, [items]);

  const canManageMenu = user ? hasAnyRole(user, menuManagerRoles) : false;

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = itemIdText;
        const item = itemById.get(itemId);
        if (!item || qty <= 0) {
          return null;
        }

        return {
          itemId,
          qty,
          item,
          subtotal: item.price * qty,
        };
      })
      .filter((entry) => entry !== null);
  }, [cartQtyByItemId, items]);

  async function ensureOrder(): Promise<number> {
    if (!user) {
      throw new Error("Please login first");
    }

    if (orderId !== null) {
      return orderId;
    }

    const response = await fetch(buildApiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        setUser(null);
        setAuthError("登入狀態已失效，請重新登入。");
        setActionError("登入狀態已失效，請重新登入。");
        setHistoryOrders([]);
        resetCartState();
        throw new Error(`Auth expired: HTTP ${response.status}`);
      }

      throw new Error(`Create order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const createdOrderId = payload?.data?.id;

    if (!createdOrderId) {
      throw new Error("Create order failed: invalid payload");
    }

    setOrderId(createdOrderId);
    return createdOrderId;
  }

  async function handleGoogleSignIn(): Promise<void> {
    setAuthError("");
    setIsGoogleSigningIn(true);
    try {
      // Better Auth 的 social sign-in 入口是 POST。
      // 先向後端取得導向 Google 同意頁的 URL，再切換瀏覽器位置。
      const callbackURL = window.location.origin;
      const response = await fetch(buildApiUrl("/api/auth/sign-in/social"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: "google", callbackURL }),
      });

      if (!response.ok) {
        throw new Error(`Google sign-in failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload?.url) {
        throw new Error("Google sign-in failed: missing redirect URL");
      }

      window.location.href = payload.url;
    } catch {
      setAuthError("Google 登入啟動失敗，請稍後再試。");
      setIsGoogleSigningIn(false);
    }
  }

  async function handleLogout(): Promise<void> {
    // 使用 /api/sign-out（server-side proxy），避免 Better Auth CSRF 驗證
    // 因 BETTER_AUTH_URL 設定錯誤造成的假登出（403 被吃掉）。
    // 若登出失敗，顯示錯誤並中止，確保使用者知道 session 仍存在。
    try {
      const res = await fetch(buildApiUrl("/api/sign-out"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setActionError(
          `登出失敗（HTTP ${res.status}），請重試或手動清除瀏覽器 Cookie。`,
        );
        return;
      }
    } catch {
      setActionError("登出時發生網路錯誤，請重試。");
      return;
    }
    setUser(null);
    setAuthError("");
    setActionError("");
    resetCartState();
  }

  function updateMenuFormField(field: keyof MenuFormState, value: string): void {
    setMenuForm((current) => ({ ...current, [field]: value }));
  }

  function resetMenuEditor(): void {
    setEditingMenuId(null);
    setMenuForm(createEmptyMenuForm());
  }

  function startEditMenuItem(item: MenuItem): void {
    setEditingMenuId(item.id);
    setMenuForm(createMenuFormFromItem(item));
    setMenuAdminError("");
    setMenuAdminMessage("");
  }

  async function loadMenuHistory(
    menuId: string,
    force = false,
  ): Promise<void> {
    const currentItem = items.find(
      (item) => item.logicalId === menuId || item.id === menuId,
    );
    const logicalId = currentItem?.logicalId ?? menuId.split("-")[0] ?? menuId;

    if (!force && historyByLogicalId[logicalId]) {
      setExpandedHistoryId(logicalId);
      return;
    }

    setHistoryLoadingId(logicalId);
    setMenuAdminError("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/menu/${encodeURIComponent(menuId)}/history`),
      );
      if (!response.ok) {
        throw new Error(`Load menu history failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
      setHistoryByLogicalId((current) => ({
        ...current,
        [logicalId]: Array.isArray(payload?.data) ? payload.data : [],
      }));
      setExpandedHistoryId(logicalId);
    } catch (historyError) {
      setMenuAdminError("讀取版本歷史失敗，請稍後再試。");
      console.error(historyError);
    } finally {
      setHistoryLoadingId(null);
    }
  }

  function toggleMenuHistory(item: MenuItem): void {
    if (expandedHistoryId === item.logicalId) {
      setExpandedHistoryId(null);
      return;
    }

    void loadMenuHistory(item.logicalId);
  }

  async function handleSaveMenuItem(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!user) {
      setMenuAdminError("請先登入後再管理菜單。");
      return;
    }

    const price = Number(menuForm.price);
    if (!Number.isInteger(price) || price < 0) {
      setMenuAdminError("價格必須是 0 以上的整數。");
      return;
    }

    const isEditing = editingMenuId !== null;
    const payload: Record<string, string | number> = {
      name: menuForm.name.trim(),
      price,
      category: menuForm.category.trim(),
      description: menuForm.description.trim(),
      image_url: menuForm.image_url.trim(),
      change_reason:
        menuForm.change_reason.trim() ||
        (isEditing ? "網站管理介面更新" : "網站管理介面新增"),
    };

    if (!isEditing && menuForm.logical_id.trim()) {
      payload.logical_id = menuForm.logical_id.trim();
    }

    setIsSavingMenu(true);
    setMenuAdminError("");
    setMenuAdminMessage("");

    try {
      const response = await fetch(
        buildApiUrl(isEditing ? `/api/menu/${editingMenuId}` : "/api/menu"),
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          throw new Error("請重新登入後再管理菜單。");
        }

        if (response.status === 403) {
          throw new Error("目前角色沒有管理菜單的權限。");
        }

        throw new Error(`Save menu item failed: HTTP ${response.status}`);
      }

      const result = (await response.json()) as ApiDataResponse<MenuItem>;
      const savedItem = result.data;

      await refreshMenu();
      setHistoryByLogicalId({});
      resetMenuEditor();
      setMenuAdminMessage(
        isEditing
          ? `${savedItem.name} 已建立新版 ${savedItem.id}`
          : `${savedItem.name} 已新增為 ${savedItem.id}`,
      );

      if (isEditing) {
        await loadMenuHistory(savedItem.logicalId, true);
      }
    } catch (saveError) {
      setMenuAdminError(
        saveError instanceof Error
          ? saveError.message
          : "儲存菜單失敗，請稍後再試。",
      );
      console.error(saveError);
    } finally {
      setIsSavingMenu(false);
    }
  }

  async function retireMenuItem(item: MenuItem): Promise<void> {
    if (!user) {
      setMenuAdminError("請先登入後再管理菜單。");
      return;
    }

    const confirmed = window.confirm(`確定要下架「${item.name}」嗎？`);
    if (!confirmed) return;

    setRetiringMenuId(item.id);
    setMenuAdminError("");
    setMenuAdminMessage("");

    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}`), {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          throw new Error("請重新登入後再管理菜單。");
        }

        if (response.status === 403) {
          throw new Error("目前角色沒有管理菜單的權限。");
        }

        throw new Error(`Retire menu item failed: HTTP ${response.status}`);
      }

      await refreshMenu();
      setHistoryByLogicalId({});
      if (expandedHistoryId === item.logicalId) {
        setExpandedHistoryId(null);
      }
      setMenuAdminMessage(`${item.name} 已從目前菜單下架`);

      if (editingMenuId === item.id) {
        resetMenuEditor();
      }
    } catch (retireError) {
      setMenuAdminError(
        retireError instanceof Error
          ? retireError.message
          : "下架菜單失敗，請稍後再試。",
      );
      console.error(retireError);
    } finally {
      setRetiringMenuId(null);
    }
  }

  async function addToCart(item: MenuItem): Promise<void> {
    setActionError("");
    setActiveItemId(item.id);

    try {
      if (!user) {
        throw new Error("Please login first");
      }

      const patchOrderItem = async (
        targetOrderId: number,
        qty: number,
      ): Promise<Order> => {
        const response = await fetch(
          buildApiUrl(`/api/orders/${targetOrderId}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              itemId: item.id,
              qty,
            }),
          },
        );

        if (!response.ok) {
          if (response.status === 409) {
            throw new Error("MENU_ITEM_NOT_CURRENT");
          }

          throw new Error(`Update order failed: HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ApiDataResponse<Order>;
        const updatedOrder = payload?.data;

        if (!updatedOrder) {
          throw new Error("Update order failed: invalid payload");
        }

        return updatedOrder;
      };

      const targetOrderId = await ensureOrder();
      const currentQty = cartQtyByItemId[item.id] ?? 0;
      const nextQty = currentQty + 1;

      try {
        const updatedOrder = await patchOrderItem(targetOrderId, nextQty);
        syncCartFromOrder(updatedOrder);
      } catch (firstTryError) {
        const firstTryMessage =
          firstTryError instanceof Error ? firstTryError.message : "";

        // 換帳號或舊訂單失效時，重新同步目前使用者訂單後再重試一次。
        if (
          firstTryMessage.includes("HTTP 403") ||
          firstTryMessage.includes("HTTP 404")
        ) {
          setOrderId(null);

          const recoveredOrder = await loadCurrentOrder();
          const retryOrderId = recoveredOrder?.id ?? (await ensureOrder());
          const recoveredQty =
            recoveredOrder?.items.find(
              (orderItem) => orderItem.item.id === item.id,
            )?.qty ?? 0;
          const retryQty = recoveredQty + 1;

          const retriedOrder = await patchOrderItem(retryOrderId, retryQty);
          syncCartFromOrder(retriedOrder);
          return;
        }

        throw firstTryError;
      }
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        return;
      }

      if (
        cartError instanceof Error &&
        cartError.message === "MENU_ITEM_NOT_CURRENT"
      ) {
        setActionError("菜單品項已更新，請重新整理頁面後再加入購物車。");
        return;
      }

      if (user) {
        try {
          const recoveredOrder = await loadCurrentOrder();
          const recoveredQty = recoveredOrder?.items.find(
            (orderItem) => orderItem.item.id === item.id,
          )?.qty;

          if (typeof recoveredQty === "number" && recoveredQty > 0) {
            return;
          }
        } catch (recoveryError) {
          console.error(recoveryError);
        }
      }

      setActionError("加入購物車失敗，請稍後再試。");
      console.error(cartError);
    } finally {
      setActiveItemId(null);
    }
  }

  async function clearCart(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsClearingCart(true);

    try {
      for (const detail of cartDetails) {
        const response = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId: detail.itemId,
            qty: 0,
          }),
        });

        if (!response.ok) {
          throw new Error(`Clear cart failed: HTTP ${response.status}`);
        }
      }

      setCartQtyByItemId({});
      setCartTotal(0);
    } catch (clearError) {
      setActionError("清空購物車失敗，請稍後再試。");
      console.error(clearError);
    } finally {
      setIsClearingCart(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsSubmittingOrder(true);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${orderId}/submit`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          setActionError(
            "購物車中有品項已更新，請重新整理頁面後重新加入購物車。",
          );
          await loadCurrentOrder();
          return;
        }

        throw new Error(`Submit order failed: HTTP ${response.status}`);
      }

      resetCartState();
      setIsCartOpen(false);
      await loadOrderHistory();
    } catch (submitError) {
      setActionError("送出訂單失敗，請稍後再試。");
      console.error(submitError);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error m-4">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg flex-col items-stretch gap-2 md:flex-row md:items-center">
        <div className="flex-1 w-full md:w-auto">
          <a className="btn btn-ghost normal-case text-2xl">
            🌅 聯大資工早餐菜單
          </a>
        </div>
        <div className="flex-none w-full md:w-auto">
          <div className="flex flex-wrap gap-2 items-center md:justify-end">
            <div className="badge badge-outline">
              {user ? `已登入 ${user.name}` : "尚未登入"}
            </div>
            {user ? (
              <div className="badge badge-neutral">
                角色 {user.roles.map((role) => roleLabels[role]).join("、")}
              </div>
            ) : null}
            <div className="badge badge-primary">
              {items.length} 個品項・{grouped.categories.length} 類
            </div>
            <div className="badge badge-secondary">
              購物車 {cartItemCount} 件
            </div>
            <div className="badge badge-accent">總計 ${cartTotal}</div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setIsCartOpen(true);
              }}
              disabled={!user}
            >
              購物車明細
            </button>
            {user ? (
              <button
                className="btn btn-sm"
                onClick={() => {
                  void handleLogout();
                }}
              >
                登出
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="container mx-auto p-6">
        {!user ? (
          <section className="max-w-xl mx-auto card bg-base-100 shadow-md mb-8">
            <div className="card-body">
              <h2 className="card-title">使用 Google 帳號登入</h2>
              <p className="text-sm opacity-70">
                點擊下方按鈕，使用您的 Google 帳號登入後即可開始點餐。
              </p>
              {authError ? (
                <div className="alert alert-error">
                  <span>{authError}</span>
                </div>
              ) : null}
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void handleGoogleSignIn();
                }}
                disabled={isGoogleSigningIn}
              >
                {isGoogleSigningIn ? "導向 Google 中..." : "使用 Google 登入"}
              </button>
            </div>
          </section>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <span>{actionError}</span>
          </div>
        ) : null}

        {canManageMenu ? (
          <section className="mb-8 rounded-lg border border-base-300 bg-base-100 shadow-sm">
            <div className="border-b border-base-300 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">菜單管理</h2>
                  <p className="text-sm opacity-70">
                    owner/admin 可新增、建立新版或下架目前菜單。
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={resetMenuEditor}
                  type="button"
                >
                  新增模式
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
              <form
                className="space-y-3 rounded-lg border border-base-300 bg-base-200 p-4"
                onSubmit={(event) => {
                  void handleSaveMenuItem(event);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {editingMenuId ? "編輯品項" : "新增品項"}
                  </h3>
                  {editingMenuId ? (
                    <span className="badge badge-info">{editingMenuId}</span>
                  ) : null}
                </div>

                {menuAdminMessage ? (
                  <div className="alert alert-success py-2">
                    <span>{menuAdminMessage}</span>
                  </div>
                ) : null}
                {menuAdminError ? (
                  <div className="alert alert-error py-2">
                    <span>{menuAdminError}</span>
                  </div>
                ) : null}

                <label className="form-control">
                  <span className="label-text">顯示編號</span>
                  <input
                    className="input input-bordered input-sm"
                    disabled={editingMenuId !== null}
                    onChange={(event) =>
                      updateMenuFormField("logical_id", event.target.value)
                    }
                    placeholder="留空自動產生，例如 099"
                    value={menuForm.logical_id}
                  />
                </label>

                <label className="form-control">
                  <span className="label-text">品項名稱</span>
                  <input
                    className="input input-bordered input-sm"
                    onChange={(event) =>
                      updateMenuFormField("name", event.target.value)
                    }
                    required
                    value={menuForm.name}
                  />
                </label>

                <label className="form-control">
                  <span className="label-text">價格</span>
                  <input
                    className="input input-bordered input-sm"
                    min="0"
                    onChange={(event) =>
                      updateMenuFormField("price", event.target.value)
                    }
                    required
                    type="number"
                    value={menuForm.price}
                  />
                </label>

                <label className="form-control">
                  <span className="label-text">分類</span>
                  <input
                    className="input input-bordered input-sm"
                    onChange={(event) =>
                      updateMenuFormField("category", event.target.value)
                    }
                    required
                    value={menuForm.category}
                  />
                </label>

                <label className="form-control">
                  <span className="label-text">圖片 URL</span>
                  <input
                    className="input input-bordered input-sm"
                    onChange={(event) =>
                      updateMenuFormField("image_url", event.target.value)
                    }
                    required
                    value={menuForm.image_url}
                  />
                </label>

                <MenuImagePreview imageUrl={menuForm.image_url} />

                <label className="form-control">
                  <span className="label-text">描述</span>
                  <textarea
                    className="textarea textarea-bordered min-h-20"
                    onChange={(event) =>
                      updateMenuFormField("description", event.target.value)
                    }
                    required
                    value={menuForm.description}
                  />
                </label>

                <label className="form-control">
                  <span className="label-text">變更原因</span>
                  <input
                    className="input input-bordered input-sm"
                    onChange={(event) =>
                      updateMenuFormField("change_reason", event.target.value)
                    }
                    placeholder={
                      editingMenuId ? "例如：原物料調價" : "例如：新增季節品項"
                    }
                    value={menuForm.change_reason}
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    className="btn btn-primary btn-sm flex-1"
                    disabled={isSavingMenu}
                    type="submit"
                  >
                    {isSavingMenu
                      ? "儲存中..."
                      : editingMenuId
                        ? "建立新版"
                        : "新增品項"}
                  </button>
                  {editingMenuId ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={resetMenuEditor}
                      type="button"
                    >
                      取消
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="overflow-x-auto rounded-lg border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>品項</th>
                      <th>版本</th>
                      <th>價格</th>
                      <th>狀態</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const isExpanded = expandedHistoryId === item.logicalId;
                      const versions = historyByLogicalId[item.logicalId] ?? [];

                      return (
                        <Fragment key={item.id}>
                          <tr>
                            <td>
                              <div className="font-semibold">{item.name}</div>
                              <div className="text-xs opacity-70">
                                {item.logicalId}・{item.category}
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                <span className="badge badge-outline">
                                  {item.id}
                                </span>
                                <span className="badge badge-info">
                                  v{item.version}
                                </span>
                              </div>
                            </td>
                            <td>${item.price}</td>
                            <td>
                              {item.version > 1 ? (
                                <span className="badge badge-warning">
                                  已調整
                                </span>
                              ) : (
                                <span className="badge badge-success">
                                  現行
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="flex justify-end gap-2">
                                <button
                                  className="btn btn-xs btn-outline"
                                  onClick={() => toggleMenuHistory(item)}
                                  type="button"
                                >
                                  {historyLoadingId === item.logicalId
                                    ? "讀取中"
                                    : isExpanded
                                      ? "收合"
                                      : "歷史"}
                                </button>
                                <button
                                  className="btn btn-xs"
                                  onClick={() => startEditMenuItem(item)}
                                  type="button"
                                >
                                  編輯
                                </button>
                                <button
                                  className="btn btn-xs btn-error btn-outline"
                                  disabled={retiringMenuId === item.id}
                                  onClick={() => {
                                    void retireMenuItem(item);
                                  }}
                                  type="button"
                                >
                                  {retiringMenuId === item.id
                                    ? "下架中"
                                    : "下架"}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr>
                              <td colSpan={5}>
                                {versions.length === 0 ? (
                                  <div className="text-sm opacity-70">
                                    尚無版本歷史資料。
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {versions.map((version) => (
                                      <div
                                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-base-200 p-2 text-sm"
                                        key={version.id}
                                      >
                                        <div>
                                          <span className="font-semibold">
                                            {version.id}
                                          </span>
                                          <span className="ml-2 opacity-70">
                                            ${version.price}・
                                            {formatVersionTime(
                                              version.createdAt,
                                            )}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {version.isCurrentVersion ? (
                                            <span className="badge badge-success">
                                              current
                                            </span>
                                          ) : null}
                                          {version.changeReason ? (
                                            <span className="badge badge-outline">
                                              {version.changeReason}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {items.length === 0 ? (
          <div className="alert alert-info">
            <span>目前沒有菜單資料</span>
          </div>
        ) : (
          grouped.categories.map((category) => (
            <div key={category} className="mb-8">
              <h2 className="text-3xl font-bold mb-4 text-primary border-b-2 border-primary pb-2">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(grouped.groupedItems[category] || []).map((item) => (
                  <div
                    key={item.id}
                    className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow"
                  >
                    <figure className="h-44 overflow-hidden bg-base-300">
                      <MenuImage
                        src={item.image_url}
                        alt={item.name}
                      />
                    </figure>
                    <div className="card-body">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="card-title text-lg">{item.name}</h3>
                        <div className="flex flex-wrap justify-end gap-1">
                          <span className="badge badge-outline">
                            {item.logicalId}
                          </span>
                          <span className="badge badge-info">
                            v{item.version}
                          </span>
                          {item.version > 1 ? (
                            <span className="badge badge-warning">
                              已調整
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-sm opacity-80 line-clamp-2 min-h-[2.75rem]">
                        {item.description}
                      </p>
                      <div className="card-actions justify-between items-center">
                        <span className="text-xl font-bold text-success">
                          ${item.price}
                        </span>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            void addToCart(item);
                          }}
                          disabled={activeItemId === item.id}
                        >
                          {activeItemId === item.id
                            ? "加入中..."
                            : `加入購物車${cartQtyByItemId[item.id] ? ` (${cartQtyByItemId[item.id]})` : ""}`}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {user ? (
          <section className="mt-10">
            <h2 className="text-2xl font-bold mb-4">我的訂單歷史</h2>
            {historyLoading ? (
              <div className="alert">
                <span>讀取中...</span>
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="alert alert-info">
                <span>目前尚無歷史訂單。</span>
              </div>
            ) : (
              <div className="space-y-3">
                {historyOrders.map((order) => (
                  <article
                    key={order.id}
                    className="card bg-base-100 shadow-sm border border-base-300"
                  >
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold">訂單 #{order.id}</h3>
                        <span className="badge badge-success">已送出</span>
                      </div>
                      <p className="text-sm opacity-70">
                        建立時間：{order.createdAt}
                      </p>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        {order.items.map((detail) => (
                          <li key={`${order.id}-${detail.item.id}`}>
                            {detail.item.name} x {detail.qty}
                          </li>
                        ))}
                      </ul>
                      <p className="font-bold text-right">
                        總額 ${order.total}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {user && isCartOpen ? (
        <>
          <button
            className="fixed inset-0 bg-black/35"
            aria-label="close cart drawer"
            onClick={() => {
              setIsCartOpen(false);
            }}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-base-100 shadow-2xl z-10 flex flex-col">
            <div className="p-4 border-b border-base-300 flex items-center justify-between">
              <h2 className="text-xl font-bold">購物車明細</h2>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setIsCartOpen(false);
                }}
              >
                關閉
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {cartDetails.length === 0 ? (
                <div className="alert">
                  <span>購物車目前是空的。</span>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cartDetails.map((detail) => (
                    <li
                      key={detail.itemId}
                      className="p-3 rounded-lg bg-base-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold">{detail.item.name}</p>
                        <p className="text-sm opacity-70">
                          單價 ${detail.item.price} x {detail.qty}
                        </p>
                      </div>
                      <p className="font-bold">${detail.subtotal}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-base-300 space-y-3">
              <div className="flex items-center justify-between font-semibold">
                <span>總件數</span>
                <span>{cartItemCount}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>總金額</span>
                <span>${cartTotal}</span>
              </div>
              <button
                className="btn btn-error btn-outline w-full"
                onClick={() => {
                  void clearCart();
                }}
                disabled={cartDetails.length === 0 || isClearingCart}
              >
                {isClearingCart ? "清空中..." : "清空購物車"}
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void submitOrder();
                }}
                disabled={cartDetails.length === 0 || isSubmittingOrder}
              >
                {isSubmittingOrder ? "送出中..." : "送出訂單"}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
