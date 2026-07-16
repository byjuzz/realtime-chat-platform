import { ChatRoom } from "./components/ChatRoom";
import { JoinForm } from "./components/JoinForm";
import { useChatSocket } from "./hooks/useChatSocket";
import "./App.css";

function App() {
  const { connected, currentUser, users, messages, joinError, sendError, join, sendMessage } =
    useChatSocket();

  return (
    <div className="chat-card">
      <header className="chat-header">
        <h1>Realtime Chat</h1>
        <p className="chat-header__status">
          <span className="chat-header__dot" data-connected={connected} />
          {connected ? "Conectado" : "Desconectado"}
        </p>
      </header>

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
    </div>
  );
}

export default App;
