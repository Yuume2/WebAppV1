import { cookies } from 'next/headers';

export async function serverApiHeaders(): Promise<Record<string, string>> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  return cookie ? { cookie } : {};
}
