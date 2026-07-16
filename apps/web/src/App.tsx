import { ChatRoom } from "./components/ChatRoom";
import { JoinForm } from "./components/JoinForm";
import { useChatSocket } from "./hooks/useChatSocket";
import "./App.css";

function App() {
  const { connected, currentUser, users, messages, joinError, sendError, join, sendMessage } =
    useChatSocket();

  return (
    <main>
      <h1>Realtime Chat — MVP</h1>
      <p>Estado de conexión: {connected ? "conectado" : "desconectado"}</p>
      {currentUser ? (
        <ChatRoom
          currentUser={currentUser}
          users={users}
          messages={messages}
          sendError={sendError}
          onSend={sendMessage}
        />
      ) : (
        <JoinForm onJoin={join} error={joinError} />
      )}
    </main>
  );
}

export default App;
