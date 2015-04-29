'use strict';

var winston = require('winston');

var options = {
  level: 'debug',
  humanReadableUnhandledException: true,
  handleExceptions: true,
  json: false,
  colorize: true
};

var handlers = function (fileName) {
	return [
    new (winston.transports.Console)(options),
    new winston.transports.File({ filename: __dirname + '../logs/'+ fileName +'.log', json: false })
  ];
};

var logger = new (winston.Logger)({
  transports: handlers('debug'),
  exceptionHandlers: handlers('exceptions'),
  exitOnError: true
});

module.exports = logger;
