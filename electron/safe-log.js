'use strict';

function safeLog(method, ...args) {
    try {
        console[method](...args);
        return true;
    } catch (error) {
        if (error && error.code === 'EPIPE') return false;
        throw error;
    }
}

module.exports = {safeLog};
