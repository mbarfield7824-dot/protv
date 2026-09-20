import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'I can explain operations and prepare safe catalog metadata or poster changes. Every change requires your separate confirmation. I never publish, delete, or upload video.',
};

export default function AdminAssistantPanel() {
  const { isAdmin } = useAuth();
  const [messages, setMessages] = useState([welcomeMessage]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [contextCatalogId, setContextCatalogId] = useState(null);
  const messageListRef = useRef(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  if (!isAdmin) {
    return <p className="admin-error">Administrator access is required.</p>;
  }

  const addMessage = (role, text) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text }]);
  };

  const confirmAction = async () => {
    if (!pendingAction || sending) return;
    addMessage('admin', 'Confirm');
    setSending(true);
    try {
      const response = await api.confirmAdminAssistantAction(
        pendingAction.endpoint,
        pendingAction.confirmationId,
        pendingAction.catalogId
      );
      addMessage('success', response.reply);
      setPendingAction(null);
    } catch (error) {
      addMessage('error', error.message || 'The confirmed catalog change failed.');
      setPendingAction(null);
    } finally {
      setSending(false);
    }
  };

  const cancelAction = () => {
    addMessage('admin', 'Cancel');
    addMessage('system', 'The proposed change was cancelled. No catalog data was changed.');
    setPendingAction(null);
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || sending) return;

    if (pendingAction) {
      if (/^(confirm|yes|approve)$/i.test(text)) {
        setMessage('');
        await confirmAction();
        return;
      }
      if (/^(cancel|no|stop)$/i.test(text)) {
        setMessage('');
        cancelAction();
        return;
      }
      addMessage('system', 'Confirm or cancel the pending change before starting another request.');
      return;
    }

    addMessage('admin', text);
    setMessage('');
    setSending(true);
    try {
      const history = messages
        .filter((item) => ['admin', 'assistant', 'action', 'success'].includes(item.role))
        .slice(-10)
        .map((item) => ({
          role: item.role === 'admin' ? 'admin' : 'assistant',
          text: item.text,
        }));
      const response = await api.sendAdminAssistantMessage(text, contextCatalogId, history);
      addMessage(response.action ? 'action' : 'assistant', response.reply);
      setPendingAction(response.action || null);
      if (response.contextCatalogId) setContextCatalogId(response.contextCatalogId);
    } catch (error) {
      addMessage('error', error.message || 'The Administrator Assistant could not answer that request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="admin-assistant-panel">
      <div className="admin-bot-heading">
        <div>
          <h2>Administrator Assistant</h2>
          <p>Ask about catalog operations, ingestion status, rights checks, or recent failures.</p>
        </div>
        <span className="admin-assistant-safe-actions">Confirmation required</span>
      </div>

      <div
        className="admin-assistant-messages"
        ref={messageListRef}
        role="log"
        aria-live="polite"
        aria-label="Administrator Assistant conversation"
      >
        {messages.map((item) => (
          <article
            className={`admin-assistant-message admin-assistant-message-${item.role}`}
            key={item.id}
          >
            <strong>
              {item.role === 'admin'
                ? 'Admin'
                : item.role === 'success'
                  ? 'Change completed'
                  : item.role === 'error'
                    ? 'Error'
                    : item.role === 'action'
                      ? 'Proposed action'
                      : item.role === 'assistant' ? 'Assistant' : 'System'}
            </strong>
            <p>{item.text}</p>
          </article>
        ))}
        {pendingAction && !sending && (
          <div className="admin-assistant-confirmation">
            <button className="admin-submit" type="button" onClick={() => void confirmAction()}>
              Confirm Change
            </button>
            <button className="admin-secondary" type="button" onClick={cancelAction}>
              Cancel
            </button>
          </div>
        )}
        {sending && (
          <article className="admin-assistant-message admin-assistant-message-system">
            <span className="admin-assistant-spinner" aria-hidden="true" />
            <p>Assistant is thinking...</p>
          </article>
        )}
      </div>

      <form className="admin-assistant-form" onSubmit={(event) => void sendMessage(event)}>
        <label htmlFor="admin-assistant-message">Message</label>
        <div>
          <textarea
            id="admin-assistant-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask: Why did an ingestion fail?"
            rows={3}
            maxLength={4000}
            disabled={sending}
          />
          <button className="admin-submit" type="submit" disabled={sending || !message.trim()}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
