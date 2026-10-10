/**
 * Small HTTP boundary shared by the Worker entrypoint and unit tests.
 * Do not include raw provider exceptions, request payloads or API keys in responses/logs.
 */
export class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
    this.code = 'PI_EDGE_CLIENT_ERROR_V1';
  }
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export async function readJsonObject(request, maxBytes = 16 * 1024) {
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    throw new ClientError('请求必须使用 application/json', 415);
  }
  const headerLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(headerLength) && headerLength > maxBytes) {
    throw new ClientError('请求体过大', 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ClientError('请求体不能为空');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ClientError('请求体过大', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  let data;
  try {
    data = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new ClientError('请求不是合法 JSON 对象');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ClientError('请求体必须是 JSON 对象');
  }
  return data;
}

export function publicError(error) {
  // Durable Object RPC reconstructs Errors; custom instanceof checks do not
  // survive the boundary. Enhanced serialization preserves own serializable
  // fields for compatibility dates >= 2026-04-21.
  const isClientError = error instanceof ClientError ||
    (error?.name === 'ClientError' && error?.code === 'PI_EDGE_CLIENT_ERROR_V1');
  if (isClientError && [400, 409, 413, 415].includes(error.status)) {
    const message = typeof error.message === 'string' && error.message.length <= 250
      ? error.message : '请求参数无效';
    return { status: error.status, message };
  }
  return { status: 500, message: '请求未完成。请检查 Workers 日志、运行额度与服务连接。' };
}
