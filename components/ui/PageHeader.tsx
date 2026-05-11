"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  step?: string;
  title: string;
  subtitle?: string;
  back?: string;
}

export function PageHeader({ step, title, subtitle, back }: Props) {
  return (
    <header className="pt-safe sticky top-0 bg-ink-50/85 backdrop-blur z-40 border-b border-ink-100">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 text-xs text-ink-400 mb-2">
          {back && (
            <Link href={back} className="inline-flex items-center -ml-1 hover:text-ink-700">
              <ChevronLeft className="w-4 h-4" />
            </Link>
          )}
          {step && <span className="tracking-wider uppercase">{step}</span>}
        </div>
        <h1 className="serif text-2xl text-ink-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-1.5">{subtitle}</p>}
      </div>
    </header>
  );
}
