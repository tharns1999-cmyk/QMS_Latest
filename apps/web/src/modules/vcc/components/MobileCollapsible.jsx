import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Explanatory content folded behind one line on phones; always shown from the md breakpoint up.
export default function MobileCollapsible({ summary, children, className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="md:hidden flex w-full min-h-11 items-center justify-between gap-2 text-left text-sm font-semibold text-slate-700 cursor-pointer"
      >
        <span>{summary}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? '' : 'hidden'} md:block ${className}`}>{children}</div>
    </>
  );
}
