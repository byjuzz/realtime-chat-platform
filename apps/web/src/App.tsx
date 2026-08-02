import { useEffect, useRef, useState } from "react";
import { ChatRoom } from "./components/ChatRoom";
import { JoinForm } from "./components/JoinForm";
import { RoomHeader } from "./components/RoomHeader";
import { RoomSelector } from "./components/RoomSelector";
import { CreateRoomModal } from "./components/CreateRoomModal";
import { JoinRequestPanel } from "./components/JoinRequestPanel";
import { useChatSocket } from "./hooks/useChatSocket";
import { useRooms } from "./hooks/useRooms";
import "./App.css";

function App() {
  const {
    connectionStatus,
    currentUser,
    activeRoom,
    users,
    messages,
    joinError,
    sendError,
    historyLoading,
    historyError,
    hasMoreHistory,
    roomTransitioning,
    pendingApproval,
    joinRequests,
    join,
    switchRoom,
    sendMessage,
    loadMoreHistory,
    approveJoinRequest,
    rejectJoinRequest,
  } = useChatSocket();

  const { rooms, loadingRooms, roomsError, creatingRoom, createRoomError, refreshRooms, createRoom } = useRooms();

  const [roomDrawerOpen, setRoomDrawerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const previousConnectionStatus = useRef(connectionStatus);

  useEffect(() => {
    void refreshRooms();
  }, [refreshRooms]);

  // Refresca la lista de salas al recuperar el foco de la ventana (sin polling).
  useEffect(() => {
    function handleFocus() {
      void refreshRooms();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshRooms]);

  // Refresca la lista tras reconectar (transición reconnecting -> connected).
  useEffect(() => {
    if (previousConnectionStatus.current === "reconnecting" && connectionStatus === "connected") {
      void refreshRooms();
    }
    previousConnectionStatus.current = connectionStatus;
  }, [connectionStatus, refreshRooms]);

  function handleOpenRoomDrawer() {
    setRoomDrawerOpen(true);
    void refreshRooms();
  }

  async function handleSelectRoom(slug: string) {
    setRoomDrawerOpen(false);
    await switchRoom(slug);
  }

  async function handleCreateRoom(name: string, isPrivate: boolean) {
    const room = await createRoom(name, isPrivate, currentUser?.guestUserId);
    if (room) {
      setCreateModalOpen(false);
      setRoomDrawerOpen(false);
      await switchRoom(room.slug);
    }
  }

  return (
    <div className="app-shell">
      <div className={`room-drawer-backdrop${roomDrawerOpen ? " room-drawer-backdrop--open" : ""}`} onClick={() => setRoomDrawerOpen(false)} />
      <div className={`room-drawer${roomDrawerOpen ? " room-drawer--open" : ""}`}>
        <RoomSelector
          rooms={rooms}
          activeRoomSlug={activeRoom?.slug}
          loadingRooms={loadingRooms}
          roomsError={roomsError}
          disabled={roomTransitioning}
          onSelectRoom={handleSelectRoom}
          onOpenCreateRoom={() => setCreateModalOpen(true)}
        />
      </div>

      <div className="chat-card">
        <RoomHeader room={activeRoom} connectionStatus={connectionStatus} onOpenRoomDrawer={handleOpenRoomDrawer} />

        <JoinRequestPanel requests={joinRequests} onApprove={approveJoinRequest} onReject={rejectJoinRequest} />

        {pendingApproval ? (
          <JoinForm onJoin={join} error={joinError} submitting={roomTransitioning} pendingApproval />
        ) : currentUser && activeRoom ? (
          <ChatRoom
            currentUser={currentUser}
            users={users}
            messages={messages}
            sendError={sendError}
            historyLoading={historyLoading}
            historyError={historyError}
            hasMoreHistory={hasMoreHistory}
            disabled={roomTransitioning}
            onSend={sendMessage}
            onLoadMoreHistory={loadMoreHistory}
          />
        ) : (
          <JoinForm onJoin={join} error={joinError} submitting={roomTransitioning} />
        )}
      </div>

      <CreateRoomModal
        open={createModalOpen}
        submitting={creatingRoom}
        error={createRoomError}
        onCreate={handleCreateRoom}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  );
}

export default App;
