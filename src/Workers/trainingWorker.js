// ── trainingWorker.js ─────────────────────────────────────────────────────────
// NOTE: Training is now handled on the main thread via workerBridge.startTraining()
// which calls ParamNetwork.train() directly with event-loop yields.
// This file is retained as a placeholder but is not imported anywhere.
// Reason: training the small 11-param network in a worker requires weight
// serialization round-trips that cost more than the computation saves.
