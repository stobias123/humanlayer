import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logging'
import { Link, Server, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { resetWorkspaceClient } from '@/lib/workspace/client'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const WORKSPACE_DAEMON_URL_KEY = 'workspace.daemon.url'
const DEFAULT_WORKSPACE_DAEMON_URL = 'http://localhost:8888'

export function WorkspaceDaemonPanel() {
  const [customUrl, setCustomUrl] = useState('')
  const [currentUrl, setCurrentUrl] = useState<string>(DEFAULT_WORKSPACE_DAEMON_URL)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const fetchWorkspaces = useWorkspaceStore(state => state.fetchWorkspaces)

  useEffect(() => {
    loadCurrentUrl()
  }, [])

  useEffect(() => {
    // Test connection whenever currentUrl changes
    if (currentUrl) {
      testConnection(currentUrl)
    }
  }, [currentUrl])

  function loadCurrentUrl() {
    const stored = localStorage.getItem(WORKSPACE_DAEMON_URL_KEY)
    setCurrentUrl(stored || DEFAULT_WORKSPACE_DAEMON_URL)
  }

  async function testConnection(url: string) {
    try {
      const response = await fetch(`${url}/api/v1/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        setIsConnected(true)
        setConnectError(null)
      } else {
        setIsConnected(false)
        setConnectError(`Server returned ${response.status}`)
      }
    } catch (error) {
      setIsConnected(false)
      logger.debug('[WorkspaceDaemonPanel] Health check failed:', error)
    }
  }

  async function handleConnect() {
    setConnectError(null)
    setIsConnecting(true)

    let url = customUrl.trim()

    // Allow just a port number for convenience
    if (!isNaN(Number(url))) {
      url = `http://127.0.0.1:${url}`
    }

    try {
      // Test the connection BEFORE saving
      const response = await fetch(`${url}/api/v1/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }

      // Connection successful - save the URL
      localStorage.setItem(WORKSPACE_DAEMON_URL_KEY, url)

      // Reset the singleton client so it picks up the new URL
      resetWorkspaceClient()

      setCurrentUrl(url)
      setCustomUrl('')
      setIsConnected(true)
      toast.success('Connected to workspace daemon', {
        description: url,
      })

      // Trigger a refresh in the workspace store with the new client
      fetchWorkspaces()
    } catch (error: any) {
      setConnectError(error.message || 'Failed to connect')
      setIsConnected(false)
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleReset() {
    setConnectError(null)
    setIsConnecting(true)

    try {
      localStorage.removeItem(WORKSPACE_DAEMON_URL_KEY)
      resetWorkspaceClient()
      setCurrentUrl(DEFAULT_WORKSPACE_DAEMON_URL)

      // Check if default is available
      try {
        const response = await fetch(`${DEFAULT_WORKSPACE_DAEMON_URL}/api/v1/health`)
        if (response.ok) {
          setIsConnected(true)
          toast.success('Reset to default workspace daemon URL')
        } else {
          setIsConnected(false)
          toast.info('Reset to default URL', {
            description: 'Workspace daemon is not running at default address',
          })
        }
      } catch {
        setIsConnected(false)
        toast.info('Reset to default URL', {
          description: 'Workspace daemon is not running at default address',
        })
      }
      // Trigger a refresh with the new client
      fetchWorkspaces()
    } catch (error: any) {
      setConnectError(error.message || 'Failed to reset')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleTestConnection() {
    setConnectError(null)
    await testConnection(currentUrl)
    if (isConnected) {
      toast.success('Connection OK')
    }
  }

  return (
    <div className="space-y-4">
      {/* Current connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Current URL</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded">{currentUrl}</code>
          <span
            className={`text-sm font-medium ${
              isConnected === true
                ? 'text-[var(--terminal-success)]'
                : isConnected === false
                  ? 'text-[var(--terminal-error)]'
                  : 'text-muted-foreground'
            }`}
          >
            {isConnected === true ? '●' : isConnected === false ? '○' : '?'}
          </span>
        </div>
      </div>

      {/* Test connection button */}
      <Button
        onClick={handleTestConnection}
        className="w-full"
        variant="outline"
        size="sm"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Test Connection to {currentUrl}
      </Button>

      {/* Reset to default if not using default */}
      {currentUrl !== DEFAULT_WORKSPACE_DAEMON_URL && (
        <Button
          onClick={handleReset}
          className="w-full"
          variant="outline"
          size="sm"
          disabled={isConnecting}
        >
          {isConnecting ? 'Resetting...' : 'Reset to Default'}
        </Button>
      )}

      {/* Connect to custom URL */}
      <div className="space-y-2">
        <Label htmlFor="workspace-daemon-url" className="text-sm">
          Connect to Remote Workspace Daemon
        </Label>
        <div className="flex gap-2">
          <Input
            id="workspace-daemon-url"
            type="text"
            placeholder="http://192.168.1.100:8888 or just 8888"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            className="flex-1"
            onKeyDown={e => {
              if (e.key === 'Enter' && customUrl) {
                handleConnect()
              }
            }}
          />
          <Button
            onClick={handleConnect}
            disabled={!customUrl || isConnecting}
            variant="outline"
            size="sm"
          >
            <Link className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter a full URL or just a port number for localhost
        </p>
      </div>

      {connectError && <p className="text-sm text-destructive">{connectError}</p>}
    </div>
  )
}
