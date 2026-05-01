interface PaginationProps {
  count: number;
  page: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

export default function Pagination({ count, page, pageSize = 20, onChange }: PaginationProps) {
  const totalPages = Math.ceil(count / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        Page {page} of {totalPages} — {count} total
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-[1px] active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-[var(--color-surface)]"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}>
          ←
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={i} className="px-2 text-sm" style={{ color: "var(--color-muted)" }}>…</span>
          ) : (
            <button
              key={i}
              onClick={() => onChange(p as number)}
              className="w-8 h-8 rounded-lg text-sm font-medium transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-[1px] active:scale-95"
              style={{
                backgroundColor: page === p ? "var(--color-primary)" : "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: page === p ? "white" : "var(--color-text)",
              }}>
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-[1px] active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-[var(--color-surface)]"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}>
          →
        </button>
      </div>
    </div>
  );
}