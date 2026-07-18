import { Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "../api/client.js";
import { useTheme } from "../theme.jsx";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const isNight = theme === "night";
  const { data: meRes } = useSWR("me", () => api.me());
  const user = meRes?.user;

  return (
    <div>
      <p className="font-display font-light tracking-tight text-3xl mb-1">Настройки</p>
      <p className="text-ink/60 mb-8">Аккаунт и внешний вид приложения</p>

      {user && (
        <div className="rounded-lg border border-ink/10 bg-surface p-5 max-w-md mb-4">
          <p className="text-sm font-medium">{user.full_name || "Без имени"}</p>
          <p className="text-xs text-ink/50 mt-0.5">{user.email}</p>
        </div>
      )}

      <div className="rounded-lg border border-ink/10 bg-surface p-5 max-w-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Ночной режим</p>
            <p className="text-xs text-ink/50 mt-0.5">
              Тёмный экран для проверки анализов без света в глаза
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isNight}
            onClick={toggleTheme}
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-moss focus:ring-offset-2 focus:ring-offset-surface ${
              isNight ? "bg-moss" : "bg-ink/15"
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-surface shadow transition-transform ${
                isNight ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {user?.is_admin && (
        <Link to="/admin" className="text-sm text-moss inline-block mt-6">
          Админ-панель →
        </Link>
      )}
    </div>
  );
}
