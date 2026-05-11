"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-full",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-11 px-6 text-base",
        size === "lg" && "h-14 px-8 text-base",
        variant === "primary" && "bg-ink-900 text-ink-50 hover:bg-ink-800",
        variant === "ghost" && "bg-transparent text-ink-700 hover:bg-ink-100",
        variant === "outline" && "border border-ink-300 bg-white text-ink-800 hover:bg-ink-50",
        variant === "danger" && "bg-danger-500 text-white hover:bg-danger-600",
        className
      )}
      {...rest}
    />
  );
});
