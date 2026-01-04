import { useState, useEffect, useCallback, useRef } from 'react'
import { daemonClient } from '@/lib/daemon'
import { formatError } from '@/utils/errors'
import { daemonService } from '@/services/daemon-service'
import { logger } from '@/lib/logging'

interface UseDaemonConnectionReturn {
  connected: boolean
  connecting: boolean
  error: string | null
  version: string | null
  healthStatus: 'ok' | 'degraded' | null
  latency: number | null
  connect: () => Promise<void>
  reconnect: () => Promise<void>
  checkHealth: () => Promise<void>
}

export function useDaemonConnection(): UseDaemonConnectionReturn {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const retryCount = useRef(0)

  // Measure latency during health check
  const measureLatency = useCallback(async (): Promise<number> => {
    const start = performance.now()
    await daemonClient.health()
    return Math.round(performance.now() - start)
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const start = performance.now()
      const response = await daemonClient.health()
      const measuredLatency = Math.round(performance.now() - start)

      setConnected(true) // Connected if we got a response
      setHealthStatus(response.status)
      setVersion(response.version)
      setLatency(measuredLatency)
      setError(null)
    } catch (err) {
      setConnected(false) // Only false if we can't reach daemon
      setHealthStatus(null)
      setVersion(null)
      setLatency(null)
      setError(await formatError(err))
    }
  }, [])

  const connect = useCallback(async () => {
    if (connecting) return

    setConnecting(true)
    setError(null)

    try {
      await daemonClient.connect()

      // Measure latency during initial connection
      const measuredLatency = await measureLatency()
      const health = await daemonClient.health()

      setConnected(true)
      setHealthStatus(health.status)
      setVersion(health.version)
      setLatency(measuredLatency)
      retryCount.current = 0

      logger.log(`Connected to daemon (latency: ${measuredLatency}ms)`)
    } catch (err: any) {
      setConnected(false)
      setHealthStatus(null)
      setLatency(null)

      // Check if this is first failure and we have a managed daemon
      if (retryCount.current === 0) {
        const isManaged = await daemonService.isDaemonRunning()
        if (!isManaged) {
          // Let DaemonManager handle it
          setError(await formatError(err))
        } else {
          // Managed daemon might be starting, retry
          retryCount.current++
          setTimeout(() => connect(), 2000)
        }
      } else {
        setError(await formatError(err))
      }
    } finally {
      setConnecting(false)
    }
  }, [measureLatency])

  const reconnect = useCallback(async () => {
    try {
      setConnecting(true)
      setError(null)
      setConnected(false)

      await daemonClient.reconnect()
      const measuredLatency = await measureLatency()
      const health = await daemonClient.health()

      setConnected(true)
      setHealthStatus(health.status)
      setVersion(health.version)
      setLatency(measuredLatency)
    } catch (err) {
      setError(await formatError(err))
      setLatency(null)
    } finally {
      setConnecting(false)
    }
  }, [measureLatency])

  // Auto-connect on mount
  useEffect(() => {
    connect()
  }, [connect])

  // Periodic health checks
  useEffect(() => {
    if (!connected) return

    const interval = setInterval(checkHealth, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [connected, checkHealth])

  return {
    connected,
    connecting,
    error,
    version,
    healthStatus,
    latency,
    connect,
    reconnect,
    checkHealth,
  }
}
