import type { OperationsOverview } from './api'

export function AgentActivity({
  summary,
}: {
  summary: OperationsOverview | null
}) {
  if (!summary) return null
  return (
    <section className="agent-activity" aria-label="Agent task activity">
      <h2>Agents</h2>
      {summary.agents.map((agent) => (
        <div className="agent-activity-row" key={agent.id}>
          <span
            className={`activity-dot ${agent.running ? 'running' : agent.queued ? 'queued' : ''}`}
            aria-hidden="true"
          />
          <span>{agent.label}</span>
          <span>
            {!agent.available
              ? 'Not installed'
              : agent.running
                ? 'Running'
                : agent.queued
                  ? `${agent.queued} queued`
                  : 'Idle'}
          </span>
        </div>
      ))}
      <p className="workflow-hint">Task activity · one worker</p>
    </section>
  )
}
