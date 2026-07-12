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
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-ink/10 bg-white/60 flex flex-col">
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
      <main className="flex-1 px-10 py-8 max-w-4xl">{children}</main>
    </div>
  );
}
