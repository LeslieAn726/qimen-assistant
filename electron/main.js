'use strict';

const http = require('node:http');
const path = require('node:path');
const {app: electronApp, BrowserWindow, dialog} = require('electron');
const expressApp = require('../app');
const {prepareDesktopData} = require('./data-path');
const {safeLog} = require('./safe-log');

const APP_NAME = '每日奇门助手';
const APP_ID = 'qimen-assistant';
const WINDOWS_APP_ID = 'com.qimen.assistant';
const HOST = '127.0.0.1';
const PORT = 3000;
const HEALTH_TIMEOUT_MS = 1500;
const STARTUP_TIMEOUT_MS = 15000;

let mainWindow = null;
let ownedExpressServer = null;
let shutdownPromise = null;
let allowQuit = false;
let focusWhenReady = false;
let activePort = PORT;

function debugLog(...args) {
    if (!electronApp.isPackaged) safeLog('log', ...args);
}

electronApp.setName(APP_NAME);
if (process.platform === 'win32') {
    electronApp.setAppUserModelId(WINDOWS_APP_ID);
}

const hasSingleInstanceLock = electronApp.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
    electronApp.quit();
} else {
    electronApp.on('second-instance', () => {
        if (!mainWindow) {
            focusWhenReady = true;
            return;
        }
        openOrFocusMainWindow().catch((error) => safeLog('error', '聚焦主窗口失败:', error));
    });

    electronApp.whenReady().then(startDesktop).catch(handleStartupError);

    electronApp.on('window-all-closed', () => {
        electronApp.quit();
    });

    electronApp.on('before-quit', (event) => {
        if (allowQuit || !ownedExpressServer) return;

        event.preventDefault();
        if (!shutdownPromise) {
            shutdownPromise = closeDesktopServices().finally(() => {
                allowQuit = true;
                electronApp.quit();
            });
        }
    });
}

async function startDesktop() {
    const userDataDir = electronApp.getPath('userData');
    const desktopData = await prepareDesktopData({
        userDataDir,
        projectDataDir: path.join(__dirname, '..', 'data')
    });
    debugLog(`桌面每日记录目录: ${desktopData.dataDir}`);
    if (desktopData.migrated) debugLog('已从项目 data 目录迁移历史记录。');
    const desktopStorage = expressApp.configureDailyStorage(
        desktopData.dataDir,
        'desktop-userData',
        {
            settingsDir: userDataDir,
            backupsDir: path.join(userDataDir, 'backups'),
            aiSettingsDir: userDataDir,
            aiResultsDir: path.join(userDataDir, 'ai')
        }
    );
    await desktopStorage.ensureStorage();
    let startupPage = 'today';
    try {
        const settings = await expressApp.getSettings();
        startupPage = settings.startupPage;
    } catch (error) {
        if (error.code !== 'SETTINGS_CORRUPT') throw error;
        startupPage = 'settings';
        safeLog('error', '设置文件已损坏，将打开设置页以便恢复:', error.message);
    }

    const service = await startOrReuseExpress();
    if (service.owned) ownedExpressServer = service.server;
    activePort = service.port;

    await waitForQimenService(activePort);
    await createMainWindow(startupPage);
}

function probeHealth(port) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        const request = http.get(`http://${HOST}:${port}/api/health`, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
                if (body.length > 16384) {
                    request.destroy();
                    finish({state: 'occupied'});
                }
            });
            response.on('end', () => {
                try {
                    const health = JSON.parse(body);
                    if (response.statusCode === 200 && health.app === APP_ID) {
                        finish({state: 'qimen', health});
                    } else {
                        finish({state: 'occupied'});
                    }
                } catch (error) {
                    finish({state: 'occupied'});
                }
            });
        });

        request.setTimeout(HEALTH_TIMEOUT_MS, () => {
            request.destroy();
            finish({state: 'occupied'});
        });
        request.on('error', (error) => {
            finish({
                state: error.code === 'ECONNREFUSED' ? 'unavailable' : 'occupied',
                error
            });
        });
    });
}

async function startOrReuseExpress() {
    const existing = await probeHealth(PORT);
    if (existing.state === 'qimen') {
        if (existing.health.storageMode === 'desktop-userData') {
            return {owned: false, server: null, port: PORT};
        }
        if (existing.health.storageMode === 'project-data') {
            const server = await listenExpress(0);
            return {owned: true, server, port: server.address().port};
        }
        throw new Error('端口 3000 上的奇门服务没有可识别的存储模式，桌面版拒绝复用。');
    }
    if (existing.state === 'occupied') {
        throw portConflictError();
    }

    try {
        const server = await listenExpress(PORT);
        return {owned: true, server, port: PORT};
    } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;

        const racedService = await probeHealth(PORT);
        if (racedService.state === 'qimen') {
            if (racedService.health.storageMode === 'desktop-userData') {
                return {owned: false, server: null, port: PORT};
            }
            if (racedService.health.storageMode === 'project-data') {
                const server = await listenExpress(0);
                return {owned: true, server, port: server.address().port};
            }
        }
        throw portConflictError();
    }
}

function listenExpress(port) {
    return new Promise((resolve, reject) => {
        const server = expressApp.listen(port, HOST);

        const onError = (error) => {
            server.removeListener('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            server.on('error', (error) => safeLog('error', 'Express 服务错误:', error));
            resolve(server);
        };

        server.once('error', onError);
        server.once('listening', onListening);
    });
}

async function waitForQimenService(port) {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const result = await probeHealth(port);
        if (result.state === 'qimen' && result.health.storageMode === 'desktop-userData') {
            return result.health;
        }
        if (result.state === 'occupied') throw portConflictError();
        await delay(200);
    }

    throw new Error('奇门桌面服务启动超时，请检查本机端口和项目日志。');
}

async function createMainWindow(startupPage = 'today') {
    const page = ['today', 'history', 'settings'].includes(startupPage) ? startupPage : 'today';
    debugLog(`桌面启动页面: /${page}`);
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 960,
        minHeight: 700,
        resizable: true,
        show: false,
        title: APP_NAME,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false
        }
    });

    secureNavigation(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
        // 关闭唯一主窗口即退出桌面应用，并在 before-quit 中释放自建服务。
        if (!allowQuit) electronApp.quit();
    });
    mainWindow.once('ready-to-show', () => {
        if (!mainWindow) return;
        mainWindow.show();
        if (focusWhenReady) {
            focusWhenReady = false;
            mainWindow.focus();
        }
    });
    mainWindow.on('page-title-updated', (event) => {
        event.preventDefault();
        if (mainWindow) mainWindow.setTitle(APP_NAME);
    });

    try {
        await mainWindow.loadURL(`http://localhost:${activePort}/${page}`);
    } catch (error) {
        // /today 首次写入浏览器时区 Cookie 后会刷新页面，第一次导航会被正常中止。
        if (error.code !== 'ERR_ABORTED') throw error;
    }
}

async function openOrFocusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        await createMainWindow('today');
        return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function secureNavigation(window) {
    const contents = window.webContents;
    const preventExternalNavigation = (event, details) => {
        const targetUrl = typeof details === 'string' ? details : details && details.url;
        if (!isProjectUrl(targetUrl)) event.preventDefault();
    };

    contents.on('will-navigate', preventExternalNavigation);
    contents.on('will-redirect', preventExternalNavigation);
    contents.on('will-frame-navigate', preventExternalNavigation);
    contents.on('will-attach-webview', (event) => event.preventDefault());

    contents.setWindowOpenHandler(({url}) => {
        if (isProjectUrl(url) && mainWindow) {
            mainWindow.loadURL(url).catch((error) => {
                safeLog('error', '本项目页面导航失败:', error);
            });
        }
        return {action: 'deny'};
    });
}

function isProjectUrl(targetUrl) {
    if (!targetUrl) return false;

    try {
        const url = new URL(targetUrl);
        const isLocalHost = url.hostname === 'localhost' || url.hostname === HOST;
        return url.protocol === 'http:' && isLocalHost && url.port === String(activePort);
    } catch (error) {
        return false;
    }
}

function portConflictError() {
    return new Error(
        '端口 3000 已被其他程序占用，且该程序不是 qimen-assistant。'
        + '请关闭占用端口的程序后重试。'
    );
}

function closeOwnedExpressServer() {
    const server = ownedExpressServer;
    ownedExpressServer = null;
    if (!server) return Promise.resolve();

    return new Promise((resolve) => {
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(forceCloseTimer);
            resolve();
        };

        const forceCloseTimer = setTimeout(() => {
            if (typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            finish();
        }, 5000);

        server.close(finish);
    });
}

async function closeDesktopServices() {
    try {
        await closeOwnedExpressServer();
    } catch (error) {
        safeLog('error', '桌面 Express 服务停止失败:', error);
    }
}

async function handleStartupError(error) {
    safeLog('error', '桌面版启动失败:', error);
    dialog.showErrorBox(
        '每日奇门助手启动失败',
        error.message || '应用无法启动。请检查用户数据目录权限、磁盘空间和端口占用情况。'
    );
    await closeDesktopServices();
    allowQuit = true;
    electronApp.quit();
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
