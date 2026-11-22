"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HubMark } from "./icons";
import { currentUser, pendingApprovals, project } from "@/lib/mock-data";

const items = [
  { href: "/overview", label: "Overview" },
  { href: "/assistant", label: "Assistant" },
  { href: "/activity", label: "Activity" },
  { href: "/approvals", label: "Approvals", count: pendingApprovals.length },
  { href: "/connections", label: "Connections" },
  { href: "/tool-settings", label: "Tool settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex flex-col gap-4 border-b border-line bg-rail px-3.5 py-4 md:min-h-screen md:w-60 md:shrink-0 md:gap-5 md:border-r md:border-b-0 md:py-5"
    >
      <div className="flex items-center justify-between gap-3 md:flex-col md:items-stretch">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 px-2 text-base font-semibold text-ink no-underline hover:text-ink"
        >
          <HubMark />
          MCP Hub
        </Link>
        <button
          type="button"
          aria-label="Switch project"
          className="flex min-h-11 flex-col items-start gap-0.5 rounded-lg border border-line bg-surface px-3 py-2 text-left"
        >
          <span className="text-sm font-semibold">{project.name}</span>
          <span className="text-xs text-muted">{project.environment}</span>
        </button>
      </div>

      <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-lg px-3 whitespace-nowrap no-underline ${
                active
                  ? "bg-surface font-semibold text-accent shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-accent"
                  : "text-ink hover:bg-surface hover:text-ink"
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="min-w-[22px] rounded-full bg-wait-bg px-[7px] py-px text-center text-xs font-semibold text-wait">
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto hidden items-center gap-2.5 p-2 md:flex">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white"
        >
          {currentUser.initials}
        </span>
        <span className="text-sm">{currentUser.name}</span>
      </div>
    </nav>
  );
}
