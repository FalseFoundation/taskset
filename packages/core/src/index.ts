export {
	CONFIG_FILE_NAME,
	ConfigError,
	type ConfigErrorCode,
	DATA_DIRECTORY_NAME,
	defineConfig,
	discoverRepository,
	loadRepository,
	type Repository,
	type ResolvedConfig,
	type ResolvedTaskDefaults,
	TASKS_DIRECTORY_NAME,
} from './config/config.ts'
export {
	type DoctorResult,
	diagnoseRepository,
	type RepositoryDiagnostic,
	type RepositoryDiagnosticCode,
} from './diagnostics/doctor.ts'
export {
	buildTaskGraph,
	inspectTaskGraph,
	TaskGraph,
	type TaskGraphDiagnostic,
	type TaskGraphDiagnosticCode,
	TaskGraphError,
} from './graph/taskGraph.ts'
export {
	type BuildTaskIndexOptions,
	buildTaskIndex,
	TaskIndex,
} from './indexing/taskIndex.ts'
export {
	normalizeRepositoryPath,
	RepositoryPathError,
	type RepositoryPathErrorCode,
	type TaskImpactOptions,
	type TaskImpactResult,
	tasksForFile,
} from './projects/taskImpact.ts'
export {
	applyFileTransaction,
	FileTransactionError,
	type FileTransactionErrorCode,
	type FileTransactionOperation,
} from './repository/fileTransaction.ts'
export { initializeRepository } from './repository/repository.ts'
export {
	queryTaskRecords,
	queryTasks,
	type TaskQuery,
	type TaskSortDirection,
	type TaskSortKey,
} from './search/taskQuery.ts'
export {
	applySynchronization,
	type PlanSynchronizationOptions,
	planSynchronization,
	SynchronizationError,
	type SynchronizationErrorCode,
} from './sync/synchronization.ts'
export {
	type ParseTaskFileOptions,
	parseTaskFile,
	serializeTaskFile,
	TaskFileError,
	type TaskFileErrorCode,
	type TaskFileIssue,
} from './tasks/taskFile.ts'
export {
	type CreateTaskInput,
	type CreateTaskOptions,
	createTask,
	type DeleteTaskOptions,
	deleteTask,
	generateTaskId,
	listTasks,
	readTask,
	type TaskRecord,
	TaskRepositoryError,
	type TaskRepositoryErrorCode,
	type UpdateTaskInput,
	type UpdateTaskOptions,
	updateTask,
} from './tasks/taskRepository.ts'
