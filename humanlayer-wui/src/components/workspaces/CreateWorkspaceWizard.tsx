/**
 * Multi-step wizard for creating workspaces
 */

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { SensitiveInput } from '@/components/ui/sensitive-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { CreateWorkspaceRequest, Workspace } from '@/lib/workspace/types'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

interface CreateWorkspaceWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (workspace: Workspace) => void
}

interface FormData {
  // Basic info
  name: string
  docker_image: string
  docker_image_tag: string
  // Secrets
  humanlayer_api_key: string
  anthropic_api_key: string
  openrouter_api_key: string
  // Git config
  git_enabled: boolean
  gh_token: string
  git_user_name: string
  git_user_email: string
  // Resources (optional)
  cpu_request: string
  memory_request: string
  cpu_limit: string
  memory_limit: string
  data_size: string
  src_size: string
}

const INITIAL_FORM_DATA: FormData = {
  name: '',
  docker_image: 'hld',
  docker_image_tag: 'latest',
  humanlayer_api_key: '',
  anthropic_api_key: '',
  openrouter_api_key: '',
  git_enabled: false,
  gh_token: '',
  git_user_name: '',
  git_user_email: '',
  cpu_request: '100m',
  memory_request: '256Mi',
  cpu_limit: '1000m',
  memory_limit: '1Gi',
  data_size: '10Gi',
  src_size: '10Gi',
}

const STEPS = [
  { id: 1, name: 'Basic Info', description: 'Name and image configuration' },
  { id: 2, name: 'Secrets', description: 'API keys for the workspace' },
  { id: 3, name: 'Git', description: 'Git configuration (optional)' },
  { id: 4, name: 'Resources', description: 'CPU and memory limits (optional)' },
]

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center space-x-2 mb-6">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step.id < currentStep
                ? 'bg-primary text-primary-foreground'
                : step.id === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {step.id < currentStep ? <Check className="h-4 w-4" /> : step.id}
          </div>
          {index < totalSteps - 1 && (
            <div
              className={`w-8 h-0.5 ${
                step.id < currentStep ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function BasicInfoStep({
  formData,
  onChange,
}: {
  formData: FormData
  onChange: (updates: Partial<FormData>) => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace Name *</Label>
        <Input
          ref={nameRef}
          id="name"
          value={formData.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="my-workspace"
          maxLength={63}
        />
        <p className="text-xs text-muted-foreground">
          A unique name for your workspace (max 63 characters)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="docker_image">Docker Image</Label>
          <Input
            id="docker_image"
            value={formData.docker_image}
            onChange={e => onChange({ docker_image: e.target.value })}
            placeholder="hld"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="docker_image_tag">Image Tag</Label>
          <Input
            id="docker_image_tag"
            value={formData.docker_image_tag}
            onChange={e => onChange({ docker_image_tag: e.target.value })}
            placeholder="latest"
          />
        </div>
      </div>
    </div>
  )
}

function SecretsStep({
  formData,
  onChange,
}: {
  formData: FormData
  onChange: (updates: Partial<FormData>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="humanlayer_api_key">HumanLayer API Key</Label>
        <SensitiveInput
          id="humanlayer_api_key"
          value={formData.humanlayer_api_key}
          onChange={e => onChange({ humanlayer_api_key: e.target.value })}
          placeholder="hl_..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="anthropic_api_key">Anthropic API Key (optional)</Label>
        <SensitiveInput
          id="anthropic_api_key"
          value={formData.anthropic_api_key}
          onChange={e => onChange({ anthropic_api_key: e.target.value })}
          placeholder="sk-ant-..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="openrouter_api_key">OpenRouter API Key (optional)</Label>
        <SensitiveInput
          id="openrouter_api_key"
          value={formData.openrouter_api_key}
          onChange={e => onChange({ openrouter_api_key: e.target.value })}
          placeholder="sk-or-..."
        />
      </div>
    </div>
  )
}

function GitConfigStep({
  formData,
  onChange,
}: {
  formData: FormData
  onChange: (updates: Partial<FormData>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="git_enabled"
          checked={formData.git_enabled}
          onCheckedChange={checked => onChange({ git_enabled: checked === true })}
        />
        <Label htmlFor="git_enabled" className="cursor-pointer">
          Enable Git integration
        </Label>
      </div>

      {formData.git_enabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="gh_token">GitHub Token</Label>
            <SensitiveInput
              id="gh_token"
              value={formData.gh_token}
              onChange={e => onChange({ gh_token: e.target.value })}
              placeholder="ghp_..."
            />
            <p className="text-xs text-muted-foreground">
              Personal access token for GitHub operations
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="git_user_name">Git User Name</Label>
              <Input
                id="git_user_name"
                value={formData.git_user_name}
                onChange={e => onChange({ git_user_name: e.target.value })}
                placeholder="Your Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="git_user_email">Git User Email</Label>
              <Input
                id="git_user_email"
                value={formData.git_user_email}
                onChange={e => onChange({ git_user_email: e.target.value })}
                placeholder="you@example.com"
                type="email"
              />
            </div>
          </div>
        </>
      )}

      {!formData.git_enabled && (
        <p className="text-sm text-muted-foreground">
          Skip this step if you don't need Git integration.
        </p>
      )}
    </div>
  )
}

function ResourcesStep({
  formData,
  onChange,
}: {
  formData: FormData
  onChange: (updates: Partial<FormData>) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure resource limits for the workspace. Leave defaults unless you need custom settings.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cpu_request">CPU Request</Label>
          <Input
            id="cpu_request"
            value={formData.cpu_request}
            onChange={e => onChange({ cpu_request: e.target.value })}
            placeholder="100m"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cpu_limit">CPU Limit</Label>
          <Input
            id="cpu_limit"
            value={formData.cpu_limit}
            onChange={e => onChange({ cpu_limit: e.target.value })}
            placeholder="1000m"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="memory_request">Memory Request</Label>
          <Input
            id="memory_request"
            value={formData.memory_request}
            onChange={e => onChange({ memory_request: e.target.value })}
            placeholder="256Mi"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memory_limit">Memory Limit</Label>
          <Input
            id="memory_limit"
            value={formData.memory_limit}
            onChange={e => onChange({ memory_limit: e.target.value })}
            placeholder="1Gi"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="data_size">Data Volume Size</Label>
          <Input
            id="data_size"
            value={formData.data_size}
            onChange={e => onChange({ data_size: e.target.value })}
            placeholder="10Gi"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="src_size">Source Volume Size</Label>
          <Input
            id="src_size"
            value={formData.src_size}
            onChange={e => onChange({ src_size: e.target.value })}
            placeholder="10Gi"
          />
        </div>
      </div>
    </div>
  )
}

export function CreateWorkspaceWizard({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceWizardProps) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { createWorkspace } = useWorkspaceStore()

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setFormData(INITIAL_FORM_DATA)
      setIsSubmitting(false)
    }
  }, [open])

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const isStepValid = (stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1:
        return formData.name.trim().length > 0
      case 2:
        return true // Secrets are optional
      case 3:
        return true // Git config is optional
      case 4:
        return true // Resources have defaults
      default:
        return true
    }
  }

  const handleNext = () => {
    if (step < STEPS.length && isStepValid(step)) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const handleCreate = async () => {
    if (!isStepValid(step)) return

    setIsSubmitting(true)
    try {
      // Build request from form data
      const secrets: Record<string, string> = {}
      if (formData.humanlayer_api_key) {
        secrets.humanlayer_api_key = formData.humanlayer_api_key
      }
      if (formData.anthropic_api_key) {
        secrets.anthropic_api_key = formData.anthropic_api_key
      }
      if (formData.openrouter_api_key) {
        secrets.openrouter_api_key = formData.openrouter_api_key
      }
      if (formData.git_enabled && formData.gh_token) {
        secrets.gh_token = formData.gh_token
      }

      const request: CreateWorkspaceRequest = {
        name: formData.name,
        docker_image: formData.docker_image || undefined,
        docker_image_tag: formData.docker_image_tag || undefined,
        cpu_request: formData.cpu_request || undefined,
        memory_request: formData.memory_request || undefined,
        cpu_limit: formData.cpu_limit || undefined,
        memory_limit: formData.memory_limit || undefined,
        data_size: formData.data_size || undefined,
        src_size: formData.src_size || undefined,
        git_user_name: formData.git_enabled ? formData.git_user_name : undefined,
        git_user_email: formData.git_enabled ? formData.git_user_email : undefined,
        secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
      }

      const workspace = await createWorkspace(request)
      onCreated?.(workspace)
      onOpenChange(false)
    } catch {
      // Error handling is done in the store with toast
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentStepInfo = STEPS[step - 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            {currentStepInfo.name} - {currentStepInfo.description}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator currentStep={step} totalSteps={STEPS.length} />

        <div className="py-4">
          {step === 1 && <BasicInfoStep formData={formData} onChange={updateFormData} />}
          {step === 2 && <SecretsStep formData={formData} onChange={updateFormData} />}
          {step === 3 && <GitConfigStep formData={formData} onChange={updateFormData} />}
          {step === 4 && <ResourcesStep formData={formData} onChange={updateFormData} />}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            {step < STEPS.length ? (
              <Button onClick={handleNext} disabled={!isStepValid(step)}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={!isStepValid(step) || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Workspace'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CreateWorkspaceWizard
