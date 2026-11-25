import codexLogo from '../../assets/agents/chatgpt.svg'
import claudeLogo from '../../assets/agents/claude.svg'
import piLogo from '../../assets/agents/pi.svg'
import { agentLabel } from './api'
import type { Agent, Routing, Task } from './api'
import { taskCardStatus } from './taskCardStatus'

const logos: Record<Agent, string> = {
  codex: codexLogo,
  claude: claudeLogo,
  pi: piLogo,
}

export function TaskAgent({
  task,
  routing,
}: {
  task: Task
  routing: Routing | null
}) {
  const { agent, activity, label: status } = taskCardStatus(task)
  const name = agent ? agentLabel(agent, routing) : 'Agent unassigned'
  const label = `${name} · ${status}`

  return (
    <span className="task-agent" role="img" aria-label={label} title={label}>
      <span
        className="task-agent-spinner"
        data-running={activity === 'running'}
        aria-hidden="true"
      />
      {agent ? (
        <img
          className="task-agent-logo"
          data-agent={agent}
          src={logos[agent]}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <span className="task-agent-unassigned" aria-hidden="true">
          ?
        </span>
      )}
    </span>
  )
}
