import type { PublicUser } from "@realtime-chat/shared";

export interface UserListProps {
  users: PublicUser[];
  currentUserId?: string | null;
}

export function UserList({ users, currentUserId }: UserListProps) {
  return (
    <ul aria-label="Usuarios conectados">
      {users.map((user) => (
        <li key={user.id}>
          {user.name}
          {user.id === currentUserId ? " (tú)" : ""}
        </li>
      ))}
    </ul>
  );
}
