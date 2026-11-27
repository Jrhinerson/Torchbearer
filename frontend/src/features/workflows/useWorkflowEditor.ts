import { useEffect, useState } from 'react'
import { ApiError } from '../../lib/api'
import { blockNavigation } from '../../lib/navigation'
import { getWorkflowGraph, saveWorkflowGraph } from './api'
import type { WorkflowGraph, WorkflowGraphDetail } from './api'
import { graphErrors } from './graph'

function errorMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(errorMessages)
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(errorMessages)
  return []
}

export function useWorkflowEditor(
  detail: WorkflowGraphDetail | null,
  onSaved: (value: WorkflowGraphDetail) => void,
) {
  const [draft, setDraft] = useState<{
    base: WorkflowGraphDetail
    graph: WorkflowGraph
  } | null>(null)
  const [pending, setPending] = useState<'save' | 'reload' | null>(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [latest, setLatest] = useState<WorkflowGraphDetail | null>(null)
  const [navigation, setNavigation] = useState<(() => void) | null>(null)
  const busy = pending !== null
  const dirty = Boolean(
    draft && JSON.stringify(draft.graph) !== JSON.stringify(draft.base.graph),
  )
  const errors = draft ? graphErrors(draft.graph) : []

  useEffect(() => {
    if (!dirty && !busy) return
    const unblock = blockNavigation((proceed) => {
      if (busy)
        setNotice('Wait for the current request to finish before leaving.')
      else setNavigation(() => proceed)
    })
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      unblock()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [dirty, busy])

  function reset() {
    setDraft(null)
    setError('')
    setFieldErrors([])
    setConflict(false)
    setLatest(null)
    setNotice('')
  }

  function start() {
    if (!detail?.graph || busy) return
    reset()
    setDraft({ base: detail, graph: structuredClone(detail.graph) })
  }

  function change(graph: WorkflowGraph) {
    if (busy) return
    setDraft((current) => current && { ...current, graph })
    setFieldErrors([])
    setNotice('')
    if (!conflict) setError('')
  }

  function cancel() {
    if (busy) return
    if (latest) onSaved(latest)
    reset()
  }

  async function save() {
    if (!draft || busy || !dirty || errors.length || conflict) return
    setPending('save')
    setError('')
    setFieldErrors([])
    setNotice('')
    try {
      const result = await saveWorkflowGraph(
        draft.base.key,
        draft.graph,
        draft.base.revision,
      )
      onSaved(result)
      reset()
      setNotice('Workflow saved.')
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.status === 409)
      setError(
        cause instanceof Error ? cause.message : 'Could not save the workflow.',
      )
      if (
        cause instanceof ApiError &&
        cause.status === 400 &&
        cause.body &&
        typeof cause.body === 'object'
      ) {
        setFieldErrors([...new Set(errorMessages(cause.body))])
      }
    } finally {
      setPending(null)
    }
  }

  async function loadLatest() {
    if (!draft || busy) return
    setPending('reload')
    try {
      setLatest(await getWorkflowGraph(draft.base.key))
      setNotice(
        'Latest version loaded. Compare it with your draft before choosing which changes to keep.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load the latest workflow.',
      )
    } finally {
      setPending(null)
    }
  }

  function keepDraft() {
    if (!latest?.graph || !draft || busy) return
    onSaved(latest)
    setDraft({ ...draft, base: latest })
    setConflict(false)
    setLatest(null)
    setError('')
    setNotice(
      'Draft kept against the latest revision. Review your changes before saving.',
    )
  }

  function discardAndLeave() {
    const proceed = navigation
    cancel()
    setNavigation(null)
    proceed?.()
  }

  return {
    draft,
    busy,
    pending,
    dirty,
    errors,
    error,
    fieldErrors,
    notice,
    conflict,
    latest,
    navigation,
    start,
    change,
    cancel,
    save,
    loadLatest,
    keepDraft,
    discardAndLeave,
    keepEditing: () => setNavigation(null),
  }
}
