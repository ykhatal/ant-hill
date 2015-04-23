'use strict';

var Ant = require('../index');

var workerAnt = new Ant.WorkerAnt('127.0.0.1', 6969);

workerAnt.connect();
workerAnt.createQueue();

workerAnt.doTask({
	type: 'Task-Type',
	callback: function(task, done) {
		setTimeout(function() {
			done(JSON.stringify('ResultObject'));
		}, 5000);
	}
});

workerAnt.onShutdown(function(){
});
