import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDaemonConnection } from '@/hooks/useDaemonConnection'
import { clearStoredDaemonUrl, getDaemonUrl, storeDaemonUrl } from '@/lib/daemon/http-config'
import { logger } from '@/lib/logging'
import { daemonService } from '@/services/daemon-service'
import { Link, Server } from 'lucide-react'
import { useEffect, useState } from 'react'

interface DaemonConnectionPanelProps {
  /** Whether to show as a compact inline view (for settings) vs full card (for debug) */
  variant?: 'card' | 'inline'
  /** Callback when connection changes */
  onConnectionChange?: () => void
}

export function DaemonConnectionPanel({
  variant = 'card',
  onConnectionChange,
}: DaemonConnectionPanelProps) {
  const { connected, reconnect } = useDaemonConnection()
  const [customUrl, setCustomUrl] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [daemonType, setDaemonType] = useState<'managed' | 'external'>('managed')
  const [actualDaemonUrl, setActualDaemonUrl] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    loadConnectionInfo()
  }, [connected])

  async function loadConnectionInfo() {
    try {
      const type = daemonService.getDaemonType()
      setDaemonType(type)

      // Get the actual daemon URL being used
      try {
        const url = await getDaemonUrl()
        setActualDaemonUrl(url)
      } catch (error) {
        logger.error('Failed to get daemon URL:', error)
        setActualDaemonUrl(null)
      }
    } catch (error) {
      logger.error('Failed to load connection info:', error)
    }
  }

  async function handleConnectToCustom() {
    setConnectError(null)
    setIsConnecting(true)

    let url = customUrl.trim()

    // Allow just a port number for convenience
    if (!isNaN(Number(url))) {
      url = `http://127.0.0.1:${url}`
    }

    try {
      await daemonService.connectToExisting(url)
      await storeDaemonUrl(url)
      await reconnect()
      await loadConnectionInfo()
      setCustomUrl('')
      onConnectionChange?.()
    } catch (error: any) {
      setConnectError(error.message || 'Failed to connect')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSwitchToManaged() {
    setConnectError(null)
    setIsConnecting(true)

    try {
      await daemonService.switchToManagedDaemon()
      await clearStoredDaemonUrl()
      await reconnect()
      await loadConnectionInfo()
      onConnectionChange?.()
    } catch (error: any) {
      setConnectError(error.message || 'Failed to switch to managed daemon')
    } finally {
      setIsConnecting(false)
    }
  }

  if (variant === 'inline') {
    return (
      <div className="space-y-4">
        {/* Current connection status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Current Connection</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium ${
                connected ? 'text-[var(--terminal-success)]' : 'text-[var(--terminal-error)]'
              }`}
            >
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <span className="text-sm text-muted-foreground capitalize">({daemonType})</span>
          </div>
        </div>

        {/* Display current daemon URL */}
        {actualDaemonUrl && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Daemon URL</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{actualDaemonUrl}</code>
          </div>
        )}

        {/* Switch to managed if currently external */}
        {daemonType === 'external' && (
          <Button
            onClick={handleSwitchToManaged}
            className="w-full"
            variant="outline"
            size="sm"
            disabled={isConnecting}
          >
            {isConnecting ? 'Switching...' : 'Switch to Managed Daemon'}
          </Button>
        )}

        {/* Connect to custom URL */}
        <div className="space-y-2">
          <Label htmlFor="custom-daemon-url" className="text-sm">
            Connect to Remote Daemon
          </Label>
          <div className="flex gap-2">
            <Input
              id="custom-daemon-url"
              type="text"
              placeholder="http://192.168.1.100:7777 or just 7777"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              className="flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && customUrl) {
                  handleConnectToCustom()
                }
              }}
            />
            <Button
              onClick={handleConnectToCustom}
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

  // Card variant (for DebugPanel)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Connect to Existing Daemon</CardTitle>
        <CardDescription className="text-xs">
          Connect to a daemon running on a custom URL (or provide a port number).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current connection info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Connection Type</span>
            <div className="flex items-center gap-2">
              <Server className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium capitalize">{daemonType}</span>
            </div>
          </div>

          {actualDaemonUrl && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Daemon URL</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">{actualDaemonUrl}</code>
            </div>
          )}
        </div>

        {/* Switch to managed if currently external */}
        {daemonType === 'external' && (
          <Button
            onClick={handleSwitchToManaged}
            className="w-full"
            variant="outline"
            disabled={isConnecting}
          >
            {isConnecting ? 'Switching...' : 'Switch to Managed Daemon'}
          </Button>
        )}

        {/* Connect to custom URL */}
        <div className="space-y-2">
          <Label htmlFor="url" className="text-sm">
            Daemon URL
          </Label>
          <Input
            id="url"
            type="text"
            placeholder="http://127.0.0.1:7777"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && customUrl) {
                handleConnectToCustom()
              }
            }}
          />
        </div>

        <Button
          onClick={handleConnectToCustom}
          disabled={!customUrl || isConnecting}
          className="w-full"
          variant="outline"
        >
          <Link className="mr-2 h-4 w-4" />
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>

        {connectError && <p className="text-sm text-destructive">{connectError}</p>}
      </CardContent>
    </Card>
  )
}
