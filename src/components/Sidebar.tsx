"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboards/pull-requests", label: "Pull Requests" },
  { href: "/dashboards/workflows", label: "Workflows" },
  { href: "/dashboards/iac", label: "IaC PRs" },
  { href: "/dashboards/dx-adoption", label: "DX Adoption" },
  { href: "/dashboards/dx-team", label: "DX Team" },
  { href: "/dashboards/tracker", label: "Tracker" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-gray-200 bg-white">
      <div className="p-4">
        <h1 className="text-lg font-bold text-gray-900">DX Metrics</h1>
      </div>
      <nav className="mt-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2 text-sm ${
                isActive
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
