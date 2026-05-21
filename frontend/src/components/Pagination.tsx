"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];
  pages.push(1);

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = generatePageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 pt-6">
      <button
        onClick={() => onPageChange(1)}
        disabled={page === 1}
        className="rounded-lg px-2 py-1.5 text-xs text-gray-400 transition-all duration-150 hover:text-black disabled:opacity-30"
      >
        首页
      </button>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="rounded-lg px-3 py-1.5 text-xs text-gray-400 transition-all duration-150 hover:text-black disabled:opacity-30"
      >
        上一页
      </button>

      {pageNumbers.map((p, idx) =>
        p === "..." ? (
          <span key={`dots-${idx}`} className="px-2 text-xs text-gray-300">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              p === page
                ? "bg-black text-white"
                : "text-gray-400 hover:text-black"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="rounded-lg px-3 py-1.5 text-xs text-gray-400 transition-all duration-150 hover:text-black disabled:opacity-30"
      >
        下一页
      </button>

      <button
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
        className="rounded-lg px-2 py-1.5 text-xs text-gray-400 transition-all duration-150 hover:text-black disabled:opacity-30"
      >
        末页
      </button>
    </div>
  );
}
