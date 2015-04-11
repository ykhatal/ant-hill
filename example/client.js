'use strict';

var Ant = require('../lib/ant');

var cli = new Ant('127.0.0.1', 6969);

cli.connect();

cli.doTask({
	type: 'linkedin',
	callback: function(task) {
		console.log('Doing task ' + task.id);
		return JSON.stringify({
			type: 'MESSAGE',
			state: 'BUSY',
			data: 'Worker BUSY.'
		});
	}
});
