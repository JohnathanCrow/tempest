import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { rcedit } from "rcedit";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "dist");
const unpackedDir = join(distDir, "win-unpacked");
const exePath = join(unpackedDir, "Tempest.exe");
const iconPath = join(root, "icons", "icon-256.ico");
const electronBuilder = join(root, "node_modules", "electron-builder", "cli.js");

const buildEnv = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
  ELECTRON_CACHE: process.env.ELECTRON_CACHE || join(root, ".electron-cache"),
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || join(root, ".electron-builder-cache")
};

function runElectronBuilder(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [electronBuilder, ...args], {
      cwd: root,
      env: buildEnv,
      stdio: "inherit"
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`electron-builder ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

await rm(distDir, { recursive: true, force: true });
await runElectronBuilder(["--win", "dir"]);

await rcedit(exePath, {
  icon: iconPath,
  "version-string": {
    FileDescription: "Tempest",
    ProductName: "Tempest",
    InternalName: "Tempest",
    OriginalFilename: "Tempest.exe",
    CompanyName: "Johnathan Crow"
  }
});

await runElectronBuilder(["--win", "nsis", "--prepackaged", unpackedDir]);
