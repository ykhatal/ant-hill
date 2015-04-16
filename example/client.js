'use strict';

var Ant = require('../index');

var client = new Ant.WorkerAnt('127.0.0.1', 6969);

client.connect();
client.createQueue();

client.doTask({
	type: 'linkedin',
	callback: function(task, done) {
		console.log('Doing task ' + task.id);
		setTimeout(function() {
			done(JSON.stringify('Result'));
		}, 5000);
	}
});
