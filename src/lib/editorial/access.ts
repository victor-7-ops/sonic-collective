export type EditorialRole = 'owner' | 'editor' | 'contributor';

export function isEditorialPath(path: string): boolean {
  return ['/admin', '/auth', '/preview', '/api/editorial'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin
    && request.headers.get('sec-fetch-site') !== 'cross-site';
}

export function privateHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

export async function readEditorialForm(request: Request): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    throw new Error('Unsupported form format');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing form');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new Error('Form is too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
