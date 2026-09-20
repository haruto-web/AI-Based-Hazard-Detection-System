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
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);

  const allowed = canSendMobileMessages(userRole);

  useEffect(() => {
    if (!allowed) {
      return undefined;
    }

    async function loadMessages() {
      try {
        const [messagesSnapshot, accountsSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'messages'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'mobile_accounts'), orderBy('createdAt', 'desc'))),
        ]);
        setMessages(messagesSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })));
        setAccounts(accountsSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })));
      } catch (err) {
        console.warn('Failed to load messages:', err.message);
        setNotice({ type: 'error', text: 'Unable to load sent messages.' });
      } finally {
        setLoading(false);
        setContactsLoading(false);
      }
    }

    loadMessages();
    return undefined;
  }, [allowed]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleAccountSelect(account) {
    setSelectedAccount(account);
    handleChange('recipient', account.username || account.name || '');
    setNotice(null);
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

  const visibleMessages = selectedAccount
    ? messages.filter((item) => {
        const recipient = (item.recipient || '').toLowerCase();
        return [selectedAccount.username, selectedAccount.name, selectedAccount.id]
          .filter(Boolean)
          .some((value) => recipient === value.toLowerCase());
      })
    : messages;

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
      <section className="messages-panel messenger-panel">
        <aside className="messenger-contacts">
          <div className="messenger-contacts-header">
            <div>
              <h2>Messages</h2>
              <p>Select a mobile user</p>
            </div>
            <span>{accounts.length}</span>
          </div>
          <div className="contact-list">
            {contactsLoading ? (
              <p className="messages-empty">Loading contacts...</p>
            ) : accounts.length === 0 ? (
              <p className="messages-empty">No mobile accounts found.</p>
            ) : (
              accounts.map((account) => (
                <button
                  type="button"
                  className={`contact-item ${selectedAccount?.id === account.id ? 'active' : ''}`}
                  key={account.id}
                  onClick={() => handleAccountSelect(account)}
                >
                  <span className="contact-avatar" aria-hidden="true">
                    {(account.name || account.username || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="contact-details">
                    <strong>{account.name || account.username}</strong>
                    <small>{account.username || 'Mobile user'}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="messenger-conversation">
          <div className="conversation-header">
            {selectedAccount ? (
              <>
                <span className="contact-avatar" aria-hidden="true">
                  {(selectedAccount.name || selectedAccount.username || '?').trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <h2>{selectedAccount.name || selectedAccount.username}</h2>
                  <p>{selectedAccount.username || 'Mobile user'}</p>
                </div>
              </>
            ) : (
              <div>
                <h2>Choose a conversation</h2>
                <p>Select a person on the left to start messaging.</p>
              </div>
            )}
          </div>

          {notice && (
            <div className={`messages-notice ${notice.type}`}>
              {notice.text}
            </div>
          )}

          <div className="conversation-messages">
            {loading ? (
              <p className="messages-empty">Loading messages...</p>
            ) : !selectedAccount ? (
              <p className="messages-empty">Choose a person to view the conversation.</p>
            ) : visibleMessages.length === 0 ? (
              <p className="messages-empty">No messages with this person yet.</p>
            ) : (
              visibleMessages.map((item) => (
                <article className="message-row" key={item.id}>
                  <div className="message-row-main">
                    <div className="message-row-top">
                      <span className="message-avatar" aria-hidden="true">
                        {(selectedAccount.name || selectedAccount.username || '?').trim().charAt(0).toUpperCase()}
                      </span>
                      <strong>{selectedAccount.name || item.recipient}</strong>
                      <span className={`message-status ${item.status || 'unread'}`}>
                        {item.status || 'unread'}
                      </span>
                    </div>
                    <p className="message-bubble">{item.message}</p>
                  </div>
                  <span className="message-sender">From {item.senderEmail || 'Website user'}</span>
                </article>
              ))
            )}
          </div>

          <form className="message-form messenger-composer" onSubmit={handleSubmit}>
            <input
              id="message-recipient"
              type="hidden"
              value={form.recipient}
              readOnly
            />
            <div className="message-field">
              <label htmlFor="message-body">Message</label>
              <textarea
                id="message-body"
                value={form.message}
                onChange={(e) => handleChange('message', e.target.value)}
                placeholder={selectedAccount ? `Message ${selectedAccount.name || selectedAccount.username}` : 'Select a person first'}
                disabled={sending || !selectedAccount}
                rows={3}
              />
            </div>

            <div className="message-actions">
              <button type="submit" disabled={sending || !selectedAccount}>
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
