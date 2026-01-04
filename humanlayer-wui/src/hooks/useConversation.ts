import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { daemonClient, ConversationEvent } from '@/lib/daemon'
import { formatError } from '@/utils/errors'
import { useStore } from '@/AppStore'
import { conversationFetcher } from '@/lib/daemon/deduped-fetcher'

interface UseConversationReturn {
  events: ConversationEvent[]
  loading: boolean
  error: string | null
  isInitialLoad: boolean
  refresh: () => Promise<void>
}

export function useConversation(
  sessionId?: string,
  claudeSessionId?: string,
  basePollInterval: number = 1000,
): UseConversationReturn {
  const activeSessionDetail = useStore(state => state.activeSessionDetail)
  const updateActiveSessionConversation = useStore(state => state.updateActiveSessionConversation)
  const connectionLatency = useStore(state => state.connectionLatency)
  const sessionStatus = activeSessionDetail?.session.status
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCount, setErrorCount] = useState(0)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Calculate adaptive poll interval based on latency
  // Formula: max(latency * 3, basePollInterval, 2000ms minimum for remote)
  const pollInterval = useMemo(() => {
    if (!connectionLatency) {
      return basePollInterval // No latency data, use default
    }

    // If latency > 50ms, treat as remote and use minimum 2000ms
    const isRemote = connectionLatency > 50
    const minInterval = isRemote ? 2000 : basePollInterval

    // Poll at 3x latency to avoid overlapping requests
    const latencyBasedInterval = connectionLatency * 3

    return Math.max(latencyBasedInterval, minInterval)
  }, [connectionLatency, basePollInterval])

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)

  // Get events from store if this is the active session
  const events = (
    activeSessionDetail?.session.id === sessionId ? activeSessionDetail?.conversation : []
  ) as ConversationEvent[]

  const fetchConversation = useCallback(async () => {
    if (errorCount > 3) {
      return
    }

    if (!sessionId && !claudeSessionId) {
      setError('Either sessionId or claudeSessionId must be provided')
      setLoading(false)
      return
    }

    // Use deduplication - if request is in flight, this will return existing promise
    const dedupKey = `conversation:${sessionId || claudeSessionId}`

    try {
      setLoading(true)
      setError(null)

      const response = await conversationFetcher.fetch(dedupKey, () =>
        daemonClient.getConversation({ session_id: sessionId, claude_session_id: claudeSessionId }),
      )

      // Only update state if still mounted
      if (!isMountedRef.current) return

      // Update the store if this is the active session
      if (activeSessionDetail?.session.id === sessionId) {
        updateActiveSessionConversation(response)
      }

      setErrorCount(0)
      setIsInitialLoad(false)
    } catch (err: any) {
      // Only update state if still mounted
      if (!isMountedRef.current) return

      console.log(
        '[useConversation] Error fetching conversation:',
        err,
        'sessionStatus:',
        sessionStatus,
      )

      setError(await formatError(err))
      setErrorCount(prev => prev + 1)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [sessionId, claudeSessionId, errorCount, activeSessionDetail, updateActiveSessionConversation])

  // Store the latest fetchConversation function in a ref
  const fetchConversationRef = useRef(fetchConversation)
  fetchConversationRef.current = fetchConversation

  useEffect(() => {
    isMountedRef.current = true

    // Don't poll if sessionId is undefined (e.g., for draft sessions)
    if (!sessionId) {
      return
    }

    // Only poll if this is the active session
    if (activeSessionDetail?.session.id !== sessionId) {
      return
    }

    // Initial fetch
    fetchConversationRef.current()

    const interval = setInterval(() => {
      fetchConversationRef.current()
    }, pollInterval)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
  }, [sessionId, activeSessionDetail?.session.id, pollInterval])

  return {
    events,
    loading,
    error,
    refresh: fetchConversation,
    isInitialLoad,
  }
}

// Formatted conversation for display
export interface FormattedMessage {
  id: number
  type: 'message' | 'tool_call' | 'tool_result' | 'approval'
  role?: string
  content: string
  timestamp: Date
  metadata?: {
    toolName?: string
    toolId?: string
    approvalStatus?: string
    approvalId?: string
  }
}

export function useFormattedConversation(
  sessionId?: string,
  claudeSessionId?: string,
): UseConversationReturn & { formattedEvents: FormattedMessage[] } {
  const base = useConversation(sessionId, claudeSessionId)

  const formattedEvents: FormattedMessage[] = base.events
    .filter(event => event.id !== undefined)
    .map(event => {
      let content = event.content || ''
      let type: FormattedMessage['type'] = 'message'

      if (event.eventType === 'tool_call') {
        type = 'tool_call'
        content = `Calling ${event.toolName || 'tool'}`
        if (event.toolInputJson) {
          try {
            const input = JSON.parse(event.toolInputJson)
            content += `: ${JSON.stringify(input, null, 2)}`
          } catch {
            content += `: ${event.toolInputJson}`
          }
        }
      } else if (event.eventType === 'tool_result') {
        type = 'tool_result'
        content = event.toolResultContent || 'Tool completed'
      } else if (event.approvalStatus) {
        type = 'approval'
        content = `Approval ${event.approvalStatus}`
      }

      return {
        id: event.id!,
        type,
        role: event.role,
        content,
        timestamp: new Date(event.createdAt || new Date()),
        metadata: {
          toolName: event.toolName,
          toolId: event.toolId,
          approvalStatus: event.approvalStatus || undefined,
          approvalId: event.approvalId,
        },
      }
    })

  return {
    ...base,
    formattedEvents,
  }
}
