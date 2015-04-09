
// Required modules
var net = require('net'),
    kue = require('kue'),
    _ = require('lodash'),
    tasksQueue = kue.createQueue();

// Constructor
function AntHill(host, port) {
  this.host = host;
  this.port = port;
  this.workerAnts = [];
  this.callbacks = [];
  this.antStates = {
    ERROR: 'ERROR',
    READY: 'READY',
    BUSY: 'BUSY'
  };
}

AntHill.prototype = {
  // Create server and listen to port
  createServer: function() {
    var self = this;
    console.log('Server listening on ' + this.host + ':' + self.port);
    net.createServer(function(socket) {
      var worker = self.addWorker(socket);
      // Called on data received
      socket.on('data', function(message) {
        var messageObj = JSON.parse(message);
        switch(messageObj.state) {
          case 'READY':
            console.log('Worker state : READY');
            worker.state = self.antStates.READY;
          break;
          case 'BUSY':
            console.log('Worker state : BUSY');
            worker.state = self.antStates.BUSY;
          break;
          case 'COMPLETE':
            console.log('Worker state : COMPLETE');
            worker.state = self.antStates.READY;
            _.where(self.callbacks, { 'jobId': parseInt(messageObj.jobId) })[0].callback(null, messageObj);
          break;
          case 'ERROR':
            console.log('Worker state : ERROR');
            worker.state = self.antStates.ERROR;
            _.where(self.callbacks, { 'jobId': parseInt(messageObj.jobId) })[0].callback(messageObj.error, null);
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
      'id': this.workerAnts.length + 1,
      'state': this.antStates.READY,
      'socket': socket
    };
    this.workerAnts.push(worker);
    console.log('Worker ' + worker.id + ' connected');
    return worker;
  },
  // Remove disconnected worker
  removeWorker: function(socket) {
    _.remove(this.workerAnts, function(element) {
      console.log('Worker ' + element.id + ' disconnected');
      return element.socket == socket;
    });
  },
  // Add task to queue
  addTask: function(taskType, task, priority, delay, callback) {
    var self = this;
    var job = tasksQueue.create(taskType, {
        'task': task
    }).attempts(0).priority(priority).delay(delay).save();
    job.on('enqueue', function() {
      console.log('Job', job.id, 'enqueued', job.data.task);
      self.callbacks.push({
        'jobId': job.id,
        'callback': callback
      });
    });
    job.on('complete', function() {
      console.log('Job', job.id, 'completed', job.data.task);
    });
    job.on('failed', function() {
      console.log('Job', job.id, 'failed', job.data.task);
    });
  },
  // Get all workerAnts with status
  getWorkerAntsByState: function(state) {
    return _.where(this.workerAnts, { 'state': state });
  }
};

// export the class
module.exports = AntHill;