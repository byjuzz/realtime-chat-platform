import type { PublicRoom } from "@realtime-chat/shared";
import { RoomListItem } from "./RoomListItem";

export interface RoomListProps {
  rooms: PublicRoom[];
  activeRoomSlug?: string | null;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onSelect: (slug: string) => void;
}

export function RoomList({ rooms, activeRoomSlug, loading, error, disabled, onSelect }: RoomListProps) {
  if (loading && rooms.length === 0) {
    return <p className="room-list__status">Cargando salas...</p>;
  }

  if (error) {
    return (
      <p className="room-list__status" role="alert">
        {error}
      </p>
    );
  }

  if (rooms.length === 0) {
    return <p className="room-list__status">No hay salas todavía.</p>;
  }

  return (
    <ul className="room-list" aria-label="Salas disponibles">
      {rooms.map((room) => (
        <RoomListItem
          key={room.id}
          room={room}
          active={room.slug === activeRoomSlug}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}
