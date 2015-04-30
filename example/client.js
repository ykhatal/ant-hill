'use strict';

var Ant = require('../index');

var workerAnt = new Ant.WorkerAnt('127.0.0.1', 6969, 1000);

workerAnt.connect();
workerAnt.createQueue();

workerAnt.doTask({
	type: 'Task-Type',
	callback: function(task, done) {
		setTimeout(function() {
			done(null, 'ResultObject');
		}, 5000);
	}
});
