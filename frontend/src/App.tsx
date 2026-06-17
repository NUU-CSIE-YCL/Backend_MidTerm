import {
  Fragment,
  useEffect,
  useState,
  useMemo,
  type FormEvent,
} from "react";
import "./App.css";
import type {
  AdminUser,
  ApiDataResponse,
  MenuItem,
  Order,
  OrderStatus,
  RequestableRole,
  Role,
  RoleAuditAction,
  RoleAuditLog,
  RoleRequest,
  RoleRequestStatus,
  SessionUser,
} from "../../shared/contracts.ts";
import { hasAnyRole, normalizeRoles } from "../../shared/guards.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const fallbackImageUrl =
  "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80";
const menuManagerRoles = ["owner", "admin"] as const satisfies readonly Role[];
const adminRoles = ["admin"] as const satisfies readonly Role[];
const orderViewerRoles = [
  "staff",
  "chef",
  "owner",
  "admin",
] as const satisfies readonly Role[];
const kitchenWorkflowRoles = ["chef", "owner", "admin"] as const satisfies readonly Role[];
const counterWorkflowRoles = ["staff", "owner", "admin"] as const satisfies readonly Role[];
const orderCancellationRoles = ["staff", "owner", "admin"] as const satisfies readonly Role[];
const roleOptions = [
  "customer",
  "staff",
  "chef",
  "owner",
  "admin",
] as const satisfies readonly Role[];
const requestableRoles = ["staff", "chef"] as const satisfies readonly RequestableRole[];
const roleLabels: Record<Role, string> = {
  customer: "顧客",
  staff: "店員",
  chef: "廚房",
  owner: "店長",
  admin: "管理員",
};
const requestableRoleLabels: Record<RequestableRole, string> = {
  staff: "店員",
  chef: "廚房",
};
const roleRequestStatusLabels: Record<RoleRequestStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已拒絕",
};
const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "購物車",
  submitted: "等待處理",
  preparing: "製作中",
  ready: "等待取餐",
  completed: "已完成",
  cancelled: "已取消",
};
const roleAuditActionLabels: Record<RoleAuditAction, string> = {
  role_request_approved: "申請核准",
  role_request_rejected: "申請拒絕",
  admin_roles_updated: "直接更新",
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

type AppOrder = Order & {
  pickupCode: string;
};

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

function roleRequestStatusBadgeClass(status: RoleRequestStatus): string {
  switch (status) {
    case "approved":
      return "badge badge-success";
    case "rejected":
      return "badge badge-error";
    case "pending":
    default:
      return "badge badge-warning";
  }
}

function orderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "submitted":
      return "badge badge-info";
    case "preparing":
      return "badge badge-warning";
    case "ready":
      return "badge badge-success";
    case "completed":
      return "badge badge-neutral";
    case "cancelled":
      return "badge badge-error";
    case "pending":
    default:
      return "badge badge-outline";
  }
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
  const [historyOrders, setHistoryOrders] = useState<AppOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [workbenchOrders, setWorkbenchOrders] = useState<AppOrder[]>([]);
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState("");
  const [updatingWorkbenchOrderId, setUpdatingWorkbenchOrderId] = useState<
    number | null
  >(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<number | null>(null);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<
    Record<string, number>
  >({});
  const [cartItemSnapshotById, setCartItemSnapshotById] = useState<
    Record<string, MenuItem>
  >({});
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [customerNote, setCustomerNote] = useState("");
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
  const [roleRequestForm, setRoleRequestForm] = useState<{
    requestedRole: RequestableRole;
    reason: string;
  }>({
    requestedRole: "staff",
    reason: "",
  });
  const [myRoleRequests, setMyRoleRequests] = useState<RoleRequest[]>([]);
  const [isLoadingMyRoleRequests, setIsLoadingMyRoleRequests] = useState(false);
  const [isSubmittingRoleRequest, setIsSubmittingRoleRequest] = useState(false);
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [roleRequestError, setRoleRequestError] = useState("");
  const [adminRoleRequests, setAdminRoleRequests] = useState<RoleRequest[]>([]);
  const [adminRoleRequestFilter, setAdminRoleRequestFilter] = useState<
    RoleRequestStatus | "all"
  >("pending");
  const [isLoadingAdminRoleRequests, setIsLoadingAdminRoleRequests] =
    useState(false);
  const [reviewingRoleRequestId, setReviewingRoleRequestId] = useState<
    number | null
  >(null);
  const [reviewNoteByRequestId, setReviewNoteByRequestId] = useState<
    Record<number, string>
  >({});
  const [adminRoleRequestMessage, setAdminRoleRequestMessage] = useState("");
  const [adminRoleRequestError, setAdminRoleRequestError] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [savingAdminUserId, setSavingAdminUserId] = useState<string | null>(
    null,
  );
  const [rolesByUserId, setRolesByUserId] = useState<Record<string, Role[]>>(
    {},
  );
  const [adminUsersMessage, setAdminUsersMessage] = useState("");
  const [adminUsersError, setAdminUsersError] = useState("");
  const [roleAuditLogs, setRoleAuditLogs] = useState<RoleAuditLog[]>([]);
  const [roleAuditActionFilter, setRoleAuditActionFilter] = useState<
    RoleAuditAction | "all"
  >("all");
  const [isLoadingRoleAuditLogs, setIsLoadingRoleAuditLogs] = useState(false);
  const [roleAuditLogsError, setRoleAuditLogsError] = useState("");

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<string, number>,
    );
    const nextItemSnapshotById = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.item;
        return acc;
      },
      {} as Record<string, MenuItem>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartItemSnapshotById(nextItemSnapshotById);
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartItemSnapshotById({});
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

      const payload = (await response.json()) as ApiDataResponse<AppOrder[]>;
      setHistoryOrders(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadWorkbenchOrders(): Promise<void> {
    if (!user || !hasAnyRole(user, orderViewerRoles)) return;

    setWorkbenchLoading(true);
    try {
      const response = await fetch(buildApiUrl("/api/orders/workbench"), {
        credentials: "include",
      });

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再查看訂單工作台。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有查看訂單工作台的權限。");
      }

      if (!response.ok) {
        throw new Error(`Load workbench orders failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<AppOrder[]>;
      setWorkbenchOrders(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setWorkbenchLoading(false);
    }
  }

  async function refreshUserOrders(): Promise<void> {
    await Promise.all([loadCurrentOrder(), loadOrderHistory()]);
  }

  async function refreshCurrentUser(): Promise<SessionUser | null> {
    const response = await fetch(buildApiUrl("/api/users/me"), {
      credentials: "include",
    });

    if (response.status === 401) {
      setUser(null);
      return null;
    }

    if (!response.ok) {
      throw new Error(`Load current user failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { user?: SessionUser } | null;
    const currentUser = payload?.user ?? null;
    setUser(currentUser);
    return currentUser;
  }

  async function loadMyRoleRequests(): Promise<void> {
    if (!user) return;

    setIsLoadingMyRoleRequests(true);
    try {
      const response = await fetch(buildApiUrl("/api/users/me/role-requests"), {
        credentials: "include",
      });

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再查看角色申請。");
      }

      if (!response.ok) {
        throw new Error(`Load role requests failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<RoleRequest[]>;
      setMyRoleRequests(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setIsLoadingMyRoleRequests(false);
    }
  }

  async function loadAdminRoleRequests(
    status: RoleRequestStatus | "all" = adminRoleRequestFilter,
  ): Promise<void> {
    if (!user || !hasAnyRole(user, adminRoles)) return;

    setIsLoadingAdminRoleRequests(true);
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/role-requests?status=${status}`),
        {
          credentials: "include",
        },
      );

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再查看角色申請審核。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有審核角色申請的權限。");
      }

      if (!response.ok) {
        throw new Error(
          `Load admin role requests failed: HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as ApiDataResponse<RoleRequest[]>;
      setAdminRoleRequests(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setIsLoadingAdminRoleRequests(false);
    }
  }

  async function loadAdminUsers(): Promise<void> {
    if (!user || !hasAnyRole(user, adminRoles)) return;

    setIsLoadingAdminUsers(true);
    try {
      const response = await fetch(buildApiUrl("/api/admin/users"), {
        credentials: "include",
      });

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再查看使用者角色。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有管理使用者的權限。");
      }

      if (!response.ok) {
        throw new Error(`Load admin users failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<AdminUser[]>;
      const users = Array.isArray(payload?.data) ? payload.data : [];
      setAdminUsers(users);
      setRolesByUserId(
        users.reduce(
          (acc, adminUser) => {
            acc[adminUser.id] = normalizeRoles(adminUser.roles);
            return acc;
          },
          {} as Record<string, Role[]>,
        ),
      );
    } finally {
      setIsLoadingAdminUsers(false);
    }
  }

  async function loadRoleAuditLogs(
    action: RoleAuditAction | "all" = roleAuditActionFilter,
  ): Promise<void> {
    if (!user || !hasAnyRole(user, adminRoles)) return;

    setIsLoadingRoleAuditLogs(true);
    try {
      const searchParams = new URLSearchParams();
      if (action !== "all") {
        searchParams.set("action", action);
      }
      const query = searchParams.toString();
      const response = await fetch(
        buildApiUrl(`/api/admin/role-audit-logs${query ? `?${query}` : ""}`),
        {
          credentials: "include",
        },
      );

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再查看角色異動紀錄。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有查看角色異動紀錄的權限。");
      }

      if (!response.ok) {
        throw new Error(`Load role audit logs failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<
        RoleAuditLog[]
      >;
      setRoleAuditLogs(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setIsLoadingRoleAuditLogs(false);
    }
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
      setWorkbenchOrders([]);
      setMyRoleRequests([]);
      setAdminRoleRequests([]);
      setAdminUsers([]);
      setRoleAuditLogs([]);
      setRolesByUserId({});
      setRoleRequestMessage("");
      setRoleRequestError("");
      setAdminRoleRequestMessage("");
      setAdminRoleRequestError("");
      setAdminUsersMessage("");
      setAdminUsersError("");
      setRoleAuditLogsError("");
      setWorkbenchError("");
      setIsCartOpen(false);
      resetCartState();
      return;
    }

    void refreshUserOrders().catch((refreshError) => {
      setActionError("載入使用者訂單資料失敗，請稍後再試。");
      console.error(refreshError);
    });

    void loadMyRoleRequests().catch((roleRequestLoadError) => {
      setRoleRequestError("載入角色申請資料失敗，請稍後再試。");
      console.error(roleRequestLoadError);
    });

    if (hasAnyRole(user, orderViewerRoles)) {
      void loadWorkbenchOrders().catch((workbenchLoadError) => {
        setWorkbenchError("載入訂單工作台失敗，請稍後再試。");
        console.error(workbenchLoadError);
      });
    }

    if (hasAnyRole(user, adminRoles)) {
      void loadAdminRoleRequests().catch((adminLoadError) => {
        setAdminRoleRequestError("載入角色申請審核資料失敗，請稍後再試。");
        console.error(adminLoadError);
      });
      void loadAdminUsers().catch((adminUsersLoadError) => {
        setAdminUsersError("載入使用者角色資料失敗，請稍後再試。");
        console.error(adminUsersLoadError);
      });
      void loadRoleAuditLogs().catch((roleAuditLoadError) => {
        setRoleAuditLogsError("載入角色異動紀錄失敗，請稍後再試。");
        console.error(roleAuditLoadError);
      });
    }
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
  const canReviewRoleRequests = user ? hasAnyRole(user, adminRoles) : false;
  const canManageUsers = user ? hasAnyRole(user, adminRoles) : false;
  const canViewOrderWorkbench = user ? hasAnyRole(user, orderViewerRoles) : false;
  const availableRequestRoles = user
    ? requestableRoles.filter((role) => !user.roles.includes(role))
    : [];

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = itemIdText;
        const currentItem = itemById.get(itemId);
        const item = currentItem ?? cartItemSnapshotById[itemId];
        if (!item || qty <= 0) {
          return null;
        }

        return {
          itemId,
          qty,
          item,
          isUnavailable: !currentItem || !item.isCurrentVersion,
          subtotal: item.price * qty,
        };
      })
      .filter((entry) => entry !== null);
  }, [cartItemSnapshotById, cartQtyByItemId, items]);

  const hasUnavailableCartItems = cartDetails.some(
    (detail) => detail.isUnavailable,
  );

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

  async function handleSubmitRoleRequest(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!user) {
      setRoleRequestError("請先登入後再申請角色。");
      return;
    }

    const requestedRole = availableRequestRoles.includes(
      roleRequestForm.requestedRole,
    )
      ? roleRequestForm.requestedRole
      : availableRequestRoles[0];

    if (!requestedRole) {
      setRoleRequestError("目前沒有可申請的角色。");
      return;
    }

    setIsSubmittingRoleRequest(true);
    setRoleRequestError("");
    setRoleRequestMessage("");

    try {
      const response = await fetch(buildApiUrl("/api/users/me/role-request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requestedRole,
          reason: roleRequestForm.reason.trim(),
        }),
      });

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再申請角色。");
      }

      if (response.status === 409) {
        throw new Error("目前已有待審核申請，或你已擁有該角色。");
      }

      if (!response.ok) {
        throw new Error(`Submit role request failed: HTTP ${response.status}`);
      }

      setRoleRequestForm((current) => ({ ...current, reason: "" }));
      setRoleRequestMessage("角色申請已送出，請等待 admin 審核。");
      await loadMyRoleRequests();
    } catch (submitError) {
      setRoleRequestError(
        submitError instanceof Error
          ? submitError.message
          : "送出角色申請失敗，請稍後再試。",
      );
      console.error(submitError);
    } finally {
      setIsSubmittingRoleRequest(false);
    }
  }

  async function handleAdminRoleRequestFilterChange(
    status: RoleRequestStatus | "all",
  ): Promise<void> {
    setAdminRoleRequestFilter(status);
    setAdminRoleRequestError("");
    await loadAdminRoleRequests(status);
  }

  async function reviewRoleRequest(
    requestId: number,
    status: "approved" | "rejected",
  ): Promise<void> {
    setReviewingRoleRequestId(requestId);
    setAdminRoleRequestError("");
    setAdminRoleRequestMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/role-requests/${requestId}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status,
            reviewNote: reviewNoteByRequestId[requestId]?.trim() || undefined,
          }),
        },
      );

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再審核角色申請。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有審核角色申請的權限。");
      }

      if (response.status === 409) {
        throw new Error("這筆申請已經被審核過。");
      }

      if (!response.ok) {
        throw new Error(`Review role request failed: HTTP ${response.status}`);
      }

      setReviewNoteByRequestId((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setAdminRoleRequestMessage(
        status === "approved" ? "角色申請已核准。" : "角色申請已拒絕。",
      );
      await Promise.all([
        loadAdminRoleRequests(adminRoleRequestFilter),
        loadMyRoleRequests(),
        loadRoleAuditLogs(roleAuditActionFilter),
        refreshCurrentUser(),
      ]);
    } catch (reviewError) {
      setAdminRoleRequestError(
        reviewError instanceof Error
          ? reviewError.message
          : "審核角色申請失敗，請稍後再試。",
      );
      console.error(reviewError);
    } finally {
      setReviewingRoleRequestId(null);
    }
  }

  function updateAdminUserRole(
    targetUser: AdminUser,
    role: Role,
    checked: boolean,
  ): void {
    if (role === "customer") return;
    if (user?.id === targetUser.id && role === "admin" && !checked) return;

    setRolesByUserId((current) => {
      const currentRoles = normalizeRoles(current[targetUser.id] ?? targetUser.roles);
      const nextRoles = checked
        ? normalizeRoles([...currentRoles, role])
        : normalizeRoles(currentRoles.filter((currentRole) => currentRole !== role));

      return {
        ...current,
        [targetUser.id]: nextRoles,
      };
    });
  }

  async function saveAdminUserRoles(targetUser: AdminUser): Promise<void> {
    const roles = normalizeRoles(rolesByUserId[targetUser.id] ?? targetUser.roles);

    setSavingAdminUserId(targetUser.id);
    setAdminUsersError("");
    setAdminUsersMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/users/${encodeURIComponent(targetUser.id)}/roles`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ roles }),
        },
      );

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再管理使用者角色。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有管理使用者的權限。");
      }

      if (response.status === 404) {
        throw new Error("找不到目標使用者。");
      }

      if (response.status === 409) {
        throw new Error("不能移除自己的 admin 角色。");
      }

      if (!response.ok) {
        throw new Error(`Update user roles failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<AdminUser>;
      setAdminUsersMessage(`${payload.data.email} 的角色已更新。`);
      await Promise.all([
        loadAdminUsers(),
        loadRoleAuditLogs(roleAuditActionFilter),
      ]);
      if (payload.data.id === user?.id) {
        await refreshCurrentUser();
      }
    } catch (updateError) {
      setAdminUsersError(
        updateError instanceof Error
          ? updateError.message
          : "更新使用者角色失敗，請稍後再試。",
      );
      console.error(updateError);
    } finally {
      setSavingAdminUserId(null);
    }
  }

  async function advanceWorkbenchOrder(
    order: Order,
    nextStatus: Exclude<OrderStatus, "pending" | "submitted" | "cancelled">,
  ): Promise<void> {
    setUpdatingWorkbenchOrderId(order.id);
    setWorkbenchError("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${order.id}/status`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再更新訂單狀態。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有更新此訂單狀態的權限。");
      }

      if (response.status === 409) {
        throw new Error("訂單狀態已變更，請重新整理後再試。");
      }

      if (!response.ok) {
        throw new Error(`Update order status failed: HTTP ${response.status}`);
      }

      await Promise.all([loadWorkbenchOrders(), loadOrderHistory()]);
    } catch (updateError) {
      setWorkbenchError(
        updateError instanceof Error
          ? updateError.message
          : "更新訂單狀態失敗，請稍後再試。",
      );
      console.error(updateError);
    } finally {
      setUpdatingWorkbenchOrderId(null);
    }
  }

  async function cancelOrder(order: AppOrder): Promise<void> {
    const confirmed = window.confirm(`確定要取消 ${order.pickupCode} 嗎？`);
    if (!confirmed) return;

    setCancelingOrderId(order.id);
    setWorkbenchError("");
    setActionError("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${order.id}/cancel`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        },
      );

      if (response.status === 401) {
        setUser(null);
        throw new Error("請重新登入後再取消訂單。");
      }

      if (response.status === 403) {
        throw new Error("目前角色沒有取消此訂單的權限。");
      }

      if (response.status === 409) {
        throw new Error("此訂單狀態已無法取消，請重新整理後再試。");
      }

      if (!response.ok) {
        throw new Error(`Cancel order failed: HTTP ${response.status}`);
      }

      await Promise.all([
        loadOrderHistory(),
        canViewOrderWorkbench ? loadWorkbenchOrders() : Promise.resolve(),
      ]);
    } catch (cancelError) {
      const message =
        cancelError instanceof Error
          ? cancelError.message
          : "取消訂單失敗，請稍後再試。";
      if (canViewOrderWorkbench) {
        setWorkbenchError(message);
      } else {
        setActionError(message);
      }
      console.error(cancelError);
    } finally {
      setCancelingOrderId(null);
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

    if (hasUnavailableCartItems) {
      setActionError("購物車內有舊版或已下架品項，請先移除後再送出。");
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
          body: JSON.stringify({ customerNote: customerNote.trim() }),
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
      setCustomerNote("");
      setIsCartOpen(false);
      await loadOrderHistory();
      if (canViewOrderWorkbench) {
        await loadWorkbenchOrders();
      }
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

        {user ? (
          <section className="mb-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="text-xl font-bold">角色申請</h2>
                <p className="text-sm opacity-70">
                  申請店員或廚房角色，送出後等待 admin 審核。
                </p>
              </div>

              {roleRequestMessage ? (
                <div className="alert alert-success mb-3 py-2">
                  <span>{roleRequestMessage}</span>
                </div>
              ) : null}
              {roleRequestError ? (
                <div className="alert alert-error mb-3 py-2">
                  <span>{roleRequestError}</span>
                </div>
              ) : null}

              {hasAnyRole(user, menuManagerRoles) ? (
                <div className="alert alert-info py-2">
                  <span>目前帳號已具備管理角色，不需要送出角色申請。</span>
                </div>
              ) : availableRequestRoles.length === 0 ? (
                <div className="alert alert-info py-2">
                  <span>目前可申請的角色皆已取得。</span>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    void handleSubmitRoleRequest(event);
                  }}
                >
                  <label className="form-control">
                    <span className="label-text">申請角色</span>
                    <select
                      className="select select-bordered select-sm"
                      onChange={(event) =>
                        setRoleRequestForm((current) => ({
                          ...current,
                          requestedRole: event.target.value as RequestableRole,
                        }))
                      }
                      value={
                        availableRequestRoles.includes(
                          roleRequestForm.requestedRole,
                        )
                          ? roleRequestForm.requestedRole
                          : availableRequestRoles[0]
                      }
                    >
                      {availableRequestRoles.map((role) => (
                        <option key={role} value={role}>
                          {requestableRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-control">
                    <span className="label-text">申請原因</span>
                    <textarea
                      className="textarea textarea-bordered min-h-20"
                      minLength={10}
                      onChange={(event) =>
                        setRoleRequestForm((current) => ({
                          ...current,
                          reason: event.target.value,
                        }))
                      }
                      placeholder="請簡述需要此角色的原因，至少 10 字。"
                      required
                      value={roleRequestForm.reason}
                    />
                  </label>

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={isSubmittingRoleRequest}
                    type="submit"
                  >
                    {isSubmittingRoleRequest ? "送出中..." : "送出角色申請"}
                  </button>
                </form>
              )}

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">我的申請紀錄</h3>
                  <button
                    className="btn btn-xs btn-outline"
                    disabled={isLoadingMyRoleRequests}
                    onClick={() => {
                      void loadMyRoleRequests();
                    }}
                    type="button"
                  >
                    {isLoadingMyRoleRequests ? "讀取中" : "重新整理"}
                  </button>
                </div>
                {myRoleRequests.length === 0 ? (
                  <p className="text-sm opacity-70">目前沒有角色申請紀錄。</p>
                ) : (
                  <div className="space-y-2">
                    {myRoleRequests.map((roleRequest) => (
                      <div
                        className="rounded border border-base-300 bg-base-200 p-3 text-sm"
                        key={roleRequest.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {requestableRoleLabels[roleRequest.requestedRole]}
                          </span>
                          <span
                            className={roleRequestStatusBadgeClass(
                              roleRequest.status,
                            )}
                          >
                            {roleRequestStatusLabels[roleRequest.status]}
                          </span>
                        </div>
                        <p className="mt-1 opacity-80">{roleRequest.reason}</p>
                        {roleRequest.reviewNote ? (
                          <p className="mt-1 text-xs opacity-70">
                            審核備註：{roleRequest.reviewNote}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {canReviewRoleRequests ? (
              <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">角色申請審核</h2>
                    <p className="text-sm opacity-70">
                      admin 可核准或拒絕使用者的 staff/chef 申請。
                    </p>
                  </div>
                  <select
                    className="select select-bordered select-sm"
                    onChange={(event) => {
                      void handleAdminRoleRequestFilterChange(
                        event.target.value as RoleRequestStatus | "all",
                      );
                    }}
                    value={adminRoleRequestFilter}
                  >
                    <option value="pending">待審核</option>
                    <option value="approved">已核准</option>
                    <option value="rejected">已拒絕</option>
                    <option value="all">全部</option>
                  </select>
                </div>

                {adminRoleRequestMessage ? (
                  <div className="alert alert-success mb-3 py-2">
                    <span>{adminRoleRequestMessage}</span>
                  </div>
                ) : null}
                {adminRoleRequestError ? (
                  <div className="alert alert-error mb-3 py-2">
                    <span>{adminRoleRequestError}</span>
                  </div>
                ) : null}

                {isLoadingAdminRoleRequests ? (
                  <div className="alert py-2">
                    <span>讀取中...</span>
                  </div>
                ) : adminRoleRequests.length === 0 ? (
                  <p className="text-sm opacity-70">目前沒有符合條件的申請。</p>
                ) : (
                  <div className="space-y-3">
                    {adminRoleRequests.map((roleRequest) => (
                      <div
                        className="rounded border border-base-300 bg-base-200 p-3 text-sm"
                        key={roleRequest.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">
                              {roleRequest.requesterName ?? "未知使用者"}
                            </div>
                            <div className="text-xs opacity-70">
                              {roleRequest.requesterEmail ?? roleRequest.userId}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className="badge badge-outline">
                              {requestableRoleLabels[roleRequest.requestedRole]}
                            </span>
                            <span
                              className={roleRequestStatusBadgeClass(
                                roleRequest.status,
                              )}
                            >
                              {roleRequestStatusLabels[roleRequest.status]}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 opacity-80">{roleRequest.reason}</p>
                        {roleRequest.status === "pending" ? (
                          <div className="mt-3 space-y-2">
                            <input
                              className="input input-bordered input-sm w-full"
                              onChange={(event) =>
                                setReviewNoteByRequestId((current) => ({
                                  ...current,
                                  [roleRequest.id]: event.target.value,
                                }))
                              }
                              placeholder="審核備註（選填）"
                              value={reviewNoteByRequestId[roleRequest.id] ?? ""}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="btn btn-success btn-xs"
                                disabled={
                                  reviewingRoleRequestId === roleRequest.id
                                }
                                onClick={() => {
                                  void reviewRoleRequest(
                                    roleRequest.id,
                                    "approved",
                                  );
                                }}
                                type="button"
                              >
                                核准
                              </button>
                              <button
                                className="btn btn-error btn-outline btn-xs"
                                disabled={
                                  reviewingRoleRequestId === roleRequest.id
                                }
                                onClick={() => {
                                  void reviewRoleRequest(
                                    roleRequest.id,
                                    "rejected",
                                  );
                                }}
                                type="button"
                              >
                                拒絕
                              </button>
                            </div>
                          </div>
                        ) : roleRequest.reviewNote ? (
                          <p className="mt-2 text-xs opacity-70">
                            審核備註：{roleRequest.reviewNote}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {canManageUsers ? (
              <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">使用者角色管理</h2>
                    <p className="text-sm opacity-70">
                      admin 可直接調整使用者角色；customer 會自動保留。
                    </p>
                  </div>
                  <button
                    className="btn btn-xs btn-outline"
                    disabled={isLoadingAdminUsers}
                    onClick={() => {
                      void loadAdminUsers();
                    }}
                    type="button"
                  >
                    {isLoadingAdminUsers ? "讀取中" : "重新整理"}
                  </button>
                </div>

                {adminUsersMessage ? (
                  <div className="alert alert-success mb-3 py-2">
                    <span>{adminUsersMessage}</span>
                  </div>
                ) : null}
                {adminUsersError ? (
                  <div className="alert alert-error mb-3 py-2">
                    <span>{adminUsersError}</span>
                  </div>
                ) : null}

                {isLoadingAdminUsers ? (
                  <div className="alert py-2">
                    <span>讀取中...</span>
                  </div>
                ) : adminUsers.length === 0 ? (
                  <p className="text-sm opacity-70">目前沒有使用者資料。</p>
                ) : (
                  <div className="space-y-3">
                    {adminUsers.map((adminUser) => {
                      const selectedRoles = normalizeRoles(
                        rolesByUserId[adminUser.id] ?? adminUser.roles,
                      );
                      const isSelf = user?.id === adminUser.id;

                      return (
                        <div
                          className="rounded border border-base-300 bg-base-200 p-3 text-sm"
                          key={adminUser.id}
                        >
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold">
                                {adminUser.name}
                                {isSelf ? (
                                  <span className="badge badge-info badge-sm ml-2">
                                    目前帳號
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs opacity-70">
                                {adminUser.email}
                              </div>
                            </div>
                            <button
                              className="btn btn-primary btn-xs"
                              disabled={savingAdminUserId === adminUser.id}
                              onClick={() => {
                                void saveAdminUserRoles(adminUser);
                              }}
                              type="button"
                            >
                              {savingAdminUserId === adminUser.id
                                ? "儲存中"
                                : "儲存角色"}
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {roleOptions.map((role) => {
                              const isLockedSelfAdmin =
                                isSelf && role === "admin";
                              const isCustomer = role === "customer";

                              return (
                                <label
                                  className="label cursor-pointer gap-2 rounded bg-base-100 px-3 py-1"
                                  key={role}
                                >
                                  <input
                                    checked={selectedRoles.includes(role)}
                                    className="checkbox checkbox-xs"
                                    disabled={isCustomer || isLockedSelfAdmin}
                                    onChange={(event) =>
                                      updateAdminUserRole(
                                        adminUser,
                                        role,
                                        event.target.checked,
                                      )
                                    }
                                    type="checkbox"
                                  />
                                  <span className="label-text text-xs">
                                    {roleLabels[role]}
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          {isSelf ? (
                            <p className="mt-2 text-xs opacity-70">
                              為避免鎖住後台，不能移除自己的 admin 角色。
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {canManageUsers ? (
              <div className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">角色異動紀錄</h2>
                    <p className="text-sm opacity-70">
                      記錄 admin 審核與直接調整角色的操作軌跡。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="select select-bordered select-sm"
                      onChange={(event) => {
                        const nextAction = event.target.value as
                          | RoleAuditAction
                          | "all";
                        setRoleAuditActionFilter(nextAction);
                        setRoleAuditLogsError("");
                        void loadRoleAuditLogs(nextAction);
                      }}
                      value={roleAuditActionFilter}
                    >
                      <option value="all">全部</option>
                      <option value="role_request_approved">申請核准</option>
                      <option value="role_request_rejected">申請拒絕</option>
                      <option value="admin_roles_updated">直接更新</option>
                    </select>
                    <button
                      className="btn btn-xs btn-outline"
                      disabled={isLoadingRoleAuditLogs}
                      onClick={() => {
                        void loadRoleAuditLogs();
                      }}
                      type="button"
                    >
                      {isLoadingRoleAuditLogs ? "讀取中" : "重新整理"}
                    </button>
                  </div>
                </div>

                {roleAuditLogsError ? (
                  <div className="alert alert-error mb-3 py-2">
                    <span>{roleAuditLogsError}</span>
                  </div>
                ) : null}

                {isLoadingRoleAuditLogs ? (
                  <div className="alert py-2">
                    <span>讀取中...</span>
                  </div>
                ) : roleAuditLogs.length === 0 ? (
                  <p className="text-sm opacity-70">目前沒有角色異動紀錄。</p>
                ) : (
                  <div className="space-y-3">
                    {roleAuditLogs.map((auditLog) => (
                      <div
                        className="rounded border border-base-300 bg-base-200 p-3 text-sm"
                        key={auditLog.id}
                      >
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">
                              {roleAuditActionLabels[auditLog.action]}
                            </div>
                            <div className="text-xs opacity-70">
                              {formatVersionTime(auditLog.createdAt)}
                            </div>
                          </div>
                          <span className="badge badge-outline">
                            {auditLog.source}
                          </span>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="text-xs opacity-70">操作者</div>
                            <div>
                              {auditLog.actorName ?? "系統"}
                              <span className="ml-1 text-xs opacity-70">
                                {auditLog.actorEmail ?? auditLog.actorUserId}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs opacity-70">目標使用者</div>
                            <div>
                              {auditLog.targetName ?? "未知使用者"}
                              <span className="ml-1 text-xs opacity-70">
                                {auditLog.targetEmail ?? auditLog.targetUserId}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs opacity-70">
                              變更前
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {auditLog.oldRoles.map((role) => (
                                <span
                                  className="badge badge-ghost badge-sm"
                                  key={`${auditLog.id}-old-${role}`}
                                >
                                  {roleLabels[role]}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs opacity-70">
                              變更後
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {auditLog.newRoles.map((role) => (
                                <span
                                  className="badge badge-info badge-sm"
                                  key={`${auditLog.id}-new-${role}`}
                                >
                                  {roleLabels[role]}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {auditLog.note ? (
                          <p className="mt-2 text-xs opacity-70">
                            備註：{auditLog.note}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {canViewOrderWorkbench ? (
          <section className="mb-8 rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">訂單工作台</h2>
                <p className="text-sm opacity-70">
                  staff/chef/owner/admin 可依角色處理已送出的訂單。
                </p>
              </div>
              <button
                className="btn btn-sm btn-outline"
                disabled={workbenchLoading}
                onClick={() => {
                  void loadWorkbenchOrders();
                }}
                type="button"
              >
                {workbenchLoading ? "讀取中" : "重新整理"}
              </button>
            </div>

            {workbenchError ? (
              <div className="alert alert-error mb-3 py-2">
                <span>{workbenchError}</span>
              </div>
            ) : null}

            {workbenchLoading ? (
              <div className="alert py-2">
                <span>讀取中...</span>
              </div>
            ) : workbenchOrders.length === 0 ? (
              <div className="alert alert-info py-2">
                <span>目前沒有待處理訂單。</span>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {workbenchOrders.map((order) => {
                  const canUseKitchenFlow =
                    user && hasAnyRole(user, kitchenWorkflowRoles);
                  const canUseCounterFlow =
                    user && hasAnyRole(user, counterWorkflowRoles);
                  const canCancelFromWorkbench =
                    user &&
                    hasAnyRole(user, orderCancellationRoles) &&
                    ["submitted", "preparing", "ready"].includes(order.status);
                  const nextAction =
                    order.status === "submitted" && canUseKitchenFlow
                      ? { status: "preparing" as const, label: "開始製作" }
                      : order.status === "preparing" && canUseKitchenFlow
                        ? { status: "ready" as const, label: "餐點完成" }
                        : order.status === "ready" && canUseCounterFlow
                          ? { status: "completed" as const, label: "完成取餐" }
                          : null;

                  return (
                    <article
                      className="rounded border border-base-300 bg-base-200 p-4"
                      key={order.id}
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">訂單 #{order.id}</h3>
                          <p className="text-lg font-bold text-primary">
                            {order.pickupCode}
                          </p>
                          <p className="text-xs opacity-70">
                            建立時間：{formatVersionTime(order.createdAt)}
                          </p>
                        </div>
                        <span className={orderStatusBadgeClass(order.status)}>
                          {orderStatusLabels[order.status]}
                        </span>
                      </div>

                      <ul className="mb-3 space-y-1 text-sm">
                        {order.items.map((detail) => (
                          <li
                            className="flex justify-between gap-2"
                            key={`${order.id}-${detail.item.id}`}
                          >
                            <span>
                              {detail.item.name} x {detail.qty}
                            </span>
                            <span>${detail.item.price * detail.qty}</span>
                          </li>
                        ))}
                      </ul>

                      <p className="mb-3 rounded bg-base-100 px-3 py-2 text-sm">
                        備註：{order.customerNote || "無備註"}
                      </p>

                      {order.status === "cancelled" ? (
                        <p className="mb-3 rounded bg-error/10 px-3 py-2 text-sm">
                          取消時間：{formatVersionTime(order.cancelledAt)}
                          <br />
                          取消原因：{order.cancelReason || "無取消原因"}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">總計 ${order.total}</span>
                        <div className="flex flex-wrap gap-2">
                          {canCancelFromWorkbench ? (
                            <button
                              className="btn btn-error btn-outline btn-sm"
                              disabled={cancelingOrderId === order.id}
                              onClick={() => {
                                void cancelOrder(order);
                              }}
                              type="button"
                            >
                              {cancelingOrderId === order.id
                                ? "取消中..."
                                : "取消訂單"}
                            </button>
                          ) : null}
                          {nextAction ? (
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={
                                updatingWorkbenchOrderId === order.id ||
                                cancelingOrderId === order.id
                              }
                              onClick={() => {
                                void advanceWorkbenchOrder(
                                  order,
                                  nextAction.status,
                                );
                              }}
                              type="button"
                            >
                              {updatingWorkbenchOrderId === order.id
                                ? "更新中..."
                                : nextAction.label}
                            </button>
                          ) : (
                            <span className="text-xs opacity-70">
                              目前角色無下一步操作
                            </span>
                          )}
                        </div>
                      </div>                    </article>
                  );
                })}
              </div>
            )}
          </section>
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
                      <p className="text-lg font-bold text-primary">
                        {order.pickupCode}
                      </p>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold">訂單 #{order.id}</h3>
                        <span className={orderStatusBadgeClass(order.status)}>
                          {orderStatusLabels[order.status]}
                        </span>
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
                      <p className="rounded bg-base-200 px-3 py-2 text-sm">
                        備註：{order.customerNote || "無備註"}
                      </p>
                      {order.status === "cancelled" ? (
                        <p className="rounded bg-error/10 px-3 py-2 text-sm">
                          取消時間：{formatVersionTime(order.cancelledAt)}
                          <br />
                          取消原因：{order.cancelReason || "無取消原因"}
                        </p>
                      ) : null}
                      {order.status === "submitted" ? (
                        <button
                          className="btn btn-error btn-outline btn-sm self-end"
                          disabled={cancelingOrderId === order.id}
                          onClick={() => {
                            void cancelOrder(order);
                          }}
                          type="button"
                        >
                          {cancelingOrderId === order.id
                            ? "取消中..."
                            : "取消訂單"}
                        </button>
                      ) : null}                      <p className="font-bold text-right">
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{detail.item.name}</p>
                          {detail.isUnavailable ? (
                            <span className="badge badge-warning badge-sm">
                              舊版/已下架
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm opacity-70">
                          單價 ${detail.item.price} x {detail.qty}
                        </p>
                        {detail.isUnavailable ? (
                          <p className="text-xs text-warning">
                            此品項已不在目前菜單，請清空後重新加入新版品項。
                          </p>
                        ) : null}
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
              {hasUnavailableCartItems ? (
                <div className="alert alert-warning py-2 text-sm">
                  <span>購物車含舊版或已下架品項，請先清空後重新加入新版品項。</span>
                </div>
              ) : null}
              <label className="form-control">
                <span className="label-text text-sm">顧客備註</span>
                <textarea
                  className="textarea textarea-bordered min-h-20"
                  maxLength={120}
                  onChange={(event) => {
                    setCustomerNote(event.target.value);
                  }}
                  placeholder="不要辣、餐點分袋、到店付款備註"
                  value={customerNote}
                />
                <span className="label-text-alt text-right">
                  {customerNote.length}/120
                </span>
              </label>
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
                disabled={
                  cartDetails.length === 0 ||
                  hasUnavailableCartItems ||
                  isSubmittingOrder
                }
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
