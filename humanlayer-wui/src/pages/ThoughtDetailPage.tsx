import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '@/AppStore'
import { daemonClient } from '@/lib/daemon'
import { getLastWorkingDir } from '@/hooks/useSessionLauncher'
import type { Thought } from '@/lib/daemon/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MarkdownRenderer } from '@/components/internal/SessionDetail/MarkdownRenderer'
import {
  Loader2,
  ChevronLeft,
  FileText,
  BookOpen,
  ClipboardList,
  Package,
  Calendar,
  User,
  Tag,
  Play,
} from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { toast } from 'sonner'

const TYPE_ICONS: Record<string, typeof FileText> = {
  research: BookOpen,
  plan: ClipboardList,
  ticket: FileText,
  handoff: Package,
  other: FileText,
}

const TYPE_COLORS: Record<string, string> = {
  research: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  plan: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ticket: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  handoff: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  complete: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

export function ThoughtDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const workingDir = getLastWorkingDir()
  const refreshSessions = useStore(state => state.refreshSessions)
  const [thought, setThought] = useState<Thought | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isImplementing, setIsImplementing] = useState(false)

  // Extract path from URL (everything after /thoughts/)
  const thoughtPath = decodeURIComponent(location.pathname.replace(/^\/thoughts\//, ''))

  const fetchThought = useCallback(async () => {
    if (!workingDir || !thoughtPath) {
      setError('Invalid path or working directory')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await daemonClient.getThought(thoughtPath, workingDir)
      setThought(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thought')
    } finally {
      setLoading(false)
    }
  }, [workingDir, thoughtPath])

  useEffect(() => {
    fetchThought()
  }, [fetchThought])

  // Implement plan - creates a session to implement this plan
  const handleImplementPlan = useCallback(async () => {
    if (!workingDir || !thought) return

    try {
      setIsImplementing(true)
      // Create a draft session with the implement_plan skill invocation
      const response = await daemonClient.launchSession({
        query: `/implement_plan thoughts/${thought.path}`,
        title: `[implementation] ${thought.frontmatter?.topic || thought.filename}`,
        working_dir: workingDir,
        draft: true,
      })

      // Refresh sessions to include the new draft
      await refreshSessions()

      // Navigate to the session
      toast.success('Session created to implement plan')
      navigate(`/sessions/${response.sessionId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create implementation session')
    } finally {
      setIsImplementing(false)
    }
  }, [workingDir, thought, refreshSessions, navigate])

  // Keyboard shortcuts
  useHotkeys(
    'escape',
    () => {
      navigate('/thoughts')
    },
    {
      scopes: [HOTKEY_SCOPES.ROOT],
      preventDefault: true,
    },
  )

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  // Extract content without frontmatter for rendering
  const getContentWithoutFrontmatter = (content: string | undefined) => {
    if (!content) return ''
    // Remove YAML frontmatter (between --- markers)
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n*/
    return content.replace(frontmatterRegex, '').trim()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !thought) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">{error || 'Thought not found'}</p>
        <Button variant="outline" onClick={() => navigate('/thoughts')}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Thoughts
        </Button>
      </div>
    )
  }

  const TypeIcon = TYPE_ICONS[thought.type] || FileText
  const cleanContent = getContentWithoutFrontmatter(thought.content)

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <nav className="sticky top-0 z-10 flex items-center justify-between gap-4 py-2 bg-background/95 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => navigate('/thoughts')}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Thoughts
        </Button>
        {thought.type === 'plan' && (
          <Button onClick={handleImplementPlan} disabled={isImplementing} size="sm">
            {isImplementing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Implement Plan
          </Button>
        )}
      </nav>

      {/* Metadata */}
      <div className="flex flex-col gap-4 p-4 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-3">
          <TypeIcon className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{thought.frontmatter?.topic || thought.filename}</h1>
          <Badge variant="secondary" className={TYPE_COLORS[thought.type] || TYPE_COLORS.other}>
            {thought.type}
          </Badge>
          {thought.frontmatter?.status && (
            <Badge variant="secondary" className={STATUS_COLORS[thought.frontmatter.status] || ''}>
              {thought.frontmatter.status.replace('_', ' ')}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {thought.frontmatter?.date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(thought.frontmatter.date)}</span>
            </div>
          )}
          {thought.frontmatter?.researcher && (
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>{thought.frontmatter.researcher}</span>
            </div>
          )}
          {thought.frontmatter?.lastUpdated && (
            <div className="flex items-center gap-1">
              <span className="text-xs">Updated:</span>
              <span>{formatDate(thought.frontmatter.lastUpdated)}</span>
            </div>
          )}
        </div>

        {thought.frontmatter?.tags && thought.frontmatter.tags.length > 0 && (
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-wrap gap-1">
              {thought.frontmatter.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground font-mono">{thought.path}</div>
      </div>

      {/* Content */}
      <div className="prose-terminal">
        <MarkdownRenderer content={cleanContent} />
      </div>
    </div>
  )
}
