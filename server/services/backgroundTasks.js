'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const requestTasks = new AsyncLocalStorage();

function runWithBackgroundTasks(waitUntil, work) {
  return requestTasks.run(waitUntil, work);
}

function trackBackgroundTask(promise) {
  requestTasks.getStore()?.(promise);
  return promise;
}

module.exports = { runWithBackgroundTasks, trackBackgroundTask };
