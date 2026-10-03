import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canSendMobileMessages } from '../config/roles';
import { messageMatchesEmail, normalizeMessageRecipient } from '../utils/messageRecipients';
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

function messageText(message) {
  return message.message || message.body || message.preview || '';
}

function messageTime(message) {
  const value = message.createdAt || message.timestamp;
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Just now';
}

function messageMillis(message) {
  const value = message.createdAt || message.timestamp;
  if (value?.toMillis) return value.toMillis();
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date?.getTime?.() || 0;
}

function belongsToAccount(message, account, user) {
  const normalized = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const accountAliases = [
    account.username,
    account.name,
    account.id,
    account.email,
  ].map(normalized).filter(Boolean);
  const userEmail = normalized(user.email);
  const senderEmail = normalized(message.senderEmail || message.sender);
  const recipientEmail = normalized(message.recipientEmail || message.recipient);
  const sentByUser = message.senderId === user.uid ||
    (message.source === 'website' && senderEmail === userEmail);
  const sentToUser = message.recipientAuthUid === user.uid ||
    recipientEmail === userEmail ||
    normalized(message.recipientSearch) === userEmail;
  const sentByAccount = (account.authUid && message.senderId === account.authUid) ||
    accountAliases.includes(senderEmail) ||
    accountAliases.includes(normalized(message.senderId));
  const sentToAccount = (account.authUid && message.recipientAuthUid === account.authUid) ||
    accountAliases.includes(normalized(message.recipientSearch)) ||
    accountAliases.includes(recipientEmail);

  return (sentByUser && sentToAccount) || (sentByAccount && sentToUser);
}

export default function MessagesPage({ userRole }) {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [contactSearch, setContactSearch] = useState('');
  const [messages, setMessages] = useState([]);
  const [inboxMessages, setInboxMessages] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const conversationEndRef = useRef(null);

  const canSend = canSendMobileMessages(userRole);

  useEffect(() => {
    const email = normalizeMessageRecipient(user?.email);
    if (!email) return undefined;

    let normalizedDocs = [];
    let legacyDocs = [];
    let normalizedLoaded = false;
    let legacyLoaded = false;

    function publishInbox() {
      const uniqueMessages = new Map();
      [...normalizedDocs, ...legacyDocs].forEach((item) => {
        const message = { id: item.id, ...item.data() };
        if (messageMatchesEmail(message, email)) uniqueMessages.set(message.id, message);
      });

      setInboxMessages(Array.from(uniqueMessages.values()).sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || a.timestamp || 0).getTime();
        const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || b.timestamp || 0).getTime();
        return bTime - aTime;
      }));
      if (normalizedLoaded && legacyLoaded) setInboxLoading(false);
    }

    const messagesRef = collection(db, 'messages');
    const stopNormalized = onSnapshot(
      query(messagesRef, where('recipientSearch', '==', email)),
      (snapshot) => {
        normalizedDocs = snapshot.docs;
        normalizedLoaded = true;
        publishInbox();
      },
      (error) => {
        console.warn('Inbox listener error:', error.message);
        normalizedLoaded = true;
        setInboxLoading(false);
      },
    );
    const stopLegacy = onSnapshot(
      query(messagesRef, where('recipient', '==', user.email)),
      (snapshot) => {
        legacyDocs = snapshot.docs;
        legacyLoaded = true;
        publishInbox();
      },
      (error) => {
        console.warn('Legacy inbox listener error:', error.message);
        legacyLoaded = true;
        setInboxLoading(false);
      },
    );

    return () => {
      stopNormalized();
      stopLegacy();
    };
  }, [user?.email]);

  useEffect(() => {
    if (!canSend) {
      return undefined;
    }

    let active = true;
    const stopMessages = onSnapshot(
      collection(db, 'messages'),
      (snapshot) => {
        const nextMessages = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        nextMessages.sort((a, b) => messageMillis(b) - messageMillis(a));
        setMessages(nextMessages);
        setLoading(false);
      },
      (err) => {
        console.warn('Failed to listen for messages:', err.message);
        setNotice({ type: 'error', text: 'Unable to load messages.' });
        setLoading(false);
      },
    );

    getDocs(query(collection(db, 'mobile_accounts'), orderBy('createdAt', 'desc'), limit(50)))
      .then((snapshot) => {
        if (!active) return;
        setAccounts(snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })));
      })
      .catch((err) => {
        console.warn('Failed to load mobile contacts:', err.message);
        if (active) setNotice({ type: 'error', text: 'Unable to load mobile contacts.' });
      })
      .finally(() => {
        if (active) setContactsLoading(false);
      });

    return () => {
      active = false;
      stopMessages();
    };
  }, [canSend]);

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
        recipientAuthUid: selectedAccount.authUid || '',
        recipientEmail: selectedAccount.email || '',
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

  async function markInboxMessageRead(message) {
    if (message.unread === false || message.status === 'read') return;
    try {
      await updateDoc(doc(db, 'messages', message.id), {
        unread: false,
        status: 'read',
        readAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Failed to mark inbox message as read:', error.message);
    }
  }

  const visibleMessages = selectedAccount
    ? messages
      .filter((item) => belongsToAccount(item, selectedAccount, user))
      .sort((a, b) => messageMillis(a) - messageMillis(b))
    : messages;

  const filteredAccounts = accounts.filter((account) => (
    `${account.name || ''} ${account.username || ''} ${account.site || ''}`
      .toLowerCase()
      .includes(contactSearch.trim().toLowerCase())
  ));

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedAccount?.id, visibleMessages.length]);

  useEffect(() => {
    if (!selectedAccount) return;
    messages.filter((item) => belongsToAccount(item, selectedAccount, user)).forEach((item) => {
      const sentByUser = item.senderId === user.uid ||
        (item.source === 'website' && (item.senderEmail || '').toLowerCase() === (user.email || '').toLowerCase());
      if (!sentByUser && item.unread !== false && item.status !== 'read') {
        updateDoc(doc(db, 'messages', item.id), {
          unread: false,
          status: 'read',
          readAt: serverTimestamp(),
        }).catch((error) => {
          console.warn('Failed to mark conversation message as read:', error.message);
        });
      }
    });
  }, [selectedAccount, messages, user]);

  return (
    <div className="messages-page">
      {!canSend && <section className="messages-panel website-inbox">
        <header className="message-history-header">
          <div>
            <h3>Inbox</h3>
            <p>Messages sent to {user.email}</p>
          </div>
          <span>{inboxMessages.filter((item) => item.unread !== false && item.status !== 'read').length} unread</span>
        </header>
        {inboxLoading && user.email ? (
          <p className="messages-empty">Loading inbox...</p>
        ) : !user.email ? (
          <p className="messages-empty">Your account has no email address for receiving messages.</p>
        ) : inboxMessages.length === 0 ? (
          <p className="messages-empty">No messages have been sent to your account.</p>
        ) : (
          <div className="website-inbox-list">
            {inboxMessages.map((item) => {
              const unread = item.unread !== false && item.status !== 'read';
              const createdAt = item.createdAt?.toDate?.() || item.timestamp?.toDate?.() ||
                (item.createdAt || item.timestamp ? new Date(item.createdAt || item.timestamp) : null);
              return (
                <article className={`website-inbox-message ${unread ? 'unread' : ''}`} key={item.id}>
                  <div className="website-inbox-message-header">
                    <div>
                      <strong>{item.subject || 'Message'}</strong>
                      <span>From {item.senderEmail || item.sender || 'HAZORA user'}</span>
                    </div>
                    <time>{createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString() : 'Just now'}</time>
                  </div>
                  <p>{item.message || item.body || item.preview || ''}</p>
                  {unread && (
                    <button type="button" onClick={() => markInboxMessageRead(item)}>
                      Mark as read
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>}

      {canSend && (
      <section className="messages-panel messenger-panel">
        <aside className="messenger-contacts">
          <div className="messenger-contacts-header">
            <div>
              <h2>Messages</h2>
              <p>Chat with mobile users</p>
            </div>
            <span>{accounts.length}</span>
          </div>
          <div className="contact-search">
            <input
              type="search"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Search people or sites"
              aria-label="Search mobile users"
            />
          </div>
          <div className="contact-list">
            {contactsLoading ? (
              <p className="messages-empty">Loading contacts...</p>
            ) : accounts.length === 0 ? (
              <p className="messages-empty">No mobile accounts found.</p>
            ) : filteredAccounts.length === 0 ? (
              <p className="messages-empty">No contacts match your search.</p>
            ) : (
              filteredAccounts.map((account) => {
                const accountMessages = messages.filter((item) => belongsToAccount(item, account, user));
                const latestMessage = accountMessages[0];
                const unreadCount = accountMessages.filter((item) => (
                  item.senderId !== user.uid &&
                  item.unread !== false &&
                  item.status !== 'read'
                )).length;
                return (
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
                    <small>{latestMessage ? messageText(latestMessage) : account.site || account.username || 'Mobile user'}</small>
                  </span>
                  <span className="contact-meta">
                    {latestMessage && <time>{messageTime(latestMessage)}</time>}
                    {unreadCount > 0 && <span className="contact-unread">{unreadCount}</span>}
                  </span>
                </button>
                );
              })
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
                  <p>{selectedAccount.site || selectedAccount.username || 'Mobile user'}</p>
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
              <div className="conversation-empty">
                <span className="contact-avatar" aria-hidden="true">
                  {(selectedAccount.name || selectedAccount.username || '?').trim().charAt(0).toUpperCase()}
                </span>
                <strong>Start a conversation</strong>
                <p>Send a message to {selectedAccount.name || selectedAccount.username}.</p>
              </div>
            ) : (
              visibleMessages.map((item) => {
                const sentByUser = item.senderId === user.uid ||
                  (item.source === 'website' && (item.senderEmail || '').toLowerCase() === (user.email || '').toLowerCase());
                return (
                  <article className={`chat-message ${sentByUser ? 'sent' : 'received'}`} key={item.id}>
                    {!sentByUser && (
                      <span className="message-avatar" aria-hidden="true">
                        {(selectedAccount.name || selectedAccount.username || '?').trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="chat-message-content">
                      <p className="chat-bubble">{messageText(item)}</p>
                      <span className="chat-message-meta">
                        {messageTime(item)}
                        {sentByUser && ` · ${item.status === 'read' || item.unread === false ? 'Seen' : 'Sent'}`}
                      </span>
                    </div>
                  </article>
                );
              })
            )}
            <div ref={conversationEndRef} />
          </div>

          <form className="message-form messenger-composer" onSubmit={handleSubmit}>
            <input
              id="message-recipient"
              type="hidden"
              value={form.recipient}
              readOnly
            />
            <div className="message-field">
              <label className="visually-hidden" htmlFor="message-body">Message</label>
              <textarea
                id="message-body"
                value={form.message}
                onChange={(e) => handleChange('message', e.target.value)}
                placeholder={selectedAccount ? 'Type a message… (Enter to send, Shift+Enter for a new line)' : 'Select a person first'}
                disabled={sending || !selectedAccount}
                rows={3}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
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
      )}
    </div>
  );
}
