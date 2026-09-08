// Per-instance caches contain immutable public-source records, never user work.
export class BoundedCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;

  constructor(private readonly maxEntries: number, private readonly maxBytes: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number) {
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.bytes;
      this.entries.delete(key);
    }
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
