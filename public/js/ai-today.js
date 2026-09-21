'use strict';

(function () {
    const button = document.getElementById('generateAiAdviceButton');
    const status = document.getElementById('aiAdviceStatus');
    if (!button || !status) return;

    function setStatus(message, isError) {
        status.textContent = message;
        status.className = `settings-status ${isError ? 'text-danger' : 'text-success'}`;
    }

    button.addEventListener('click', async function () {
        button.disabled = true;
        setStatus('正在生成建议，请稍候…', false);
        try {
            const response = await fetch('/api/ai/daily-advice', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({date: button.getAttribute('data-date')})
            });
            let result;
            try {
                result = await response.json();
            } catch (error) {
                throw new Error('服务返回了无法识别的响应。');
            }
            if (!response.ok) throw new Error(result.error || 'AI 建议生成失败，请稍后重试。');
            setStatus('建议已生成并保存，正在刷新…', false);
            window.setTimeout(function () { window.location.reload(); }, 300);
        } catch (error) {
            setStatus(error.message || 'AI 建议生成失败，请稍后重试。', true);
            button.disabled = false;
        }
    });
})();
