
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
    console.log('Server listening on ' + this.host + ':' + self.port);
    net.createServer(function(socket) {
      var workerAnt = self.addworkerAnt(socket);
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
            _.where(self.callbacks, { 'taskId': parseInt(messageObj.taskId) })[0].callback(null, messageObj);
          break;
          case 'ERROR':
            self.setWorkerAntState(workerAnt, self.antStates.ERROR);
            _.where(self.callbacks, { 'taskId': parseInt(messageObj.taskId) })[0].callback(messageObj.error, null);
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
    var task = tasksQueue.create(taskType, {
        'task': task
    }).attempts(0).priority(priority).delay(delay).save();
    task.on('enqueue', function() {
      console.log('task', task.id, 'enqueued', task.data.task);
      self.callbacks.push({
        'taskId': task.id,
        'callback': callback
      });
    });
    task.on('complete', function() {
      console.log('task', task.id, 'completed', task.data.task);
    });
    task.on('failed', function() {
      console.log('task', task.id, 'failed', task.data.task);
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
    _.where(this.workerAnts, { 'id': workerAnt.id })[0].state = state;
    console.log('workerAnt state : ' + state);
  },
  setTaskStatus: function(task, taskType, taskStatus) {
    kue.Job.rangeByType (taskType, task.state, task.id, task.id, 'asc', function (err, selectedTasks) {
      selectedTasks.forEach(function (task) {
          task.state(taskStatus).save();
      });
    });
  }
};

// export the class
module.exports = AntHill;