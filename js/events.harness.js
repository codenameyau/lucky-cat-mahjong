'use strict';

const lib = require('./events-lib.js');

function createEventsApi() {
  return { api: lib };
}

module.exports = { createEventsApi };
