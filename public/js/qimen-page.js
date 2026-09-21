(function () {
    'use strict';

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function formatDate(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function shanghaiToday(offset) {
        var parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());
        var values = {};
        parts.forEach(function (part) {
            if (part.type !== 'literal') values[part.type] = Number(part.value);
        });
        var date = new Date(values.year, values.month - 1, values.day + offset);
        return formatDate(date);
    }

    function timeToHour(time) {
        var match = /^(\d{2}):(\d{2})$/.exec(time || '');
        return match ? Number(match[1]) : -1;
    }

    function selectButton(button, updateTime) {
        var buttons = document.querySelectorAll('.shichen-button');
        buttons.forEach(function (item) {
            var selected = item === button;
            item.classList.toggle('is-selected', selected);
            item.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });

        var title = document.getElementById('selectedShichen');
        var range = document.getElementById('selectedShichenRange');
        var time = document.getElementById('time');
        if (title) title.textContent = button.dataset.shichen + '时';
        if (range) range.textContent = button.dataset.range;
        if (updateTime && time) time.value = button.dataset.time;
    }

    function syncShichenFromTime() {
        var time = document.getElementById('time');
        if (!time) return;
        var hour = timeToHour(time.value);
        var button = Array.prototype.find.call(document.querySelectorAll('.shichen-button'), function (item) {
            var midpointHour = timeToHour(item.dataset.time);
            return item.dataset.shichen === '子'
                ? hour === 23 || hour === 0
                : hour === midpointHour || hour === midpointHour + 1;
        });
        if (button) selectButton(button, false);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var pan = window.QIMEN_PAN_DATA || {};
        var bestGong = pan.analysis && pan.analysis.bestGong;
        if (bestGong) {
            var bestGongElement = document.querySelector('.gong.gong' + bestGong);
            if (bestGongElement) bestGongElement.classList.add('best-gong');
        }

        var form = document.getElementById('customPanForm');
        if (!form) return;

        document.querySelectorAll('[data-date-offset]').forEach(function (button) {
            button.addEventListener('click', function () {
                document.getElementById('date').value = shanghaiToday(Number(button.dataset.dateOffset));
            });
        });

        document.querySelectorAll('.shichen-button').forEach(function (button) {
            button.addEventListener('click', function () {
                selectButton(button, true);
            });
        });

        var time = document.getElementById('time');
        if (time) time.addEventListener('input', syncShichenFromTime);
        syncShichenFromTime();
    });
}());
