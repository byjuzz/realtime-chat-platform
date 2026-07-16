import type { PublicRoom } from "@realtime-chat/shared";
import type { ConnectionStatus } from "../hooks/useChatSocket";

export interface RoomHeaderProps {
  room: PublicRoom | null;
  connectionStatus: ConnectionStatus;
  onOpenRoomDrawer: () => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Conectado",
  reconnecting: "Reconectando...",
  disconnected: "Desconectado",
};

export function RoomHeader({ room, connectionStatus, onOpenRoomDrawer }: RoomHeaderProps) {
  return (
    <header className="chat-header">
      <button
        type="button"
        className="chat-header__drawer-toggle"
        onClick={onOpenRoomDrawer}
        aria-label="Ver salas disponibles"
      >
        ☰
      </button>
      <div>
        <h1>{room ? room.name : "Realtime Chat"}</h1>
        <p className="chat-header__status">
          <span className="chat-header__dot" data-connected={connectionStatus === "connected"} />
          {STATUS_LABEL[connectionStatus]}
        </p>
      </div>
    </header>
  );
}
