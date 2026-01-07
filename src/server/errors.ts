export const errorResponse = (code: string, message: string, details?: unknown) => ({
  error: {
    code,
    message,
    details
  }
});
