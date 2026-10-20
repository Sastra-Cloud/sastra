/** A quoted display name keeps workspace punctuation out of address syntax. */
export function correspondenceFrom(address: string, workspaceName?: string | null): string {
  const name = workspaceName?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!name) return address;
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${address}>`;
}
