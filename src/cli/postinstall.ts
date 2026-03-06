#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

// We only want to show the banner on post-install if this is an interactive terminal
// and we are not in a CI environment.
if (process.stdout.isTTY && !process.env.CI) {
  // Determine if it was installed globally
  const npmConfigPrefix = process.env.npm_config_global === "true" || process.env.npm_config_global === "";
  
  const green = "\x1b[32m";
  const cyan = "\x1b[36m";
  const bold = "\x1b[1m";
  const reset = "\x1b[0m";

  console.log("");
  console.log(`  ╭───────────────────────────────────────────────────╮`);
  console.log(`  │                                                   │`);
  console.log(`  │   🚀 ${green}${bold}Joone installed successfully!${reset}                │`);
  console.log(`  │                                                   │`);
  console.log(`  │   To complete setup and start the agent,          │`);
  console.log(`  │   run the following command in your terminal:     │`);
  console.log(`  │                                                   │`);
  console.log(`  │   $ ${cyan}joone${reset}                                         │`);
  console.log(`  │                                                   │`);
  console.log(`  ╰───────────────────────────────────────────────────╯`);
  console.log("");
}
