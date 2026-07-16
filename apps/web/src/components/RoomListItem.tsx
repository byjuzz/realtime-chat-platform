import type { PublicRoom } from "@realtime-chat/shared";

export interface RoomListItemProps {
  room: PublicRoom;
  active: boolean;
  onSelect: (slug: string) => void;
  disabled?: boolean;
}

export function RoomListItem({ room, active, onSelect, disabled }: RoomListItemProps) {
  return (
    <li>
      <button
        type="button"
        className="room-list-item"
        data-active={active}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(room.slug)}
        disabled={disabled}
      >
        <span className="room-list-item__name">{room.name}</span>
        {typeof room.connectedUsers === "number" ? (
          <span className="room-list-item__count" aria-label={`${room.connectedUsers} conectados`}>
            {room.connectedUsers}
          </span>
        ) : null}
      </button>
    </li>
  );
}
