import { NavLink, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Обзор", end: true },
  { to: "/documents", label: "Документы" },
  { to: "/medcard", label: "Медкарта" },
  { to: "/chat", label: "Ассистент" },
];

export default function Layout({ children }) {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-ink/10 bg-white/60">
        <div>
          <p className="font-display text-xl leading-none">SauBol</p>
          <p className="text-[10px] text-ink/50 tracking-wide uppercase">личный архив здоровья</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-ink/40 hover:text-ink/70 transition-colors"
        >
          Выйти
        </button>
      </header>

      <aside className="hidden md:flex w-60 shrink-0 border-r border-ink/10 bg-white/60 flex-col">
        <div className="px-6 py-7">
          <p className="font-display text-2xl leading-none">SauBol</p>
          <p className="text-xs text-ink/50 mt-1 tracking-wide uppercase">личный архив здоровья</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? "bg-moss text-white" : "text-ink/70 hover:bg-moss/10"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="mx-6 mb-6 text-left text-xs text-ink/40 hover:text-ink/70 transition-colors"
        >
          Выйти из аккаунта
        </button>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-10 md:py-8 max-w-4xl pb-24 md:pb-8">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-ink/10 bg-white/90 backdrop-blur flex pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-xs transition-colors ${
                isActive ? "text-moss font-medium" : "text-ink/50"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
