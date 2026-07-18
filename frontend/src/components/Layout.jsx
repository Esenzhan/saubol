import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Обзор",
    end: true,
    icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  },
  {
    to: "/documents",
    label: "Документы",
    icon: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  },
  {
    to: "/medcard",
    label: "Медкарта",
    icon: '<path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 5-6"/>',
  },
  {
    to: "/chat",
    label: "Ассистент",
    icon: '<path d="M4 4h16v12H8l-4 4V4Z"/>',
  },
  {
    to: "/settings",
    label: "Настройки",
    icon: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  },
];

function NavIcon({ path, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");

  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("sidebarCollapsed", String(!c));
      return !c;
    });
  }

  // iOS Safari sometimes fails to recompute `position: fixed` layers after
  // an orientation change, leaving the bottom nav stranded at whatever
  // scroll offset it had in landscape instead of snapping back to the
  // viewport bottom. Nudging the scroll position forces it to repaint in
  // the right place. orientationchange fires before the new viewport size
  // is settled, so the nudge is delayed slightly.
  useEffect(() => {
    function refixBottomNav() {
      window.setTimeout(() => window.scrollTo(0, window.scrollY), 100);
    }
    window.addEventListener("orientationchange", refixBottomNav);
    return () => window.removeEventListener("orientationchange", refixBottomNav);
  }, []);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-ink/10 bg-paper/80 backdrop-blur">
        <div>
          <p className="font-display font-semibold text-xl leading-none">SauBol</p>
          <p className="text-[10px] text-ink/50 tracking-wide uppercase">личный архив здоровья</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-ink/40 hover:text-ink/70 transition-colors"
        >
          Выйти
        </button>
      </header>

      {/* pl-[env(...)] absorbs the notch/Dynamic Island when it lands on this
          edge after rotating landscape — 0 on devices/orientations without
          one, so it's a no-op everywhere else. Width adds that same inset
          on top of the base size (not just padding inside a fixed width) —
          otherwise, with border-box sizing, the safe-area padding eats into
          the content box instead of the aside growing to fit it, squeezing
          the icons and throwing the border/divider off from where the
          content actually ends. */}
      <aside
        className={`hidden md:flex shrink-0 border-r border-ink/10 bg-paper/80 flex-col pl-[env(safe-area-inset-left)] transition-[width] duration-200 ${
          collapsed ? "w-[calc(4rem+env(safe-area-inset-left))]" : "w-[calc(15rem+env(safe-area-inset-left))]"
        }`}
      >
        <div className={`flex items-center gap-2 py-7 ${collapsed ? "px-3 justify-center" : "px-6 justify-between"}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display font-semibold text-2xl leading-none truncate">SauBol</p>
              <p className="text-xs text-ink/50 mt-1 tracking-wide uppercase truncate">личный архив здоровья</p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-ink/40 hover:text-ink hover:bg-moss/10 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md text-sm transition-colors ${
                  collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
                } ${isActive ? "bg-moss text-onaccent" : "text-ink/70 hover:bg-moss/10"}`
              }
            >
              <NavIcon path={item.icon} className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          title={collapsed ? "Выйти из аккаунта" : undefined}
          className={`mb-6 text-ink/40 hover:text-ink/70 transition-colors ${
            collapsed ? "self-center" : "mx-6 text-left text-xs"
          }`}
        >
          {collapsed ? (
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          ) : (
            "Выйти из аккаунта"
          )}
        </button>
      </aside>

      <main className={`flex-1 px-4 py-6 md:px-10 md:py-8 pb-24 md:pb-8 ${collapsed ? "md:max-w-none" : "md:max-w-4xl"}`}>
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-ink/10 bg-paper/90 backdrop-blur flex justify-between px-4 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-1 pt-2.5 pb-2 text-[11px] transition-colors ${
                isActive ? "text-moss font-medium" : "text-ink/50"
              }`
            }
          >
            <NavIcon path={item.icon} className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
