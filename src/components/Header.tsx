export function Header() {
  return (
    <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 px-4 py-3 sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡️</span>
          <h1 className="text-lg font-bold text-white">Subscription Guardian</h1>
        </div>
        <div className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
          PWA
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
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm border-t border-gray-800 px-4 py-2 z-10 safe-area-inset-bottom">
      <div className="flex justify-around max-w-lg mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors ${
              activeTab === tab.id
                ? "text-blue-400"
                : "text-gray-500"
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
