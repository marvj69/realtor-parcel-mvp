/** Match public-record names without assuming which word is a surname. */
export function ownerWords(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function ownerMatchScore(owner: string | null, query: string): number {
  if (!owner) return 0;
  const wanted = ownerWords(query);
  const words = ownerWords(owner);
  if (!wanted.length || !wanted.some(word => word.length >= 2)) return 0;
  // Each query word needs its own owner word; initials and partial names are
  // prefixes, never fuzzy guesses about a different person's identity.
  const remaining = [...words];
  let exact = true;
  for (const word of [...wanted].sort((a, b) => b.length - a.length)) {
    let index = remaining.indexOf(word);
    if (index < 0) {
      index = remaining.findIndex(candidate => candidate.startsWith(word));
      exact = false;
    }
    if (index < 0) return 0;
    remaining.splice(index, 1);
  }
  if (exact && words.length === wanted.length) return 750;
  return exact ? 680 : 560;
}
