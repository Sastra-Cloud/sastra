export function channelIdFromPathname(pathname: string) {
  const match = /^\/chat\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
