import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium no-underline transition-colors";

// Utilities sit in a later CSS layer than the global link color, so text-* here always wins.
export const buttonStyles = {
  primary: `${base} bg-accent text-white hover:bg-accent-hover hover:text-white`,
  secondary: `${base} border border-control bg-surface text-ink hover:bg-rail hover:text-ink`,
  danger: `${base} border border-control bg-surface text-block hover:bg-block-bg`,
  ghostDanger: `${base} bg-transparent text-block hover:bg-block-bg`,
};

type Variant = keyof typeof buttonStyles;

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={`${buttonStyles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonStyles[variant]} ${className}`}>
      {children}
    </Link>
  );
}
