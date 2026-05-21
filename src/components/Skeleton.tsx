interface Props {
  className?: string;
}
export function Skeleton({ className = "" }: Props) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-700/40 ${className}`}
      aria-hidden="true"
    />
  );
}
