interface Props {
  status: "green" | "yellow" | "red";
  pulse?: boolean;
  size?: "sm" | "md";
}

const COLORS: Record<Props["status"], string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export function StatusDot({ status, pulse = false, size = "md" }: Props) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span className={`relative inline-flex ${dim}`} aria-label={`status: ${status}`}>
      {pulse && (
        <span
          className={`absolute inset-0 rounded-full ${COLORS[status]} opacity-60 animate-ping`}
        />
      )}
      <span className={`relative inline-flex ${dim} rounded-full ${COLORS[status]}`} />
    </span>
  );
}
