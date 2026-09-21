'use strict';

(function () {
    const settingsForm = document.getElementById('settingsForm');
    const settingsStatus = document.getElementById('settingsStatus');
    const backupStatus = document.getElementById('backupStatus');
    const saveButton = document.getElementById('saveSettingsButton');
    const backupButton = document.getElementById('createBackupButton');
    const aiSettingsForm = document.getElementById('aiSettingsForm');
    const aiSettingsStatus = document.getElementById('aiSettingsStatus');
    const saveAiSettingsButton = document.getElementById('saveAiSettingsButton');

    function setStatus(element, message, isError) {
        if (!element) return;
        element.textContent = message;
        element.className = `settings-status ${isError ? 'text-danger' : 'text-success'}`;
    }

    async function jsonRequest(url, options) {
        const response = await fetch(url, options);
        let body;
        try {
            body = await response.json();
        } catch (error) {
            throw new Error('服务返回了无法识别的响应。');
        }
        if (!response.ok) throw new Error(body.error || '操作失败。');
        return body;
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            saveButton.disabled = true;
            setStatus(settingsStatus, '正在保存…', false);
            try {
                await jsonRequest('/api/settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        startupPage: document.getElementById('startupPage').value,
                        dailyReferenceTime: document.getElementById('dailyReferenceTime').value,
                        showRuleAnalysis: document.getElementById('showRuleAnalysis').checked,
                        showGongDetails: document.getElementById('showGongDetails').checked
                    })
                });
                setStatus(settingsStatus, '设置已保存，重新启动应用后启动页设置生效。', false);
            } catch (error) {
                setStatus(settingsStatus, error.message || '保存设置失败。', true);
            } finally {
                saveButton.disabled = false;
            }
        });
    }

    if (aiSettingsForm) {
        aiSettingsForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            saveAiSettingsButton.disabled = true;
            setStatus(aiSettingsStatus, '正在安全保存 AI 设置…', false);
            const apiKeyField = document.getElementById('aiApiKey');
            const clearField = document.getElementById('clearAiApiKey');
            const payload = {
                enabled: document.getElementById('aiEnabled').checked,
                baseUrl: document.getElementById('aiBaseUrl').value.trim(),
                model: document.getElementById('aiModel').value.trim(),
                clearApiKey: Boolean(clearField && clearField.checked)
            };
            if (apiKeyField.value) payload.apiKey = apiKeyField.value;

            try {
                const saved = await jsonRequest('/api/ai/settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                apiKeyField.value = '';
                setStatus(
                    aiSettingsStatus,
                    saved.apiKeyConfigured ? 'AI 设置已保存，API Key 已配置。' : 'AI 设置已保存，API Key 尚未配置。',
                    false
                );
                window.setTimeout(function () { window.location.reload(); }, 700);
            } catch (error) {
                apiKeyField.value = '';
                setStatus(aiSettingsStatus, error.message || '保存 AI 设置失败。', true);
                saveAiSettingsButton.disabled = false;
            }
        });
    }

    if (backupButton) {
        backupButton.addEventListener('click', async function () {
            backupButton.disabled = true;
            setStatus(backupStatus, '正在创建备份…', false);
            try {
                const result = await jsonRequest('/api/backups', {method: 'POST'});
                setStatus(backupStatus, `备份已创建：${result.name}`, false);
                window.setTimeout(function () { window.location.reload(); }, 700);
            } catch (error) {
                setStatus(backupStatus, error.message || '备份失败。', true);
                backupButton.disabled = false;
            }
        });
    }

    document.querySelectorAll('.restore-backup-button').forEach(function (button) {
        button.addEventListener('click', async function () {
            const name = button.getAttribute('data-backup');
            if (!window.confirm(`确定恢复 ${name}？恢复前会自动备份当前数据。`)) return;

            button.disabled = true;
            setStatus(backupStatus, '正在安全备份当前数据并恢复…', false);
            try {
                const result = await jsonRequest(`/api/backups/${encodeURIComponent(name)}/restore`, {method: 'POST'});
                setStatus(backupStatus, `恢复成功；当前数据安全备份为 ${result.safetyBackup}。`, false);
                window.setTimeout(function () { window.location.reload(); }, 700);
            } catch (error) {
                setStatus(backupStatus, error.message || '恢复失败。', true);
                button.disabled = false;
            }
        });
    });
})();
