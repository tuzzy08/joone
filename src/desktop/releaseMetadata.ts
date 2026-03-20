import * as fs from "node:fs";
import * as path from "node:path";

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
  releaseAssetNamePattern: string;
  workflowArtifactNamePattern: string;
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
    releaseAssetNamePattern: `${slug}_[version]_[platform]_[arch][ext]`,
    workflowArtifactNamePattern: `${slug}-[platform]-[arch]-[bundle]`,
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
    `release_asset_name_pattern=${metadata.releaseAssetNamePattern}`,
    `workflow_artifact_name_pattern=${metadata.workflowArtifactNamePattern}`,
  ];

  fs.appendFileSync(outputPath, `${outputLines.join("\n")}\n`, "utf8");
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  writeGitHubOutput(loadDesktopReleaseMetadata());
}
