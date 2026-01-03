{{/*
Expand the name of the chart.
*/}}
{{- define "hld-workspace.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "hld-workspace.fullname" -}}
{{- printf "hld-%s" .Values.workspace.id | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Namespace name for this workspace
*/}}
{{- define "hld-workspace.namespace" -}}
{{- printf "workspace-%s" .Values.workspace.id }}
{{- end }}

{{/*
Ingress hostname
*/}}
{{- define "hld-workspace.ingressHost" -}}
{{- if .Values.ingress.host }}
{{- .Values.ingress.host }}
{{- else }}
{{- printf "workspace-%s.workspaces.local" .Values.workspace.id }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "hld-workspace.labels" -}}
helm.sh/chart: {{ include "hld-workspace.name" . }}
app.kubernetes.io/name: {{ include "hld-workspace.name" . }}
app.kubernetes.io/instance: {{ .Values.workspace.id }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
workspace.humanlayer.dev/id: {{ .Values.workspace.id }}
workspace.humanlayer.dev/name: {{ .Values.workspace.name }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "hld-workspace.selectorLabels" -}}
app.kubernetes.io/name: hld
app.kubernetes.io/instance: {{ .Values.workspace.id }}
{{- end }}
