'use strict';

var Ant = require('../lib/ant');

var cli = new Ant('127.0.0.1', 6969);

cli.connect();

cli.doTask({
	type: 'linkedin',
	callback: function(task, done) {
		console.log('Doing task ' + task.id);
		done(JSON.stringify('Result'));
	}
});
