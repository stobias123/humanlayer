import { useDaemonConnection } from '@/hooks/useDaemonConnection'
import { daemonService } from '@/services/daemon-service'
import { getDaemonUrl } from '@/lib/daemon/http-config'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/AppStore'
import { useEffect, useState } from 'react'

export function ConnectionIndicator() {
  const { connected, connecting } = useDaemonConnection()
  const setSettingsDialogOpen = useStore(state => state.setSettingsDialogOpen)
  const [daemonType, setDaemonType] = useState<'managed' | 'external'>('managed')
  const [daemonUrl, setDaemonUrl] = useState<string | null>(null)

  useEffect(() => {
    async function loadConnectionInfo() {
      const type = daemonService.getDaemonType()
      setDaemonType(type)

      try {
        const url = await getDaemonUrl()
        setDaemonUrl(url)
      } catch {
        setDaemonUrl(null)
      }
    }

    loadConnectionInfo()
  }, [connected])

  function getStatusDot() {
    if (connecting) {
      return 'bg-amber-500 animate-pulse'
    }
    if (!connected) {
      return 'bg-[var(--terminal-error)]'
    }
    if (daemonType === 'external') {
      return 'bg-blue-500'
    }
    return 'bg-[var(--terminal-success)]'
  }

  function getStatusLabel() {
    if (connecting) {
      return 'Connecting'
    }
    if (!connected) {
      return 'Disconnected'
    }
    if (daemonType === 'external') {
      // Show a truncated URL for remote connections
      if (daemonUrl) {
        try {
          const url = new URL(daemonUrl)
          return `Remote: ${url.host}`
        } catch {
          return 'Remote'
        }
      }
      return 'Remote'
    }
    return 'Local'
  }

  function getTooltipContent() {
    if (!connected) {
      return 'Click to configure daemon connection'
    }
    if (daemonType === 'external') {
      return `Connected to remote daemon at ${daemonUrl || 'unknown URL'}`
    }
    return 'Connected to local managed daemon'
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setSettingsDialogOpen(true)}
          className="inline-flex items-center gap-1.5 px-1.5 py-0.5 text-xs font-mono border border-border bg-background text-foreground hover:bg-accent/10 transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot()}`} />
          <span className="uppercase tracking-wider">{getStatusLabel()}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{getTooltipContent()}</p>
      </TooltipContent>
    </Tooltip>
  )
}
