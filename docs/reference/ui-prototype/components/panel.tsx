import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-5 ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="mt-1 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
