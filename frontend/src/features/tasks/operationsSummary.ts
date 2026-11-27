import { createContext } from 'react'
import type { OperationsOverview } from './api'

export const OperationsSummaryContext = createContext<
  ((summary: OperationsOverview | null) => void) | null
>(null)
