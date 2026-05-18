export function Badge({ count, className = '' }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-neutral-700 px-1 text-[10px] font-semibold text-neutral-300 ${className}`}
    >
      {count}
    </span>
  );
}
