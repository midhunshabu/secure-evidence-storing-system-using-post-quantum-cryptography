export const PQID_BYPASS_USERNAMES = new Set()

export const isPqidBypassUser = (userOrName) => {
  const username = typeof userOrName === 'string' ? userOrName : userOrName?.username
  return PQID_BYPASS_USERNAMES.has(String(username || '').trim().toLowerCase())
}
