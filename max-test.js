const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800, height: 600, show: true,
    maximizable: true, resizable: true
  });
  
  win.maximize();
  
  setTimeout(() => {
    console.log('Maximized?', win.isMaximized());
    app.quit();
  }, 1000);
});
