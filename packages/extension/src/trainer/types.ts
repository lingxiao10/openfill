// Re-export trainer types that the extension needs.
// We copy the essential subset here to avoid a package dependency on @page-agent/trainer.
export type {
	ActionLogEntry,
	AutomationScript,
	AutomationStep,
	ElementDetails,
	ElementSelector,
	Execution,
	TrainingTask,
} from '../../../trainer/src/types'
