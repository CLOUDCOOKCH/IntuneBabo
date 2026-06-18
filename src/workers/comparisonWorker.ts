/// <reference lib="webworker" />

import { runApplyMatchDecisionsTask, runGenerateComparisonTask, runParseImportsTask } from '../lib/comparison/workerTasks';
import type { WorkerRequest, WorkerResponse } from '../types/worker';

const workerScope = self as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse): void {
  workerScope.postMessage(message);
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === 'parse-imports') {
      const payload = await runParseImportsTask(request.payload, (stage, message) =>
        post({ type: 'progress', requestId: request.requestId, stage, message }),
      );
      post({ type: 'parse-imports:success', requestId: request.requestId, payload });
      return;
    }

    if (request.type === 'generate-comparison') {
      const payload = runGenerateComparisonTask(request.payload, (stage, message) =>
        post({ type: 'progress', requestId: request.requestId, stage, message }),
      );
      post({ type: 'generate-comparison:success', requestId: request.requestId, payload });
      return;
    }

    if (request.type === 'apply-match-decisions') {
      const payload = runApplyMatchDecisionsTask(request.payload, (stage, message) =>
        post({ type: 'progress', requestId: request.requestId, stage, message }),
      );
      post({ type: 'apply-match-decisions:success', requestId: request.requestId, payload });
    }
  } catch (error) {
    post({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : 'Worker task failed.',
    });
  }
};
