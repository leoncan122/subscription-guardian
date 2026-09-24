import Link from "next/link";

export function Header({ onLogout }: { onLogout?: () => Promise<void> }) {
  return (
    <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 px-4 py-3 sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡️</span>
          <h1 className="text-lg font-bold text-white">Subscription Guardian</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-full bg-gray-800 transition-colors"
          >
            ⚙️
          </Link>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-full bg-gray-800 transition-colors"
            >
              Logout
            </button>
          )}
          <div className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
            PWA
          </div>
        </div>
      </div>
    </header>
  );
}

export function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "🏠" },
    { id: "add", label: "Add", icon: "➕" },
    { id: "history", label: "History", icon: "📊" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex justify-center pointer-events-none"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto flex items-center gap-1 lg:gap-4 p-1.5 lg:p-2 rounded-full bg-gray-800/60 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/40">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
            title={tab.label}
            className={`flex flex-col items-center justify-center gap-0.5 w-12 h-12 lg:w-auto lg:h-auto lg:px-8 lg:py-2 rounded-full transition-colors ${
              activeTab === tab.id
                ? "bg-white/15 text-blue-400"
                : "text-gray-400 opacity-60 hover:opacity-100"
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="hidden lg:block text-[11px] font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
