import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { daemonClient } from '@/lib/daemon'
import { getLastWorkingDir } from '@/hooks/useSessionLauncher'
import type { Thought } from '@/lib/daemon/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, ChevronLeft, FileText, BookOpen, ClipboardList, Package } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'

type ThoughtFilter = 'all' | 'research' | 'plans'

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

export function ThoughtsPage() {
  const navigate = useNavigate()
  const workingDir = getLastWorkingDir()
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ThoughtFilter>('all')
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  const fetchThoughts = useCallback(async () => {
    if (!workingDir) {
      setError('No working directory set')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await daemonClient.listThoughts(workingDir, filter)
      setThoughts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thoughts')
    } finally {
      setLoading(false)
    }
  }, [workingDir, filter])

  useEffect(() => {
    fetchThoughts()
  }, [fetchThoughts])

  const handleThoughtClick = (thought: Thought) => {
    navigate(`/thoughts/${encodeURIComponent(thought.path)}`)
  }

  // Keyboard navigation
  useHotkeys(
    'j',
    () => {
      setFocusedIndex(prev => Math.min(prev + 1, thoughts.length - 1))
    },
    {
      scopes: [HOTKEY_SCOPES.ROOT],
      enabled: thoughts.length > 0,
    },
  )

  useHotkeys(
    'k',
    () => {
      setFocusedIndex(prev => Math.max(prev - 1, 0))
    },
    {
      scopes: [HOTKEY_SCOPES.ROOT],
      enabled: thoughts.length > 0,
    },
  )

  useHotkeys(
    'enter',
    () => {
      if (focusedIndex >= 0 && focusedIndex < thoughts.length) {
        handleThoughtClick(thoughts[focusedIndex])
      }
    },
    {
      scopes: [HOTKEY_SCOPES.ROOT],
      enabled: focusedIndex >= 0,
    },
    [focusedIndex, thoughts],
  )

  useHotkeys(
    'escape',
    () => {
      navigate('/')
    },
    {
      scopes: [HOTKEY_SCOPES.ROOT],
      preventDefault: true,
    },
  )

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Sessions
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="sticky top-0 z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Sessions
          </Button>
          <Tabs value={filter} onValueChange={value => setFilter(value as ThoughtFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="research">Research</TabsTrigger>
              <TabsTrigger value="plans">Plans</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </nav>

      {thoughts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
          <FileText className="w-12 h-12" />
          <p>No thoughts found in {workingDir}/thoughts/shared/</p>
          <p className="text-sm">Create research docs or implementation plans to see them here</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[150px]">Researcher</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {thoughts.map((thought, index) => {
              const TypeIcon = TYPE_ICONS[thought.type] || FileText
              const isFocused = index === focusedIndex
              return (
                <TableRow
                  key={thought.path}
                  className={`cursor-pointer transition-colors ${
                    isFocused ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => handleThoughtClick(thought)}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TypeIcon className="w-4 h-4" />
                      <Badge
                        variant="secondary"
                        className={TYPE_COLORS[thought.type] || TYPE_COLORS.other}
                      >
                        {thought.type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {thought.frontmatter?.topic || thought.filename}
                      </span>
                      {thought.frontmatter?.tags && thought.frontmatter.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {thought.frontmatter.tags.slice(0, 3).map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {thought.frontmatter.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{thought.frontmatter.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {thought.frontmatter?.status && (
                      <Badge
                        variant="secondary"
                        className={STATUS_COLORS[thought.frontmatter.status] || ''}
                      >
                        {thought.frontmatter.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(thought.frontmatter?.date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {thought.frontmatter?.researcher || '-'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
