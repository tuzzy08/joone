import { Client } from "langsmith";

const client = new Client();
const DATASET_NAME = "joone-baseline-v1";

/**
 * Definition of our baseline evaluation dataset.
 */
const BASELINE_EXAMPLES = [
  {
    inputs: {
      instruction: "Write a python script that calculates the 10th fibonacci number and saves the result to /workspace/fib_result.txt",
    },
    outputs: {
      expected_file: "/workspace/fib_result.txt",
      expected_content: "55\n", // 0,1,1,2,3,5,8,13,21,34,55
    },
  },
  {
    inputs: {
      instruction: `Create a TypeScript file at /workspace/math.ts with a function 'add(a: number, b: number)' that returns their sum. 
Then write a test file at /workspace/math.test.ts using the 'node:assert' module.
Finally, use the bash tool to run 'npx tsx math.test.ts' to verify it passes.`,
    },
    outputs: {
      expected_file: "/workspace/math.ts",
      expected_test_execution: true,
    },
  },
  {
    inputs: {
      instruction: "List all files in the current project root directory and save the output to /workspace/ls.txt",
    },
    outputs: {
      expected_file: "/workspace/ls.txt",
    },
  },
];

/**
 * Programmatically creates the baseline dataset in LangSmith if it doesn't already exist.
 */
export async function ensureBaselineDataset(): Promise<string> {
  try {
    const dataset = await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`[Eval] Dataset '${DATASET_NAME}' already exists (ID: ${dataset.id}).`);
    return DATASET_NAME;
  } catch (error: any) {
    if (error?.message?.includes("not found") || error?.status === 404) {
      console.log(`[Eval] Creating dataset '${DATASET_NAME}' from scratch...`);
      const dataset = await client.createDataset(DATASET_NAME, {
        description: "Baseline tasks to evaluate Joone's core sandbox, tool routing, and reasoning precision.",
      });

      for (const example of BASELINE_EXAMPLES) {
        await client.createExample(
          example.inputs,
          example.outputs,
          { datasetId: dataset.id }
        );
      }
      console.log(`[Eval] Successfully seeded dataset '${DATASET_NAME}' with ${BASELINE_EXAMPLES.length} examples.`);
      return DATASET_NAME;
    }
    throw error;
  }
}
