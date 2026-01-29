export type ApiError = {
  message: string;
  statusCode?: number;
};

const TOKEN_KEY = "gp24_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.message ?? res.statusText ?? "Request failed";
    throw {
      message: Array.isArray(msg) ? msg.join(", ") : String(msg),
      statusCode: res.status,
    } as ApiError;
  }

  return data as T;
}

export type User = { id: string; email: string; publicKey?: string };
export type Transaction = {
  id: string;
  type: "deposit" | "withdraw";
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paymentType?: string;
};

export async function apiRegister(email: string, password: string) {
  return request<{ token: string; user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiLogin(email: string, password: string) {
  return request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiMe() {
  return request<User>("/me");
}

export async function apiTransactions() {
  return request<{ items: Transaction[]; balance: number }>("/transactions");
}

export async function apiWithdraw(amount: number) {
  return request<{ transaction: Transaction; balance: number }>("/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export type AccountSettings = {
  callbackUrl: string | null;
  redirectUrl: string | null;
};

export async function apiGetAccountSettings() {
  return request<AccountSettings>("/account");
}

export async function apiSaveAccountSettings(payload: {
  callbackUrl?: string;
  redirectUrl?: string;
}) {
  return request<AccountSettings>("/account", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
