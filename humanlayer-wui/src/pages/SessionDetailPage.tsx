import { useStore } from '@/AppStore'
import SessionDetail from '@/components/internal/SessionDetail'
import { Button } from '@/components/ui/button'
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const activeSessionDetail = useStore(state => state.activeSessionDetail)
  const fetchActiveSessionDetail = useStore(state => state.fetchActiveSessionDetail)
  // Get the session from store if available for most up-to-date state (moved before early returns)
  const sessionFromStore = useStore(state => state.sessions.find(s => s.id === sessionId))

  // Track the previous session ID to detect navigation to different session
  const prevSessionIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (sessionId) {
      // Only fetch if this is a different session than what's cached
      // This prevents refetch when navigating back to the same session
      if (activeSessionDetail?.session?.id !== sessionId) {
        fetchActiveSessionDetail(sessionId)
      }
    }

    prevSessionIdRef.current = sessionId

    // Don't clear on unmount - keep data cached for faster back-navigation
    // Data will be refreshed when navigating to a different session
    return () => {
      // Only clear if we're navigating to a DIFFERENT session
      // This is handled by the fetch above, not cleanup
    }
  }, [sessionId, fetchActiveSessionDetail, activeSessionDetail?.session?.id])

  const handleClose = () => {
    navigate('/')
  }

  // Show loading state only if we don't have a session at all
  if (!activeSessionDetail && !sessionId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">No session selected</h2>
        </div>
      </div>
    )
  }

  // Show error state only if we have an error and no session data
  if (activeSessionDetail?.error && !activeSessionDetail?.session?.id) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Session not found</h2>
          <p className="text-muted-foreground mb-4">{activeSessionDetail.error}</p>
          <Button onClick={handleClose} className="text-primary hover:underline">
            ← Back to Sessions
          </Button>
        </div>
      </div>
    )
  }

  // Render SessionDetail even during loading so it can show its skeleton UI
  // Use cached data if available for the current session, otherwise use store/placeholder
  // Priority: matching cached session > any cached session > store session > fallback
  const getSession = () => {
    const cachedSession = activeSessionDetail?.session
    if (cachedSession && cachedSession.id === sessionId) {
      return cachedSession
    }
    if (cachedSession && cachedSession.id) {
      return cachedSession // Show cached session while loading new one
    }
    if (sessionFromStore) {
      return { ...sessionFromStore, fromStore: true }
    }
    return {
      id: sessionId || '',
      runId: '',
      query: '',
      status: 'unknown' as any,
      model: '',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      summary: '',
      autoAcceptEdits: false,
      dangerouslySkipPermissions: false,
      dangerouslySkipPermissionsExpiresAt: undefined,
    }
  }
  const session = getSession()

  return (
    <div className="h-full">
      <SessionDetail session={session} onClose={handleClose} />
    </div>
  )
}
