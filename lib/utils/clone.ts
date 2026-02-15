export function cloneRecord<T>(record: T): T {
  return JSON.parse(JSON.stringify(record));
}
