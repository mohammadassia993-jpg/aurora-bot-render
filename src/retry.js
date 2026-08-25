export const DEFAULT_RETRY_DELAYS_MS = [5000, 15000, 60000];

export async function retry(operation, {
  delays = DEFAULT_RETRY_DELAYS_MS,
  scope = 'operation',
  onError
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (caught) {
      lastError = caught;
      if (onError) await onError(caught, attempt + 1);
      if (attempt === delays.length) break;
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
  lastError.scope = lastError.scope || scope;
  throw lastError;
}
