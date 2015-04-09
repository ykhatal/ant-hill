
// Required modules
var net = require('net'),
    kue = require('kue'),
		tasksQueue = kue.createQueue();

var protocol = [
  {
    type: 'READY',
    cb: function(jsonObj, worker, self) {
      console.log('Worker READY');
      worker.state = self.workerState.READY;
    }
  },
  {
    type: 'BUSY',
    cb: function(jsonObj, worker, self) {
      console.log('Worker BUSY');
      worker.state = self.workerState.BUSY;
    }
  },
  {
    type: 'COMPLETE',
    cb: function(jsonObj, worker, self) {
      console.log('Worker COMPLETE');
      worker.state = self.workerState.READY;
      self.callbacks[jsonObj.jobId](jsonObj);
    }
  },
  {
    type: 'ERROR',
    cb: function(jsonObj, worker, self) {
      console.log('Worker ERROR');
      worker.state = self.workerState.ERROR;
    }
  }
];

// Constructor
function AntHill(host, port) {
  this.host = host;
  this.port = port;
  this.workers = [];
  this.callbacks = {};
  this.workerState = {
  	ERROR: -1,
    READY: 0,
    BUSY: 1
  };
}

AntHill.prototype.createServer = function() {
	var self = this;
	console.log('Server listening on ' + self.host + ':' + self.port);
	net.createServer(function(socket) {
		// Add connected worker
		var worker = {
        id: self.workers.length + 1,
        status: self.workerState.READY,
        socket: socket
    }
		console.log('Worker ' + worker.id + ' connected');
    self.addWorker(worker);
		// Called on data received
		socket.on('data', function(message) {
			var messageObj = JSON.parse(message);
			for (var i = 0; i < protocol.length; ++i) {
				switch(messageObj.type) {
					case protocol[i].type:
						protocol[i].cb(messageObj, worker, self);
					break;
				}
			}
  	});
  	// Called on worker disconnection
		socket.on('close', function() {
			self.removeWorker(worker);
  	});
	}).listen(this.port, this.host);
};

// class methods
AntHill.prototype.addWorker = function(worker) {
	this.workers.push(worker);
};

AntHill.prototype.removeWorker = function(worker) {
	var ind = this.workers.indexOf(worker);
	if (ind != -1) {
    this.workers.splice(ind, 1);
  }
};

AntHill.prototype.addTask = function(taskType, task, priority, delay, callback) {
  var self = this;
  var job = tasksQueue.create(taskType, {
      task: task,
      callback: callback
  }).attempts(0).priority(priority).delay(delay).save();
  job.on('enqueue', function() {
  	console.log('Job', job.id, 'enqueued', job.data.task);
    self.callbacks[job.id] = callback;
  });
  job.on('complete', function() {
    console.log('Job', job.id, 'completed', job.data.task);
  });
  job.on('failed', function() {
    console.log('Job', job.id, 'failed', job.data.task);
  });
};

// export the class
module.exports = AntHill;