"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-ink-700 mb-2">
      {children}
      {required && <span className="text-danger-500 ml-1">*</span>}
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-400 mt-1.5">{children}</p>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full px-4 py-3 rounded-xl bg-white border border-ink-200 text-ink-900 placeholder:text-ink-300",
        "focus:outline-none focus:border-ink-700 focus:ring-2 focus:ring-ink-900/5",
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full px-4 py-3 rounded-xl bg-white border border-ink-200 text-ink-900 placeholder:text-ink-300 resize-none",
        "focus:outline-none focus:border-ink-700 focus:ring-2 focus:ring-ink-900/5",
        props.className
      )}
    />
  );
}

interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}
export function Chip({ selected, onClick, children, disabled }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3.5 py-2 rounded-full border text-sm transition-all",
        selected
          ? "border-ink-900 bg-ink-900 text-ink-50"
          : "border-ink-200 bg-white text-ink-700 hover:border-ink-400",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="serif text-lg text-ink-900 mb-1.5">{title}</h3>
      {hint && <p className="text-xs text-ink-400 mb-3">{hint}</p>}
      <div className="space-y-4 mt-3">{children}</div>
    </section>
  );
}
