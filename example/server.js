'use strict';

var AntHill = require('../index'),
	fs = require('fs');

var queenAnt = new AntHill.QueenAnt('127.0.0.1', 6969);

queenAnt.createServer();
queenAnt.createQueue();

var data = [
	{ company: 'amazon', keyword: 'sales' },
	{ company: 'extia', keyword: 'sales' },
	{ company: 'google', keyword: 'sales' },
	{ company: 'facebook', keyword: 'sales' },
	{ company: 'microsoft', keyword: 'sales' },
	{ company: 'scientipole', keyword: 'sales' },
	{ company: 'yahoo', keyword: 'sales' },
	{ company: 'linkedin', keyword: 'sales' },
	{ company: 'twitter', keyword: 'sales' },
	{ company: 'asus', keyword: 'sales' },
];

for (var i = 0; i < data.length; ++i) {
	queenAnt.addTask({
		type: 'Task-Type',
		data: data[i],
		priority: 'normal',
		delay: 0,
		attempt: 3
	});
}

queenAnt.onTaskComplete([
	{
		taskType: 'Task-Type',
		success: function(result, done) {
			console.log('Result : ' + result);
			done();
		},
		error: function(err, done) {
			console.log('Error : ' + err);
			done();
		},
	}
]);

queenAnt.onShutdown(function(){
});
