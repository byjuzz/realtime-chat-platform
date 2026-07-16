const PALETTE = ["#6C5DD3", "#3DAED8", "#F0A85F", "#E0577A", "#4CAF7D", "#8A63D2"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

export interface AvatarProps {
  name: string;
}

export function Avatar({ name }: AvatarProps) {
  return (
    <span className="avatar" style={{ background: colorForName(name) }} aria-hidden="true">
      {initialsForName(name)}
    </span>
  );
}
