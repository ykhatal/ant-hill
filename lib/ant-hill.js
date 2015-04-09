
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
    BUSY: 'BUSY',
    PAUSED: 'PAUSED'
  };
}

AntHill.prototype = {
  // Create server and listen to port
  createServer: function() {
    var self = this;
    console.log('Server listening on ' + this.host + ':' + this.port);
    net.createServer(function(socket) {
      var workerAnt = self.addWorkerAnt(socket);
      // Called on data received
      socket.on('data', function(message) {
        var messageObj = JSON.parse(message);
        switch(messageObj.state) {
          case 'READY':
            self.setWorkerAntState(workerAnt, self.antStates.READY);
          break;
          case 'BUSY':
            self.setWorkerAntState(workerAnt, self.antStates.BUSY);
          break;
          case 'COMPLETE':
            self.setWorkerAntState(workerAnt, self.antStates.READY);
            _.first(_.where(self.callbacks, { 'taskId': parseInt(messageObj.taskId) })).success(messageObj);
          break;
          case 'ERROR':
            self.setWorkerAntState(workerAnt, self.antStates.ERROR);
            _.first(_.where(self.callbacks, { 'taskId': parseInt(messageObj.taskId) })).error(messageObj);
          break;
        }
      });
      // Called on workerAnt disconnection
      socket.on('close', function() {
        self.removeWorkerAnt(socket);
      });
    }).listen(this.port, this.host);
  },
  // Add connected workerAnt
  addWorkerAnt: function(socket) {
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
  removeWorkerAnt: function(socket) {
    _.remove(this.workerAnts, function(workerAnt) {
      console.log('workerAnt ' + workerAnt.id + ' disconnected');
      return workerAnt.socket == socket;
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
  // Add task to queue
  addTask: function(task) {
    var self = this;
    var job = tasksQueue.create(task.type, {
        'task': task.data
    }).attempts(task.attempt).priority(task.priority).delay(task.delay).save();
    job.on('enqueue', function() {
      console.log('task', job.id, 'enqueued', job.data.task);
      self.callbacks.push({
        'taskId': job.id,
        'success': task.success,
        'error': task.error
      });
    });
    job.on('complete', function() {
      console.log('task', job.id, 'completed', job.data.task);
    });
    job.on('failed', function() {
      console.log('task', job.id, 'failed', job.data.task);
    });
  },
  // Set workerAnt state
  setWorkerAntState: function (workerAnt, state) {
    _.where(this.workerAnts, { 'id': workerAnt.id })[0].state = state;
    console.log('workerAnt state : ' + state);
  },
  // Set task state
  setTaskState: function(task, taskState) {
    task.state(taskState).save();
    console.log('Task ' + task.id + ' state changed  to : ' + taskState);
  }
};

// export the class
module.exports = AntHill;