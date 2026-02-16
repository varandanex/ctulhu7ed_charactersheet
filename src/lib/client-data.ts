export function clearClientData() {
  localStorage.clear();
  sessionStorage.clear();

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [rawName] = cookie.split("=");
    const name = rawName?.trim();
    if (!name) continue;

    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

export function hasStoredProgress() {
  return (
    localStorage.getItem("coc7-character-draft") !== null ||
    localStorage.length > 0 ||
    sessionStorage.length > 0 ||
    document.cookie.trim().length > 0
  );
}
