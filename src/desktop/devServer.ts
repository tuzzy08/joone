import * as os from "node:os";
import * as path from "node:path";
import { JooneRuntimeService } from "../runtime/service.js";
import { createDesktopRuntimeServer } from "./server.js";

const configPath = path.join(os.homedir(), ".joone", "config.json");
const runtime = new JooneRuntimeService({
  configPath,
  cwd: process.cwd(),
});

const server = await createDesktopRuntimeServer({ runtime, port: 3011 });

console.log(`Joone desktop runtime server listening on ${server.url}`);
