'use strict';

// Loading the application initializes Firebase, sessions and rate-limit state.
// Workers requires that initialization inside a handler/DO constructor.
module.exports = function loadGateway() {
  return require('../../server/server.js');
};
