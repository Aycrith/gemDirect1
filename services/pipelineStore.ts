import { create } from 'zustand';
import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware';
import { createIndexedDBStorage } from '../utils/zustandIndexedDBStorage';
import type { Pipeline, PipelineTask, PipelineStatus, PipelineTaskStatus } from '../types/pipeline';

interface PipelineStoreState {
  pipelines: Record<string, Pipeline>;
  activePipelineId: string | null;
  
  // Actions
  createPipeline: (name: string, tasks: PipelineTask[]) => string;
  getPipeline: (id: string) => Pipeline | undefined;
  updatePipelineStatus: (id: string, status: PipelineStatus) => void;
  updateTaskStatus: (
    pipelineId: string,
    taskId: string,
    status: PipelineTaskStatus,
    output?: PipelineTask['output'],
    error?: string
  ) => void;
  retryTask: (pipelineId: string, taskId: string, error?: string) => void;
  deletePipeline: (id: string) => void;
  setActivePipeline: (id: string | null) => void;
  resetTask: (pipelineId: string, taskId: string) => void;
}

export const usePipelineStore = create<PipelineStoreState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        pipelines: {},
        activePipelineId: null,

        createPipeline: (name, tasks) => {
          const id = crypto.randomUUID();
          const taskRecord: Record<string, PipelineTask> = {};
          tasks.forEach(task => {
            taskRecord[task.id] = {
              ...task,
              status: 'pending',
              retryCount: 0,
              createdAt: Date.now()
            };
          });

          const newPipeline: Pipeline = {
            id,
            name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'active',
            tasks: taskRecord
          };

          set(state => ({
            pipelines: {
              ...state.pipelines,
              [id]: newPipeline
            },
            activePipelineId: id // Auto-activate new pipeline
          }));

          return id;
        },

        getPipeline: (id) => {
          return get().pipelines[id];
        },

        updatePipelineStatus: (id, status) => {
          set(state => {
            const pipeline = state.pipelines[id];
            if (!pipeline) return state;

            return {
              pipelines: {
                ...state.pipelines,
                [id]: {
                  ...pipeline,
                  status,
                  updatedAt: Date.now()
                }
              }
            };
          });
        },

        updateTaskStatus: (pipelineId, taskId, status, output, error) => {
          set(state => {
            const pipeline = state.pipelines[pipelineId];
            if (!pipeline) return state;

            const task = pipeline.tasks[taskId];
            if (!task) return state;

            const updatedTask: PipelineTask = {
              ...task,
              status,
              output: output !== undefined ? output : task.output,
              error: error !== undefined ? error : task.error,
              startedAt: status === 'running' && !task.startedAt ? Date.now() : task.startedAt,
              completedAt: (status === 'completed' || status === 'failed') ? Date.now() : undefined
            };

            return {
              pipelines: {
                ...state.pipelines,
                [pipelineId]: {
                  ...pipeline,
                  tasks: {
                    ...pipeline.tasks,
                    [taskId]: updatedTask
                  },
                  updatedAt: Date.now()
                }
              }
            };
          });
        },

        retryTask: (pipelineId, taskId, error) => {
          set((state) => {
            const pipeline = state.pipelines[pipelineId];
            if (!pipeline) return state;

            const task = pipeline.tasks[taskId];
            if (!task) return state;

            const updatedTask: PipelineTask = {
              ...task,
              status: 'pending',
              output: undefined,
              error,
              retryCount: task.retryCount + 1,
              startedAt: undefined,
              completedAt: undefined,
            };

            return {
              pipelines: {
                ...state.pipelines,
                [pipelineId]: {
                  ...pipeline,
                  tasks: {
                    ...pipeline.tasks,
                    [taskId]: updatedTask,
                  },
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },

        deletePipeline: (id) => {
          set(state => {
            const { [id]: deleted, ...remaining } = state.pipelines;
            return {
              pipelines: remaining,
              activePipelineId: state.activePipelineId === id ? null : state.activePipelineId
            };
          });
        },

        setActivePipeline: (id) => {
          set({ activePipelineId: id });
        },

        resetTask: (pipelineId, taskId) => {
           set(state => {
            const pipeline = state.pipelines[pipelineId];
            if (!pipeline) return state;

            const task = pipeline.tasks[taskId];
            if (!task) return state;

            return {
              pipelines: {
                ...state.pipelines,
                [pipelineId]: {
                  ...pipeline,
                  tasks: {
                    ...pipeline.tasks,
                    [taskId]: {
                      ...task,
                      status: 'pending',
                      error: undefined,
                      output: undefined,
                      retryCount: 0,
                      startedAt: undefined,
                      completedAt: undefined
                    }
                  },
                  updatedAt: Date.now()
                }
              }
            };
          });
        }
      }),
      {
        name: 'pipeline-storage',
        storage: createJSONStorage<Pick<PipelineStoreState, 'pipelines' | 'activePipelineId'>>(
          () => createIndexedDBStorage()
        ),
        partialize: (state) =>
          ({
            pipelines: state.pipelines,
            activePipelineId: state.activePipelineId,
          }) as Pick<PipelineStoreState, 'pipelines' | 'activePipelineId'>,
      }
    )
  )
);
