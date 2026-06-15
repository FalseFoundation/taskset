export {
	CONFIG_FILE_NAME,
	ConfigError,
	type ConfigErrorCode,
	DATA_DIRECTORY_NAME,
	defineConfig,
	discoverRepository,
	GENERATED_DIRECTORY_NAME,
	loadRepository,
	type Repository,
	RepositoryDirectorySchema,
	RepositorySchema,
	type ResolvedConfig,
	type ResolvedTaskDefaults,
	SNAPSHOTS_DIRECTORY_NAME,
	TASKS_DIRECTORY_NAME,
} from './config/config.ts'
export {
	type DoctorResult,
	diagnoseRepository,
	type RepositoryDiagnostic,
	type RepositoryDiagnosticCode,
} from './diagnostics/doctor.ts'
export {
	type GeneratedViewsResult,
	type GenerateViewsOptions,
	GenerateViewsOptionsSchema,
	generateViews,
} from './generated/generatedViews.ts'
export {
	buildTaskGraph,
	type DerivedTaskRelationships,
	inspectTaskGraph,
	TaskGraph,
	type TaskGraphDiagnostic,
	type TaskGraphDiagnosticCode,
	TaskGraphError,
	TaskRecordSchema,
	TaskRecordsSchema,
} from './graph/taskGraph.ts'
export {
	type BuildTaskIndexOptions,
	BuildTaskIndexOptionsSchema,
	buildTaskIndex,
	TaskIndex,
} from './indexing/taskIndex.ts'
export {
	type MigrateTasksOptions,
	MigrateTasksOptionsSchema,
	migrateTasks,
	type TaskMigrationChange,
	type TaskMigrationResult,
} from './migrations/taskMigration.ts'
export {
	normalizeRepositoryPath,
	RepositoryPathError,
	type RepositoryPathErrorCode,
	RepositoryRelativePathSchema,
	repositoryPathsRelate,
} from './projects/repositoryPath.ts'
export {
	applyFileTransaction,
	FileTransactionError,
	type FileTransactionErrorCode,
	type FileTransactionOperation,
	FileTransactionOperationSchema,
} from './repository/fileTransaction.ts'
export { initializeRepository } from './repository/repository.ts'
export {
	queryTaskRecords,
	queryTasks,
	TASK_SORT_DIRECTIONS,
	TASK_SORT_KEYS,
	type TaskQuery,
	type TaskQueryResult,
	TaskQuerySchema,
	type TaskSortDirection,
	type TaskSortKey,
} from './search/taskQuery.ts'
export {
	type CreateSnapshotOptions,
	CreateSnapshotOptionsSchema,
	createSnapshot,
	listSnapshots,
	type RestoreSnapshotOptions,
	RestoreSnapshotOptionsSchema,
	type RestoreSnapshotResult,
	restoreSnapshot,
	type SnapshotChange,
	type SnapshotFile,
	type SnapshotManifest,
} from './snapshots/snapshotRepository.ts'
export {
	applySynchronization,
	type PlanSynchronizationOptions,
	PlanSynchronizationOptionsSchema,
	planSynchronization,
	SynchronizationError,
	type SynchronizationErrorCode,
} from './sync/synchronization.ts'
export {
	type ParseTaskFileOptions,
	ParseTaskFileOptionsSchema,
	parseTaskFile,
	serializeTaskFile,
	TaskFileError,
	type TaskFileErrorCode,
	type TaskFileIssue,
} from './tasks/taskFile.ts'
export {
	type CoreWarning,
	type CreateTaskInput,
	CreateTaskInputSchema,
	type CreateTaskOptions,
	CreateTaskOptionsSchema,
	createTask,
	type DeleteTaskOptions,
	DeleteTaskOptionsSchema,
	deleteTask,
	generateTaskId,
	listTasks,
	readTask,
	type TaskRecord,
	TaskRepositoryError,
	type TaskRepositoryErrorCode,
	type UpdateTaskInput,
	UpdateTaskInputSchema,
	type UpdateTaskOptions,
	UpdateTaskOptionsSchema,
	updateTask,
} from './tasks/taskRepository.ts'
export {
	CoreValidationError,
	type CoreValidationIssue,
} from './validation/coreValidation.ts'
