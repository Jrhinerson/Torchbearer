import codexLogo from '../../assets/agents/chatgpt.svg'
import claudeLogo from '../../assets/agents/claude.svg'
import piLogo from '../../assets/agents/pi.svg'
import { agentLabel } from './api'
import type { Agent, Routing, Task } from './api'

const logos: Record<Agent, string> = {
  codex: codexLogo,
  claude: claudeLogo,
  pi: piLogo,
}

function responsibleAgent(task: Task): Agent | null {
  if (task.status === 'backlog') return task.stage_agents.plan ?? null
  if (task.status === 'final_approval')
    return task.latest_run?.agent ?? task.stage_agents.code_review ?? null
  if (task.latest_run?.stage === task.status) return task.latest_run.agent
  return task.stage_agents[task.status] ?? null
}

export function TaskAgent({
  task,
  routing,
}: {
  task: Task
  routing: Routing | null
}) {
  const agent = responsibleAgent(task)
  const label = agent ? agentLabel(agent, routing) : 'Agent unassigned'

  return (
    <span className="task-agent" role="img" aria-label={label} title={label}>
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
