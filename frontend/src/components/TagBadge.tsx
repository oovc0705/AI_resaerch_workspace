"use client";

export default function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-block rounded-full border border-black/10 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      {tag}
    </span>
  );
}
