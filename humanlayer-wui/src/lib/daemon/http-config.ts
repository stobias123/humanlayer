import { daemonService } from '@/services/daemon-service'
import { connectionStore } from '@/services/connection-store'
import { logger } from '@/lib/logging'
import { getAppVersion } from '@/lib/version'
import { isTauri } from '@/lib/utils'

const DAEMON_URL_STORAGE_KEY = 'codelayer.daemon.url'

// Get daemon URL from environment or managed daemon
export async function getDaemonUrl(): Promise<string> {
  // Check for custom URL from debug panel first (in-memory override)
  if ((window as any).__HUMANLAYER_DAEMON_URL) {
    return (window as any).__HUMANLAYER_DAEMON_URL
  }

  // Check Tauri store for persisted connection (when in Tauri)
  if (isTauri()) {
    try {
      const activeConnection = await connectionStore.getActiveConnection()
      if (activeConnection?.url) {
        logger.log('Using daemon URL from Tauri store:', activeConnection.url)
        return activeConnection.url
      }
    } catch (error) {
      logger.warn('Failed to get daemon URL from Tauri store:', error)
    }
  } else if (typeof window !== 'undefined') {
    // Check localStorage for persisted URL (web builds only)
    const storedUrl = localStorage.getItem(DAEMON_URL_STORAGE_KEY)
    if (storedUrl) {
      logger.log('Using daemon URL from localStorage:', storedUrl)
      return storedUrl
    }
  }

  // Check for explicit URL from environment
  if (import.meta.env.VITE_HUMANLAYER_DAEMON_URL) {
    return import.meta.env.VITE_HUMANLAYER_DAEMON_URL
  }

  // Check if we have a managed daemon
  try {
    const daemonInfo = await daemonService.getDaemonInfo()
    if (daemonInfo && daemonInfo.port) {
      return `http://localhost:${daemonInfo.port}`
    }
  } catch (error) {
    logger.warn('Failed to get managed daemon info:', error)
  }

  // Check for port override
  const port = import.meta.env.VITE_HUMANLAYER_DAEMON_HTTP_PORT || '7777'
  const host = import.meta.env.VITE_HUMANLAYER_DAEMON_HTTP_HOST || 'localhost'

  return `http://${host}:${port}`
}

// Store daemon URL persistently
export async function storeDaemonUrl(url: string): Promise<void> {
  if (isTauri()) {
    // In Tauri, create/update a quick connection in the store
    try {
      const state = await connectionStore.getState()
      // Look for an existing "Quick Connect" entry or create a new one
      let quickConnection = state.connections.find(c => c.name === 'Quick Connect')

      if (quickConnection) {
        quickConnection.url = url
        quickConnection.lastUsed = new Date().toISOString()
        await connectionStore.saveConnection(quickConnection)
      } else {
        quickConnection = {
          id: connectionStore.generateId(),
          name: 'Quick Connect',
          url,
          lastUsed: new Date().toISOString(),
        }
        await connectionStore.saveConnection(quickConnection)
      }

      await connectionStore.setActiveConnection(quickConnection.id)
      logger.log('Stored daemon URL to Tauri store:', url)
    } catch (error) {
      logger.error('Failed to store daemon URL to Tauri store:', error)
    }
  } else if (typeof window !== 'undefined') {
    // In web builds, use localStorage
    localStorage.setItem(DAEMON_URL_STORAGE_KEY, url)
    logger.log('Stored daemon URL to localStorage:', url)
  }
}

// Clear stored daemon URL
export async function clearStoredDaemonUrl(): Promise<void> {
  if (isTauri()) {
    try {
      await connectionStore.setActiveConnection(null)
      logger.log('Cleared active daemon connection from Tauri store')
    } catch (error) {
      logger.error('Failed to clear daemon connection from Tauri store:', error)
    }
  }

  if (typeof window !== 'undefined') {
    localStorage.removeItem(DAEMON_URL_STORAGE_KEY)
    logger.log('Cleared daemon URL from localStorage')
  }
}

// Headers to include with all requests
export function getDefaultHeaders(): Record<string, string> {
  return {
    'X-Client': 'codelayer',
    'X-Client-Version': getAppVersion(), // Use standardized version (e.g., "0.1.0-20250910-143022-nightly")
  }
}
