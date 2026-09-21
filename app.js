const express = require('express');
const app = express();
const fs = require('node:fs/promises');
const path = require('path');
const {Lunar, Solar} = require('lunar-javascript');
const packageMetadata = require('./package.json');

// 导入奇门遁甲计算模块
const qimen = require('./lib/qimen');
const {resolveUserDate} = require('./lib/localtime');
const {createDailyService} = require('./services/daily-service');
const {createBackupService} = require('./services/backup-service');
const {createAiService} = require('./services/ai-service');
const {createAlmanacService} = require('./services/almanac-service');
const {
    createPageMeta,
    formatDateKey,
    formatTime,
    getShanghaiWallClock,
    parseCustomDateTime
} = require('./services/qimen-page-service');
const {createDailyStorage} = require('./storage/daily-storage');
const {DEFAULT_SETTINGS, createSettingsStorage} = require('./storage/settings-storage');
const {
    DEFAULT_AI_SETTINGS,
    createAiSettingsStorage,
    toPublicSettings: toPublicAiSettings
} = require('./storage/ai-settings-storage');
const {createAiResultStorage} = require('./storage/ai-result-storage');

let dailyService;
let activeDailyStorage;
let activeSettingsStorage;
let activeBackupService;
let activeAiSettingsStorage;
let activeAiResultStorage;
let activeAiService;
const defaultAlmanacService = createAlmanacService();
let activeAlmanacService = defaultAlmanacService;
let storageMode;

function configureDailyStorage(dataDir, mode, options = {}) {
    if (!['project-data', 'desktop-userData'].includes(mode)) {
        throw new Error(`不支持的每日记录存储模式：${mode}`);
    }

    const storage = createDailyStorage(dataDir);
    const settingsDir = options.settingsDir || dataDir;
    const backupDir = options.backupsDir || path.join(settingsDir, 'backups');
    const aiSettingsDir = options.aiSettingsDir || settingsDir;
    const aiResultsDir = options.aiResultsDir || path.join(settingsDir, 'ai');
    const settingsStorage = createSettingsStorage(settingsDir);
    const aiSettingsStorage = createAiSettingsStorage(aiSettingsDir);
    const aiResultStorage = createAiResultStorage(aiResultsDir);
    const backupService = createBackupService({
        dailyStorage: storage,
        settingsStorage,
        backupsDir: backupDir
    });
    dailyService = createDailyService(storage);
    activeAiService = createAiService({
        dailyService,
        aiSettingsStorage,
        aiResultStorage,
        provider: options.aiProvider
    });
    activeDailyStorage = storage;
    activeSettingsStorage = settingsStorage;
    activeBackupService = backupService;
    activeAiSettingsStorage = aiSettingsStorage;
    activeAiResultStorage = aiResultStorage;
    activeAlmanacService = options.almanacService || defaultAlmanacService;
    storageMode = mode;
    return storage;
}

// Web 版默认继续使用项目目录下的 data/。
configureDailyStorage(path.join(__dirname, 'data'), 'project-data');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.locals.appName = packageMetadata.productName;
app.locals.appVersion = packageMetadata.version;
app.use(express.json({limit: '1mb'}));
// public files
app.use(express.static(path.join(__dirname, 'public')));
app.disable('view cache');

// 桌面版用于确认 3000 端口运行的是本项目
app.get('/api/health', (req, res) => {
    res.json({
        app: 'qimen-assistant',
        version: packageMetadata.version,
        pid: process.pid,
        storageMode
    });
});

function apiError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    res.status(error.statusCode || 500).json({
        error: error.message || fallbackMessage,
        code: error.code || 'APPLICATION_ERROR'
    });
}

function pageError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    res.status(error.statusCode || 500).render('error', {
        title: fallbackMessage,
        message: error.message || fallbackMessage
    });
}

// 首页 - 实时排盘
app.get('/', (req, res) => {
    // 实时排盘固定使用当前北京时间；只改变输入时刻，不改变排盘算法。
    const date = getShanghaiWallClock();

    // 计算奇门盘
    const options = {
        type: '四柱',
        method: '时家',
        purpose: '综合',
        location: '默认位置'
    };

    try {
        const qimenPan = qimen.calculate(date, options);

        // 初始化缺失的属性，确保模板不会报错
        if (!qimenPan.jiuGongAnalysis) {
            qimenPan.jiuGongAnalysis = {};
        }

        // 确保每个宫位都有基本属性
        for (let i = 1; i <= 9; i++) {
            if (!qimenPan.jiuGongAnalysis[i]) {
                qimenPan.jiuGongAnalysis[i] = {
                    direction: '',
                    gongName: '',
                    jiXiong: 'ping'
                };
            }
        }

        // 传递常量给视图
        res.locals.JIU_GONG = qimen.JIU_GONG;
        res.locals.JIU_XING = qimen.JIU_XING;
        res.locals.BA_MEN = qimen.BA_MEN;
        res.locals.BA_SHEN = qimen.BA_SHEN;

        const pageMeta = createPageMeta('realtime', date, {
            ...options,
            jieQi: qimenPan.juShu && qimenPan.juShu.jieQiName
        });

        // 渲染页面
        res.render('index', {qimen: qimenPan, pageMeta, activePage: 'realtime'});
    } catch (error) {
        console.error('排盘错误:', error);
        // 返回错误页面
        res.status(500).send('排盘错误: ' + error.message);
    }
});

// 今日助手
app.get('/today', async (req, res) => {
    try {
        const [page, settings] = await Promise.all([
            dailyService.getTodayPageData({
                cookieHeader: req.headers.cookie,
                dateKey: req.query.date
            }),
            activeSettingsStorage.read()
        ]);
        let aiAdvice = null;
        let aiLoadError = '';
        let almanac = null;
        let almanacError = '';
        try {
            almanac = activeAlmanacService.getAlmanac(new Date(`${page.date}T${page.time}`));
        } catch (error) {
            almanacError = error.message || '今日黄历加载失败。';
        }
        try {
            aiAdvice = await activeAiService.getAdviceForPage(page);
        } catch (error) {
            aiLoadError = error.message || '已有 AI 建议加载失败。';
        }

        res.locals.JIU_GONG = qimen.JIU_GONG;
        res.locals.JIU_XING = qimen.JIU_XING;
        res.locals.BA_MEN = qimen.BA_MEN;
        res.locals.BA_SHEN = qimen.BA_SHEN;

        res.render('today', {
            page,
            qimen: page.pan,
            record: page.record,
            settings,
            almanac,
            almanacError,
            aiAdvice,
            aiLoadError
        });
    } catch (error) {
        pageError(res, error, '今日助手加载失败');
    }
});

// 历史记录
app.get('/history', async (req, res) => {
    try {
        const records = await dailyService.getHistory();
        res.render('history', {records});
    } catch (error) {
        pageError(res, error, '历史记录加载失败');
    }
});

// 应用设置
app.get('/settings', async (req, res) => {
    try {
        let settings;
        let settingsLoadError = '';
        try {
            settings = await activeSettingsStorage.read();
        } catch (error) {
            if (error.code !== 'SETTINGS_CORRUPT') throw error;
            settings = {...DEFAULT_SETTINGS};
            settingsLoadError = error.message;
        }
        let aiSettings;
        let aiSettingsLoadError = '';
        try {
            aiSettings = await activeAiSettingsStorage.readPublic();
        } catch (error) {
            aiSettings = toPublicAiSettings(DEFAULT_AI_SETTINGS);
            aiSettingsLoadError = error.message || 'AI 设置加载失败。';
        }
        const backups = await activeBackupService.listBackups();
        res.render('settings', {
            appName: packageMetadata.productName,
            version: packageMetadata.version,
            storageMode,
            backupDirectory: activeBackupService.backupsDir,
            settings,
            aiSettings,
            backups,
            settingsLoadError,
            aiSettingsLoadError
        });
    } catch (error) {
        pageError(res, error, '应用设置加载失败');
    }
});

// 关于与开源许可
app.get('/about', async (req, res) => {
    try {
        const license = await fs.readFile(path.join(__dirname, 'LICENSE'), 'utf8');
        res.render('about', {
            appName: packageMetadata.productName,
            version: packageMetadata.version,
            license
        });
    } catch (error) {
        pageError(res, error, '关于页面加载失败');
    }
});

// 自定义排盘
app.get('/custom', (req, res) => {
    // 获取请求参数
    const type = req.query.type || '四柱';
    const method = req.query.method || '时家';
    const shanghaiNow = getShanghaiWallClock();
    const dateStr = req.query.date || formatDateKey(shanghaiNow);
    const timeStr = req.query.time || formatTime(shanghaiNow);
    const location = req.query.location || '默认位置';
    const purpose = req.query.purpose || '综合';

    // 解析日期时间
    const date = parseCustomDateTime(dateStr, timeStr);

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
        return res.status(400).send('无效的日期时间');
    }

    try {
        // 计算奇门盘
        const options = {
            type,
            method,
            purpose,
            location
        };

        const qimenPan = qimen.calculate(date, options);

        // 初始化缺失的属性，确保模板不会报错
        if (!qimenPan.jiuGongAnalysis) {
            qimenPan.jiuGongAnalysis = {};
        }

        // 确保每个宫位都有基本属性
        for (let i = 1; i <= 9; i++) {
            if (!qimenPan.jiuGongAnalysis[i]) {
                qimenPan.jiuGongAnalysis[i] = {
                    direction: '',
                    gongName: '',
                    jiXiong: 'ping'
                };
            }
        }

        // 传递常量给视图
        res.locals.JIU_GONG = qimen.JIU_GONG;
        res.locals.JIU_XING = qimen.JIU_XING;
        res.locals.BA_MEN = qimen.BA_MEN;
        res.locals.BA_SHEN = qimen.BA_SHEN;

        const pageMeta = createPageMeta('custom', date, {
            ...options,
            jieQi: qimenPan.juShu && qimenPan.juShu.jieQiName
        });

        // 渲染页面
        res.render('index', {qimen: qimenPan, pageMeta, activePage: 'custom'});
    } catch (error) {
        console.error('自定义排盘错误:', error);
        // 返回错误页面
        res.status(500).send('排盘错误: ' + error.message);
    }
});

// API接口 - 获取奇门排盘数据
app.get('/api/qimen', (req, res) => {
    // 获取请求参数
    const type = req.query.type || '四柱';
    const method = req.query.method || '时家';
    const dateStr = req.query.date;
    const timeStr = req.query.time;
    const location = req.query.location || '默认位置';
    const purpose = req.query.purpose || '综合';

    // 解析日期时间
    let date;
    if (dateStr && timeStr) {
        date = new Date(`${dateStr}T${timeStr}`);
    } else {
        date = resolveUserDate(req.headers.cookie);
    }

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
        return res.status(400).json({error: '无效的日期时间'});
    }

    try {
        // 计算奇门盘
        const options = {
            type,
            method,
            purpose,
            location
        };

        const qimenPan = qimen.calculate(date, options);

        // 初始化缺失的属性，确保模板不会报错
        if (!qimenPan.jiuGongAnalysis) {
            qimenPan.jiuGongAnalysis = {};
        }

        // 确保每个宫位都有基本属性
        for (let i = 1; i <= 9; i++) {
            if (!qimenPan.jiuGongAnalysis[i]) {
                qimenPan.jiuGongAnalysis[i] = {
                    direction: '',
                    gongName: '',
                    jiXiong: 'ping'
                };
            }
        }

        // 返回JSON数据
        res.json(qimenPan);
    } catch (error) {
        console.error('API排盘错误:', error);
        res.status(500).json({error: '排盘错误', message: error.message});
    }
});

// API - 读取单日记录
app.get('/api/daily-records/:date', async (req, res) => {
    try {
        const record = await dailyService.getDailyRecord(req.params.date);
        res.json(record);
    } catch (error) {
        console.error('读取每日记录错误:', error);
        res.status(error.statusCode || 500).json({error: error.message || '读取每日记录失败'});
    }
});

// API - 保存单日记录
app.post('/api/daily-records/:date', async (req, res) => {
    try {
        const record = await dailyService.saveDailyRecord(req.params.date, req.body, {
            cookieHeader: req.headers.cookie
        });
        res.json(record);
    } catch (error) {
        console.error('保存每日记录错误:', error);
        res.status(error.statusCode || 500).json({error: error.message || '保存每日记录失败'});
    }
});

// API - 读取与保存应用设置
app.get('/api/settings', async (req, res) => {
    try {
        res.json(await activeSettingsStorage.read());
    } catch (error) {
        apiError(res, error, '读取应用设置失败');
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        res.json(await activeSettingsStorage.save(req.body));
    } catch (error) {
        if (error.code === 'SETTINGS_INVALID') error.statusCode = 400;
        apiError(res, error, '保存应用设置失败');
    }
});

// API - AI 设置（永不向前端返回 API Key）
app.get('/api/ai/settings', async (req, res) => {
    try {
        res.json(await activeAiSettingsStorage.readPublic());
    } catch (error) {
        apiError(res, error, '读取 AI 设置失败');
    }
});

app.post('/api/ai/settings', async (req, res) => {
    try {
        res.json(await activeAiSettingsStorage.save(req.body || {}));
    } catch (error) {
        apiError(res, error, '保存 AI 设置失败');
    }
});

// API - 服务端读取当天盘面、规则和记录，并生成 AI 今日建议
app.post('/api/ai/daily-advice', async (req, res) => {
    try {
        const result = await activeAiService.generateDailyAdvice({
            cookieHeader: req.headers.cookie,
            dateKey: req.body && req.body.date
        });
        res.json(result);
    } catch (error) {
        apiError(res, error, '生成 AI 今日建议失败');
    }
});

// API - 数据备份与恢复
app.get('/api/backups', async (req, res) => {
    try {
        res.json(await activeBackupService.listBackups());
    } catch (error) {
        apiError(res, error, '读取备份列表失败');
    }
});

app.post('/api/backups', async (req, res) => {
    try {
        const backup = await activeBackupService.createBackup();
        res.json({name: backup.name});
    } catch (error) {
        apiError(res, error, '创建备份失败');
    }
});

app.post('/api/backups/:name/restore', async (req, res) => {
    try {
        res.json(await activeBackupService.restoreBackup(req.params.name));
    } catch (error) {
        apiError(res, error, '恢复备份失败');
    }
});

// 启动服务器（被 require 时只导出 app，供测试挂载）
if (require.main === module) {
    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => {
        console.log(`奇门遁甲排盘系统正在运行，请访问 http://localhost:${port}`);
    });
    server.on('error', (error) => {
        console.error(`服务启动失败：${error.message}`);
        process.exitCode = 1;
    });
}

app.configureDailyStorage = configureDailyStorage;
app.getStorageMode = () => storageMode;
app.getDailyStorageConfig = () => ({
    dataDir: activeDailyStorage.dataDir,
    recordsFile: activeDailyStorage.recordsFile,
    settingsDir: activeSettingsStorage.settingsDir,
    settingsFile: activeSettingsStorage.settingsFile,
    backupsDir: activeBackupService.backupsDir,
    aiSettingsDir: activeAiSettingsStorage.settingsDir,
    aiSettingsFile: activeAiSettingsStorage.settingsFile,
    aiResultsDir: activeAiResultStorage.dataDir,
    aiResultsFile: activeAiResultStorage.resultsFile,
    storageMode
});
app.getSettings = () => activeSettingsStorage.read();
app.getDailyService = () => dailyService;
app.getDailyStorage = () => activeDailyStorage;
app.getAlmanacService = () => activeAlmanacService;

module.exports = app;
