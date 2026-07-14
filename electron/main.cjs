const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0a",
    icon: path.join(__dirname, "..", "public", "icons", "icon-512.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  // Open external links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
