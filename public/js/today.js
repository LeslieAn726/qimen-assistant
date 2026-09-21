'use strict';

(function () {
    const form = document.getElementById('dailyRecordForm');
    if (!form) return;

    const saveButton = document.getElementById('saveRecordButton');
    const saveStatus = document.getElementById('saveStatus');
    const initialPlan = document.getElementById('plan').value;
    const initialImportant = document.getElementById('important').value;

    function getValue(id) {
        const field = document.getElementById(id);
        return field ? field.value : '';
    }

    function setStatus(message, isError) {
        saveStatus.textContent = message;
        saveStatus.className = isError ? 'help-block text-danger' : 'help-block text-success';
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        const date = getValue('recordDate');
        const payload = {
            panTime: getValue('panTime'),
            plan: getValue('plan'),
            important: getValue('important'),
            result: getValue('result'),
            review: getValue('review')
        };

        saveButton.disabled = true;
        setStatus('正在保存…', false);

        try {
            const response = await fetch(`/api/daily-records/${encodeURIComponent(date)}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '保存失败');
            }

            const savedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '';
            setStatus(savedAt ? `已保存：${savedAt}` : '已保存', false);
            const advicePanel = document.querySelector('.ai-advice-panel');
            const staleWarning = document.getElementById('aiStaleWarning');
            if (advicePanel && staleWarning
                && advicePanel.getAttribute('data-has-advice') === 'true'
                && (payload.plan !== initialPlan || payload.important !== initialImportant)) {
                staleWarning.classList.remove('hidden');
            }
        } catch (error) {
            setStatus(error.message || '保存失败，请稍后重试', true);
        } finally {
            saveButton.disabled = false;
        }
    });
})();
