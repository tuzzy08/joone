import * as fs from "node:fs";
import * as path from "node:path";

import { isDirectDesktopScriptExecution } from "./cliEntry.js";

interface TauriDesktopConfig {
  productName: string;
  version: string;
}

export interface DesktopReleaseMetadata {
  productName: string;
  version: string;
  slug: string;
  releaseTag: string;
  releaseName: string;
  releaseBody: string;
  assetNamePrefix: string;
  assetNamePattern: string;
  workflowArtifactPrefix: string;
}

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const loadTauriDesktopConfig = (rootDir: string): TauriDesktopConfig => {
  const configPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
  const config = JSON.parse(
    fs.readFileSync(configPath, "utf8"),
  ) as Partial<TauriDesktopConfig>;

  if (!config.productName || !config.version) {
    throw new Error(
      `Desktop Tauri config at ${configPath} must define productName and version.`,
    );
  }

  return {
    productName: config.productName,
    version: config.version,
  };
};

export const loadDesktopReleaseMetadata = (
  rootDir = process.cwd(),
): DesktopReleaseMetadata => {
  const { productName, version } = loadTauriDesktopConfig(rootDir);
  const slug = slugify(productName);

  return {
    productName,
    version,
    slug,
    releaseTag: `${slug}-v${version}`,
    releaseName: `${productName} v${version}`,
    releaseBody: `Automated desktop bundles for ${productName} v${version}.`,
    assetNamePrefix: `${slug}_${version}_`,
    assetNamePattern: `${slug}_[version]_[platform]_[arch][ext]`,
    workflowArtifactPrefix: `${slug}-desktop-bundles-v${version}`,
  };
};

const writeGitHubOutput = (metadata: DesktopReleaseMetadata): void => {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  const outputLines = [
    `release_tag=${metadata.releaseTag}`,
    `release_name=${metadata.releaseName}`,
    `release_body=${metadata.releaseBody}`,
    `asset_name_prefix=${metadata.assetNamePrefix}`,
    `asset_name_pattern=${metadata.assetNamePattern}`,
    `workflow_artifact_prefix=${metadata.workflowArtifactPrefix}`,
  ];

  fs.appendFileSync(outputPath, `${outputLines.join("\n")}\n`, "utf8");
};

if (isDirectDesktopScriptExecution(import.meta.url)) {
  writeGitHubOutput(loadDesktopReleaseMetadata());
}
