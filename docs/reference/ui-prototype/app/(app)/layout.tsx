import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-7 pb-10 md:px-8">{children}</main>
    </div>
  );
}
