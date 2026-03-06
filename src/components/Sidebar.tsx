"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const navItems = [
  { href: "/dashboards/pull-requests", label: "Pull Requests" },
  { href: "/dashboards/pull-requests-review", label: "PR Reviews" },
  { href: "/dashboards/workflows", label: "Workflows" },
  { href: "/dashboards/iac", label: "IaC PRs" },
  { href: "/dashboards/dx-adoption", label: "DX Adoption" },
  { href: "/dashboards/dx-team", label: "DX Team" },
  { href: "/dashboards/tracker", label: "Tracker" },
  { href: "/dashboards/releases", label: "Releases" },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-[#30363d] bg-[#0d1117]">
      <div className="p-6">
        <h1 className="text-xl font-bold text-[#e6edf3] tracking-tight">
          Engineering <span className="text-green-500">Radar</span>
        </h1>
      </div>
      <nav className="mt-2 px-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const href = searchParams.toString()
            ? `${item.href}?${searchParams.toString()}`
            : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                isActive
                  ? "bg-[#21262d] font-semibold text-white border border-[#30363d]"
                  : "text-gray-400 hover:text-white hover:bg-[#161b22]"
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
