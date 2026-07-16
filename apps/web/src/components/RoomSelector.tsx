import type { PublicRoom } from "@realtime-chat/shared";
import { RoomList } from "./RoomList";

export interface RoomSelectorProps {
  rooms: PublicRoom[];
  activeRoomSlug?: string | null;
  loadingRooms?: boolean;
  roomsError?: string | null;
  disabled?: boolean;
  onSelectRoom: (slug: string) => void;
  onOpenCreateRoom: () => void;
}

export function RoomSelector({
  rooms,
  activeRoomSlug,
  loadingRooms,
  roomsError,
  disabled,
  onSelectRoom,
  onOpenCreateRoom,
}: RoomSelectorProps) {
  return (
    <nav className="room-selector" aria-label="Selector de salas">
      <div className="room-selector__header">
        <h2>Salas</h2>
        <button
          type="button"
          className="room-selector__create-button"
          onClick={onOpenCreateRoom}
          aria-label="Crear nueva sala"
          disabled={disabled}
        >
          +
        </button>
      </div>
      <RoomList
        rooms={rooms}
        activeRoomSlug={activeRoomSlug}
        loading={loadingRooms}
        error={roomsError}
        disabled={disabled}
        onSelect={onSelectRoom}
      />
    </nav>
  );
}
