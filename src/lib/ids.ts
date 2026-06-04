let seq = 0;
/** Collision-resistant id for client-only records (offers' checkout tokens, notifications). */
export const uid = (prefix = "") =>
  `${prefix}${Date.now().toString(36)}-${(seq++).toString(36)}`;
