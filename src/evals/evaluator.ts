import { Run, Example } from "langsmith";
import { EvaluationResult } from "langsmith/evaluation";

/**
 * Custom evaluator: Success Validator
 * Checks if the agent crashed or returned a fatal error trace.
 */
export async function successEvaluator(run: Run, example?: Example): Promise<EvaluationResult> {
  // If the trace has an error field, the harness threw an unhandled exception.
  const isError = !!run.error;
  
  return {
    key: "execution_success",
    score: isError ? 0 : 1,
    comment: isError ? run.error : "Agent completed execution loop cleanly.",
  };
}

/**
 * Custom evaluator: Cache Efficiency
 * Checks if the run utilized Anthropic Prompt Caching efficiently (> 70%).
 * 
 * Note: Requires the LLM to emit `cache_creation_input_tokens` and `cache_read_input_tokens` 
 * in its usage metadata payload, which is currently extracted by the SessionTracer.
 */
export async function cacheEfficiencyEvaluator(run: Run, example?: Example): Promise<EvaluationResult> {
  const outputs = run.outputs || {};
  const metrics = outputs.metrics; // We will attach metrics to the harness output
  
  if (!metrics || !metrics.totalTokens) {
    return {
      key: "cache_hit_rate",
      score: null, // N/A (e.g., OpenAI or missing data)
      comment: "No token metrics found in run output.",
    };
  }

  const creationTokens = metrics.cacheCreationTokens || 0;
  const readTokens = metrics.cacheReadTokens || 0;
  
  if (creationTokens === 0 && readTokens === 0) {
    return {
      key: "cache_hit_rate",
      score: 0,
      comment: "Prompt caching is not active or not supported by this provider.",
    };
  }

  const totalInputTokens = metrics.promptTokens;
  const hitRate = readTokens / totalInputTokens;

  return {
    key: "cache_hit_rate",
    score: hitRate,
    comment: `Cache Hit Rate: ${(hitRate * 100).toFixed(1)}% (${readTokens} / ${totalInputTokens} input tokens)`,
  };
}

/**
 * Custom evaluator: Output Artifact Check
 * Verifies if the file the agent was instructed to create actually exists 
 * in the Sandbox after execution.
 */
export async function filePresenceEvaluator(run: Run, example?: Example): Promise<EvaluationResult> {
  if (!example?.outputs?.expected_file) {
    return { key: "expected_file_created", score: null };
  }

  // The harnessed output should return a manifest or state snapshot we can verify
  const outputs = run.outputs || {};
  const fileManifest = outputs.fileManifest || [];
  
  const expectedFile = example.outputs.expected_file;
  const didCreate = fileManifest.includes(expectedFile);

  return {
    key: "expected_file_created",
    score: didCreate ? 1 : 0,
    comment: didCreate ? `File ${expectedFile} created successfully.` : `Failed to create expected file: ${expectedFile}`,
  };
}
