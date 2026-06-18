import { runApplyMatchDecisionsTask, runGenerateComparisonTask, runParseImportsTask } from './workerTasks';
import type { ApplyMatchDecisionPayload, ComparisonPayload, ParseImportsPayload, WorkerRequest, WorkerResponse, WorkerResultPayload } from '../../types/worker';
import type { TenantImport } from '../../types/tenantdiff';

export interface WorkerClient {
  parseImports: (
    payload: ParseImportsPayload,
    onProgress?: (stage: string, message: string) => void,
  ) => Promise<{ tenant: TenantImport; baseline: TenantImport }>;
  generateComparison: (
    payload: ComparisonPayload,
    onProgress?: (stage: string, message: string) => void,
  ) => Promise<WorkerResultPayload>;
  applyMatchDecisions: (
    payload: ApplyMatchDecisionPayload,
    onProgress?: (stage: string, message: string) => void,
  ) => Promise<WorkerResultPayload>;
  dispose: () => void;
}

function requestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function runDirectFallback(): WorkerClient {
  return {
    parseImports: (payload, onProgress) => runParseImportsTask(payload, onProgress),
    generateComparison: (payload, onProgress) => Promise.resolve(runGenerateComparisonTask(payload, onProgress)),
    applyMatchDecisions: (payload, onProgress) => Promise.resolve(runApplyMatchDecisionsTask(payload, onProgress)),
    dispose: () => undefined,
  };
}

export function createWorkerClient(): WorkerClient {
  if (typeof Worker === 'undefined') return runDirectFallback();

  const worker = new Worker(new URL('../../workers/comparisonWorker.ts', import.meta.url), { type: 'module' });

  function sendParseImports(payload: ParseImportsPayload, onProgress?: (stage: string, message: string) => void): Promise<{ tenant: TenantImport; baseline: TenantImport }> {
    const id = requestId();
    const request: WorkerRequest = { type: 'parse-imports', requestId: id, payload };
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.requestId !== id) return;
        if (event.data.type === 'progress') {
          onProgress?.(event.data.stage, event.data.message);
          return;
        }
        worker.removeEventListener('message', handler);
        if (event.data.type === 'error') return reject(new Error(event.data.message));
        if (event.data.type === 'parse-imports:success') return resolve(event.data.payload);
        reject(new Error('Unexpected parse worker response.'));
      };
      worker.addEventListener('message', handler);
      worker.postMessage(request);
    });
  }

  function sendComparison(
    request: WorkerRequest,
    expectedType: 'generate-comparison:success' | 'apply-match-decisions:success',
    onProgress?: (stage: string, message: string) => void,
  ): Promise<WorkerResultPayload> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.requestId !== request.requestId) return;
        if (event.data.type === 'progress') {
          onProgress?.(event.data.stage, event.data.message);
          return;
        }
        worker.removeEventListener('message', handler);
        if (event.data.type === 'error') return reject(new Error(event.data.message));
        if (event.data.type === expectedType) return resolve(event.data.payload);
        reject(new Error('Unexpected comparison worker response.'));
      };
      worker.addEventListener('message', handler);
      worker.postMessage(request);
    });
  }

  return {
    parseImports: sendParseImports,
    generateComparison: (payload, onProgress) =>
      sendComparison({ type: 'generate-comparison', requestId: requestId(), payload }, 'generate-comparison:success', onProgress),
    applyMatchDecisions: (payload, onProgress) =>
      sendComparison({ type: 'apply-match-decisions', requestId: requestId(), payload }, 'apply-match-decisions:success', onProgress),
    dispose: () => worker.terminate(),
  };
}
