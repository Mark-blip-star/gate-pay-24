import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownToLine,
  Copy,
  Key,
  LogOut,
  Settings,
  UserCircle2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../auth/AuthContext";
import {
  apiGetAccountSettings,
  apiSaveAccountSettings,
  apiTransactions,
  apiWithdraw,
  type Transaction,
} from "../lib/api";
import { Button, Card, Input, cn } from "../components/ui";

const withdrawSchema = z.object({
  amount: z.number().positive("Amount must be > 0"),
});

const settingsSchema = z.object({
  callbackUrl: z.string(),
  redirectUrl: z.string(),
});

type WithdrawForm = z.infer<typeof withdrawSchema>;
type SettingsForm = z.infer<typeof settingsSchema>;

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPublicKey, setShowPublicKey] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError: setFormError,
    reset,
  } = useForm<WithdrawForm>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { amount: 25 },
  });

  const {
    register: registerSettings,
    handleSubmit: handleSettingsSubmit,
    formState: { errors: settingsErrors, isSubmitting: isSavingSettings },
    setError: setSettingsFormError,
    reset: resetSettings,
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { callbackUrl: "", redirectUrl: "" },
  });

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiTransactions();
      setItems(res.items);
      setBalance(res.balance);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGetAccountSettings();
        if (!cancelled)
          resetSettings({
            callbackUrl: res.callbackUrl ?? "",
            redirectUrl: res.redirectUrl ?? "",
          });
      } catch {
        if (!cancelled) resetSettings({ callbackUrl: "", redirectUrl: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSettings, resetSettings]);

  const initials = useMemo(
    () => (user?.email?.[0] ?? "U").toUpperCase(),
    [user?.email],
  );

  const onSettingsSave = handleSettingsSubmit(async (values) => {
    try {
      setSettingsFormError("root", {});
      await apiSaveAccountSettings({
        callbackUrl: values.callbackUrl.trim(),
        redirectUrl: values.redirectUrl.trim(),
      });
      setShowSettings(false);
    } catch (e: unknown) {
      setSettingsFormError("root", {
        message:
          (e as { message?: string })?.message ?? "Failed to save settings",
      });
    }
  });

  const onWithdraw = handleSubmit(async (values) => {
    try {
      setFormError("root", {});
      const res = await apiWithdraw(values.amount);
      setBalance(res.balance);
      setItems((prev) => [res.transaction, ...prev]);
      reset({ amount: values.amount });
      setShowWithdraw(false);
    } catch (e: any) {
      setFormError("root", { message: e?.message ?? "Withdraw failed" });
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-200">
              GP
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">GatePay24</div>
              <div className="text-xs text-white/60">
                Your transactions dashboard
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowPublicKey(true)}
              title="Show public key"
            >
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">Show public key</span>
            </Button>
            <Button variant="ghost" onClick={() => setShowWithdraw(true)}>
              <ArrowDownToLine className="h-4 w-4" />
              Withdraw
            </Button>

            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-500/20 font-bold text-indigo-200">
                {initials}
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-semibold">
                  {user?.email ?? "user"}
                </div>
                <div className="text-xs text-white/60">
                  {formatMoney(balance)} available
                </div>
              </div>
              <UserCircle2 className="h-4 w-4 text-white/50 sm:hidden" />
            </div>

            <Button variant="ghost" onClick={logout} title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">Transactions</div>
            <div className="text-sm text-white/60">
              All activity for your account
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => void load()}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            {error}
          </div>
        ) : null}

        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-white/60">
                <tr>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Type</th>
                  <th className="px-5 py-4 font-semibold">Amount</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {isLoading ? (
                  <tr>
                    <td className="px-5 py-6 text-white/60" colSpan={4}>
                      Loading…
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((t) => (
                    <tr key={t.id} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-4 text-white/70">
                        {new Date(t.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-xs font-semibold",
                            t.type === "deposit"
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-amber-500/15 text-amber-200",
                          )}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold">
                        <span
                          className={
                            t.type === "withdraw"
                              ? "text-amber-200"
                              : "text-emerald-200"
                          }
                        >
                          {t.type === "withdraw" ? "-" : "+"}
                          {formatMoney(t.amount)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-white/70">{t.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-6 text-white/60" colSpan={4}>
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {showWithdraw ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowWithdraw(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-lg font-bold">Withdraw</div>
            <form onSubmit={onWithdraw} className="space-y-4">
              <Input
                label="Amount (USD)"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                error={errors.amount?.message}
                {...register("amount", { valueAsNumber: true })}
              />

              {errors.root?.message ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {errors.root.message}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowWithdraw(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Withdrawing…" : "Confirm withdraw"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {showSettings ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowSettings(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-lg font-bold">Settings</div>
            <form onSubmit={onSettingsSave} className="space-y-4">
              <Input
                label="Callback URL"
                type="url"
                placeholder="https://your-api.com/webhook"
                error={settingsErrors.callbackUrl?.message}
                {...registerSettings("callbackUrl")}
              />
              <Input
                label="Redirect URL"
                type="url"
                placeholder="https://your-app.com/success"
                error={settingsErrors.redirectUrl?.message}
                {...registerSettings("redirectUrl")}
              />

              {settingsErrors.root?.message ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {settingsErrors.root.message}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSavingSettings}>
                  {isSavingSettings ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {showPublicKey ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowPublicKey(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-lg font-bold">Public key</div>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm break-all">
              {user?.publicKey ?? "—"}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (user?.publicKey) {
                    void navigator.clipboard.writeText(user.publicKey);
                  }
                }}
                disabled={!user?.publicKey}
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPublicKey(false)}
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
