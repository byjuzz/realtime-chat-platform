import type { PublicUser } from "@realtime-chat/shared";
import { Avatar } from "./Avatar";

export interface UserListProps {
  users: PublicUser[];
  currentUserId?: string | null;
}

export function UserList({ users, currentUserId }: UserListProps) {
  return (
    <ul className="user-strip" aria-label="Usuarios conectados">
      {users.map((user) => (
        <li className="user-chip" key={user.id}>
          <Avatar name={user.name} />
          <span className="user-chip__name">
            {user.id === currentUserId ? "Tú" : user.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
