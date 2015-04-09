
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
      var workerAnt = self.addworkerAnt(socket);
      // Called on data received
      socket.on('data', function(message) {
        var messageObj = JSON.parse(message);
        switch(messageObj.state) {
          case 'READY':
            console.log('workerAnt state : READY');
            self.setWorkerAntState(workerAnt, self.antStates.READY);
          break;
          case 'BUSY':
            console.log('workerAnt state : BUSY');
            self.setWorkerAntState(workerAnt, self.antStates.BUSY);
          break;
          case 'COMPLETE':
            console.log('workerAnt state : COMPLETE');
            self.setWorkerAntState(workerAnt, self.antStates.READY);
            _.where(self.callbacks, { 'jobId': parseInt(messageObj.jobId) })[0].callback(null, messageObj);
          break;
          case 'ERROR':
            console.log('workerAnt state : ERROR');
            self.setWorkerAntState(workerAnt, self.antStates.ERROR);
            _.where(self.callbacks, { 'jobId': parseInt(messageObj.jobId) })[0].callback(messageObj.error, null);
          break;
        }
      });
      // Called on workerAnt disconnection
      socket.on('close', function() {
        self.removeworkerAnt(socket);
      });
    }).listen(this.port, this.host);
  },
  // Add connected workerAnt
  addworkerAnt: function(socket) {
    var workerAnt = {
      'id': this.workerAnts.length + 1,
      'state': this.antStates.READY,
      'socket': socket
    };
    this.workerAnts.push(workerAnt);
    console.log('workerAnt ' + workerAnt.id + ' connected');
    return workerAnt;
  },
  // Remove disconnected workerAnt
  removeworkerAnt: function(socket) {
    _.remove(this.workerAnts, function(element) {
      console.log('workerAnt ' + element.id + ' disconnected');
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
  },
  // Get all workerAnts with status
  getWorkerAntsById: function(id) {
    return _.where(this.workerAnts, { 'id': id });
  },
  // Set workerAnt state
  setWorkerAntState: function (ant, state) {
    _.where(this.workerAnts, { 'id': ant.id }).state = state;
  }
};

// export the class
module.exports = AntHill;