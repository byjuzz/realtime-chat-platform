import type { RoomJoinRequestPayload } from "@realtime-chat/shared";

export interface JoinRequestPanelProps {
  requests: RoomJoinRequestPayload[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export function JoinRequestPanel({ requests, onApprove, onReject }: JoinRequestPanelProps) {
  if (requests.length === 0) return null;

  return (
    <div className="join-request-panel" role="status" aria-live="polite">
      {requests.map((request) => (
        <div key={request.requestId} className="join-request-panel__item">
          <span>
            <strong>{request.requester.name}</strong> quiere entrar a tu sala privada.
          </span>
          <div className="join-request-panel__actions">
            <button type="button" className="chat-button chat-button--ghost" onClick={() => onReject(request.requestId)}>
              Rechazar
            </button>
            <button type="button" className="chat-button" onClick={() => onApprove(request.requestId)}>
              Aprobar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
