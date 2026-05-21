const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const APP_ID = "com.johnathancrow.tempest";
const isDevelopment = !app.isPackaged;

function createMainWindow() {
  const window = new BrowserWindow({
    title: "Tempest",
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#050607",
    icon: path.join(__dirname, "..", "icons", "icon-256.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, "..", "index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  if (isDevelopment) {
    window.webContents.on("before-input-event", (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === "i") {
        window.webContents.toggleDevTools();
      }
    });
  }

  return window;
}

app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
