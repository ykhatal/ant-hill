
// Required modules
var net = require('net'),
    kue = require('kue'),
    _ = require('lodash'),
    tasksQueue = kue.createQueue();

// Constructor
function AntHill(host, port) {
  this.host = host;
  this.port = port;
  this.workers = [];
  this.callbacks = {};
  this.workerState = {
    ERROR: 'ERROR',
    READY: 'READY',
    BUSY: 'BUSY'
  };
}

AntHill.prototype = {
  // Create server and listen to port
  createServer: function() {
    var self = this;
    console.log('Server listening on ' + self.host + ':' + self.port);
    net.createServer(function(socket) {
      var worker = self.addWorker(socket);
      // Called on data received
      socket.on('data', function(message) {
        var messageObj = JSON.parse(message);
        switch(messageObj.state) {
          case 'READY':
            console.log('Worker state : READY');
            worker.state = self.workerState.READY;
          break;
          case 'BUSY':
            console.log('Worker state : BUSY');
            worker.state = self.workerState.BUSY;
          break;
          case 'COMPLETE':
            console.log('Worker state : COMPLETE');
            worker.state = self.workerState.READY;
            self.callbacks[messageObj.jobId](null, messageObj);
          break;
          case 'ERROR':
            console.log('Worker state : ERROR');
            worker.state = self.workerState.ERROR;
            self.callbacks[messageObj.jobId](messageObj.error, null);
          break;
        }
      });
      // Called on worker disconnection
      socket.on('close', function() {
        self.removeWorker(socket);
      });
    }).listen(this.port, this.host);
  },
  // Add connected worker
  addWorker: function(socket) {
    var worker = {
      'id': this.workers.length + 1,
      'state': this.workerState.READY,
      'socket': socket
    };
    this.workers.push(worker);
    console.log('Worker ' + worker.id + ' connected');
    return worker;
  },
  // Remove disconnected worker
  removeWorker: function(socket) {
    _.remove(this.workers, function(element) {
      console.log('Worker ' + element.id + ' disconnected');
      return element.socket == socket;
    });
  },
  // Add task to queue
  addTask: function(taskType, task, priority, delay, callback) {
    var self = this;
    var job = tasksQueue.create(taskType, {
        'task': task,
        'callback': callback
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
  },
  // List all workers with status
  getWorkersByState: function(state) {
    return _.where(this.workers, { 'state': state });
  }
};

// export the class
module.exports = AntHill;