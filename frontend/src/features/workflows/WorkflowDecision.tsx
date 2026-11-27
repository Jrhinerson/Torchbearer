import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

export function WorkflowDecision({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="task-dialog surface surface-overlay workflow-decision"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id={headingId}>{title}</h2>
      {children}
      <div className="dialog-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          autoFocus
        >
          Keep editing
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
