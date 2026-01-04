import { Middleware, ErrorContext } from './generated/runtime'

/**
 * Check if an error is an AbortError (intentional request cancellation)
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    // DOMException with name 'AbortError' or Error with 'abort' in message
    return (
      error.name === 'AbortError' ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      error.message.toLowerCase().includes('abort')
    )
  }
  return false
}

export interface ErrorInterceptorOptions {
  onError?: (error: Error, context: ErrorContext) => void
  logErrors?: boolean
}

export function createErrorInterceptor(options: ErrorInterceptorOptions = {}): Middleware {
  const { onError, logErrors = true } = options

  return {
    async onError(context: ErrorContext): Promise<Response | void> {
      const error = context.error instanceof Error ? context.error : new Error(String(context.error))

      // Skip logging for AbortErrors - they're expected during polling
      if (isAbortError(context.error)) {
        return undefined
      }

      // Log error for debugging
      if (logErrors) {
        console.error('[HLD SDK] Fetch error:', {
          url: context.url,
          method: context.init.method,
          error: error.message,
        })
      }

      // Call custom error handler if provided
      if (onError) {
        onError(error, context)
      }

      // Don't return alternative response - let error propagate
      // but we've logged it for debugging
      return undefined
    }
  }
}