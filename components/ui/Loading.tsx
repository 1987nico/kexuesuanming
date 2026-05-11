"use client";

import { motion } from "framer-motion";

export function ThinkingDots({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-ink-900"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
      {label && <p className="text-sm text-ink-500">{label}</p>}
    </div>
  );
}
