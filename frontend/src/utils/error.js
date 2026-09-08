/**
 * Safely extracts a human-readable error message from an error object (e.g. Axios error).
 * Guarantees that `{}` or `[object Object]` or empty strings are never returned.
 */
export function getErrorMessage(err, fallback = 'An unexpected error occurred.') {
  if (!err) return fallback;

  // If already a non-empty string
  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (trimmed && trimmed !== '{}' && trimmed !== '[]' && trimmed !== '[object Object]') {
      return trimmed;
    }
    return fallback;
  }

  const data = err.response?.data;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed && trimmed !== '{}' && trimmed !== '[]' && trimmed !== '[object Object]') {
      return trimmed;
    }
  } else if (data && typeof data === 'object') {
    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail.trim();
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
    if (Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
      const first = String(data.non_field_errors[0]).trim();
      if (first) return first;
    }

    // Try finding the first field error
    const entries = Object.entries(data);
    for (const [key, val] of entries) {
      if (Array.isArray(val) && val.length > 0) {
        const first = String(val[0]).trim();
        if (first) {
          const fieldLabel = key === 'non_field_errors' ? '' : `${key.replace(/_/g, ' ')}: `;
          return `${fieldLabel}${first}`;
        }
      } else if (typeof val === 'string' && val.trim()) {
        const fieldLabel = key === 'non_field_errors' ? '' : `${key.replace(/_/g, ' ')}: `;
        return `${fieldLabel}${val.trim()}`;
      }
    }
  }

  if (typeof err.message === 'string' && err.message.trim()) {
    const msg = err.message.trim();
    if (msg && msg !== '{}' && msg !== '[object Object]') {
      return msg;
    }
  }

  return fallback;
}

export default getErrorMessage;
