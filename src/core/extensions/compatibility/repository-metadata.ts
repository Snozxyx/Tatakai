/** Catalog detection does not claim execution support for a particular APK. */
export function isAniyomiRepositoryMetadata(value: unknown): boolean {
  return Array.isArray(value) && value.some(row => typeof row?.name === 'string' && row.name.startsWith('Aniyomi: ') && typeof row.apk === 'string' && typeof row.pkg === 'string');
}
