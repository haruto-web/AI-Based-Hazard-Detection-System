import { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canSendMobileMessages } from '../config/roles';
import { sanitizeInput } from '../utils/security';
import '../styles/MessagesPage.css';

const initialForm = {
  recipient: '',
  message: '',
};

function getRecipientType(value) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'email';
  }

  if (/^[a-z0-9_-]+$/i.test(value)) {
    return 'username_or_id';
  }

  return 'name';
}

export default function MessagesPage({ userRole }) {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);

  const allowed = canSendMobileMessages(userRole);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return undefined;
    }

    async function loadMessages() {
      try {
        const messagesQuery = query(
          collection(db, 'messages'),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(messagesQuery);
        setMessages(snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })));
      } catch (err) {
        console.warn('Failed to load messages:', err.message);
        setNotice({ type: 'error', text: 'Unable to load sent messages.' });
      } finally {
        setLoading(false);
      }
    }

    loadMessages();
    return undefined;
  }, [allowed]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setNotice(null);

    const recipient = sanitizeInput(form.recipient.trim());
    const message = sanitizeInput(form.message.trim());

    if (recipient.length < 3) {
      setNotice({ type: 'error', text: 'Enter a valid email, ID, username, or name.' });
      return;
    }

    if (message.length < 2) {
      setNotice({ type: 'error', text: 'Message cannot be empty.' });
      return;
    }

    setSending(true);
    try {
      const messageData = {
        recipient,
        recipientType: getRecipientType(recipient),
        recipientSearch: recipient.toLowerCase(),
        message,
        body: message,
        preview: message,
        subject: 'Website Message',
        status: 'unread',
        unread: true,
        source: 'website',
        sender: user.email || 'Website user',
        senderId: user.uid,
        senderEmail: user.email || '',
        senderRole: userRole || '',
        createdAt: serverTimestamp(),
        readAt: null,
      };

      const docRef = await addDoc(collection(db, 'messages'), messageData);
      setMessages((prev) => [{ id: docRef.id, ...messageData, createdAt: new Date() }, ...prev]);
      setForm(initialForm);
      setNotice({ type: 'success', text: 'Message sent to the mobile app.' });
    } catch (err) {
      console.warn('Failed to send message:', err.message);
      setNotice({ type: 'error', text: 'Failed to send message. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  if (!allowed) {
    return (
      <div className="messages-page">
        <section className="messages-panel">
          <h2>Messages</h2>
          <p className="messages-empty">Only head-office users can send messages to the mobile app.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <section className="messages-panel">
        <div className="messages-header">
          <div>
            <h2>Website to App Messaging</h2>
            <p>Send a message to a mobile user by email, ID, username, or name.</p>
          </div>
        </div>

        {notice && (
          <div className={`messages-notice ${notice.type}`}>
            {notice.text}
          </div>
        )}

        <form className="message-form" onSubmit={handleSubmit}>
          <div className="message-field">
            <label htmlFor="message-recipient">Email / ID / Username / Name</label>
            <input
              id="message-recipient"
              type="text"
              value={form.recipient}
              onChange={(e) => handleChange('recipient', e.target.value)}
              placeholder="user@email.com, MOB-001, or Juan Dela Cruz"
              disabled={sending}
            />
          </div>

          <div className="message-field">
            <label htmlFor="message-body">Message</label>
            <textarea
              id="message-body"
              value={form.message}
              onChange={(e) => handleChange('message', e.target.value)}
              placeholder="Type message for mobile user"
              disabled={sending}
              rows={5}
            />
          </div>

          <div className="message-actions">
            <button type="submit" disabled={sending}>
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </section>

      <section className="messages-panel">
        <h3>Sent Messages</h3>
        {loading ? (
          <p className="messages-empty">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="messages-empty">No messages sent yet.</p>
        ) : (
          <div className="message-list">
            {messages.map((item) => (
              <article className="message-row" key={item.id}>
                <div className="message-row-main">
                  <div className="message-row-top">
                    <strong>{item.recipient}</strong>
                    <span className={`message-status ${item.status || 'unread'}`}>
                      {item.status || 'unread'}
                    </span>
                  </div>
                  <p>{item.message}</p>
                </div>
                <span className="message-sender">{item.senderEmail || 'Website user'}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
