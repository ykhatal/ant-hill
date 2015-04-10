'use strict';

var AntHill = require('../lib/ant-hill'),
 		kue = require('kue'),
 		express = require('express'),
 		ui = require('kue-ui'),
 		app = express(),
 		fs = require('fs');

var server = new AntHill('127.0.0.1', 6969);
server.createServer();


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
	{ company: 'samsung', keyword: 'sales' },
	{ company: 'hp', keyword: 'sales' },
	{ company: 'sony', keyword: 'sales' },
	{ company: 'apple', keyword: 'sales' },
	{ company: 'htc', keyword: 'sales' },
	{ company: 'jvc', keyword: 'sales' },
	{ company: 'nokia', keyword: 'sales' }
];

for(var i = 0; i < data.length; ++i) {
	server.addTask({
		type: 'linkedin',
		data: data[i],
		priority: 'normal',
		delay: 0,
		attempt: 3,
		success: function (result) {
			console.log(result);
		},
		error: function(err) {

		}
	});
}


ui.setup({
    apiURL: '/api', // IMPORTANT: specify the api url
    baseURL: '/kue' // IMPORTANT: specify the base url
});

// Mount kue JSON api
app.use('/api', kue.app);
// Mount UI
app.use('/kue', ui.app);

app.listen(3000);