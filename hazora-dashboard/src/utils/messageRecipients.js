export function normalizeMessageRecipient(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function messageMatchesEmail(message, email) {
  const normalizedEmail = normalizeMessageRecipient(email);
  if (!normalizedEmail) return false;

  return normalizeMessageRecipient(message?.recipientSearch) === normalizedEmail ||
    normalizeMessageRecipient(message?.recipient) === normalizedEmail;
}