'use strict';

// Required modules
var net = require('net'),
    JsonSocket = require('json-socket'),
    kue = require('kue'),
    logger = require('./logger'),
    colors = require('colors'),
    _ = require('lodash');

// Constructor
function QueenAnt(host, port) {
  this.host = host;
  this.port = port;
  this.workerAnts = [];
  this.antStates = {
    READY: 'READY',
    BUSY: 'BUSY',
    PAUSED: 'PAUSED',
    STOPED: 'STOPED'
  };
  this.onTaskCompleteCallbacks = [];
  this.onTaskProcessCallback = null;
}

QueenAnt.prototype = {
  // To create server and listen to port
  createServer: function() {
    var self = this;
    logger.info(colors.bold.green('QueenAnt connected on ' + this.host + ':' + this.port));
    net.createServer(function(socket) {
      // net.Socket decorated to be a JsonSocket
      socket = new JsonSocket(socket);
      // Add workerAnt to workerAnts array
      var workerAnt = self.addWorkerAnt(socket);
      // Add a 'message' event handler for the client socket
      socket.on('message', function(message) {
        logger.info(colors.bold.cyan('Received message from workerAnt[' + workerAnt.id + '] : ') + JSON.stringify(message));
        self.setWorkerAntState(workerAnt, message.workerAntState);
        switch(message.type) {
        case 'PROCESSING':
          self.onTaskProcessCallback(message.taskObjId);
          break;
        case 'SUCCESS':
          kue.Job.get(parseInt(message.taskId, 10), function (err, job) {
            if (err) {
              return logger.error(colors.bgRed.white(err));
            }
            _.first(_.where(self.onTaskCompleteCallbacks, {
              'taskType': job.type
            })).success(message.success, message.taskObjId, function() {
              self.talkToWorkerAnt(workerAnt.id, { type: 'COMPLETE' });
            });
          });
          break;
        case 'ERROR':
          kue.Job.get(parseInt(message.taskId, 10), function (err, job) {
            if (err) {
              return logger.error(colors.bgRed.white(err));
            }
            _.first(_.where(self.onTaskCompleteCallbacks, {
              'taskType': job.type
            })).error(message.error, message.taskObjId, function() {
              self.talkToWorkerAnt(workerAnt.id, { type: 'COMPLETE' });
            });
          });
          break;
        case 'CONNECTED':
          self.talkToWorkerAnt(workerAnt.id, { type: 'CMD', cmd: 'START' });
          break;
        case 'DISCONNECTED':
          kue.Job.get(parseInt(message.taskId, 10), function (err, job) {
            if (err) {
              return logger.error(colors.bgRed.white(err));
            }
            if (job._state !== 'complete') {
              self.setTaskState(parseInt(message.taskId, 10), 'inactive');
              self.setTaskPriority(parseInt(message.taskId, 10), 'medium');
            }
          });
          break;
        }
      });

      // Add a 'close' event handler for the client socket
      socket.on('close', function() {
        self.removeWorkerAnt(socket);
      });
    }).listen(this.port, this.host);

    self.onShutdown();
  },

  // To  create task queue
  createQueue: function(options) {
    this.tasksQueue = kue.createQueue(options);
  },

  // To add connected workerAntm
  addWorkerAnt: function(socket) {
    var workerAnt = {
      'id': this.workerAnts.length + 1,
      'state': this.antStates.STOPED,
      'socket': socket
    };
    this.workerAnts.push(workerAnt);
    logger.info(colors.bold.green('workerAnt ' + workerAnt.id + ' connected'));
    return workerAnt;
  },

  // To remove disconnected workerAnt
  removeWorkerAnt: function(socket) {
    var workerAntToRemove;
    _.remove(this.workerAnts, function(workerAnt) {
      if (workerAnt.socket === socket) {
        workerAntToRemove = workerAnt;
      }
      return workerAnt.socket === socket;
    });
    logger.info(colors.bold.red('workerAnt ' + workerAntToRemove.id + ' disconnected'));
  },

  // To get all workerAnts
  getWorkerAnts: function() {
    var workers = [];
    this.workerAnts.forEach(function(elem) {
      workers.push({
        'id': elem.id,
        'state': elem.state
      });
    });
    return workers;
  },

  // To get all workerAnts with status
  getWorkerAntsByState: function(state) {
    return _.where(this.workerAnts, { 'state': state });
  },

  // To get all workerAnts with status
  getWorkerAntById: function(workerAntId) {
    return _.first(_.where(this.workerAnts, { 'id': workerAntId }));
  },

  // To add task to queue
  addTask: function(task, callback) {
    callback = callback || function() {};
    var self = this;
    var job = self.tasksQueue.create(task.type, {
        'taskObjId': task._id,
        'task': task.data
    });
    job
    .on('enqueue', function() {
      logger.info(colors.bgWhite.yellow('task', job.id, 'enqueued', JSON.stringify(job.data.task)));
    })
    .on('complete', function() {
      logger.info(colors.bgWhite.green('task', job.id, 'completed', JSON.stringify(job.data.task)));
    })
    .on('failed', function() {
      logger.info(colors.bgWhite.red('task', job.id, 'failed', JSON.stringify(job.data.task)));
    })
    .attempts(task.attempt)
    .priority(task.priority)
    .delay(task.delay)
    .save(function(err) {
      return callback(err, job);
    });
  },

  // To set workerAnt state
  setWorkerAntState: function(workerAnt, state) {
    _.first(_.where(this.workerAnts, { 'id': workerAnt.id })).state = state;
    logger.info(colors.bold.white('Set WorkerAnt[' + workerAnt.id + '] state to : ') + this.getStateColor(state));
  },

  // To get state associated color
  getStateColor: function(state) {
    var stateColor = state;
    switch(state) {
    case 'READY':
      stateColor = stateColor.green;
      break;
    case 'BUSY':
      stateColor = stateColor.yellow;
      break;
    case 'STOPED':
      stateColor = stateColor.red;
      break;
    case 'PAUSED':
      stateColor = stateColor.blue;
      break;
    }
    return stateColor;
  },

  // To set workerAnt state
  getWorkerAntState: function(workerAnt) {
    return _.first(_.where(this.workerAnts, { 'id': workerAnt.id })).state;
  },

  // To set task state
  setTaskState: function(taskId, taskState) {
    kue.Job.get(taskId, function (err, job) {
      if (err) {
        logger.error(colors.bgRed.white(err));
      } else {
        job.state(taskState).save();
        logger.info(colors.bgWhite.gray('Task ' + job.id + ' state changed  to : ' + taskState));
      }
    });
  },

  // To set task priority
  setTaskPriority: function(taskId, taskPriority) {
    kue.Job.get(taskId, function (err, job) {
      if (err) {
        logger.error(colors.bgRed.white(err));
      } else {
        job.priority(taskPriority).save();
        logger.info(colors.bgWhite.gray('Task ' + job.id + ' priority changed  to : ' + taskPriority));
      }
    });
  },

  // To send message to WorkerAnt
  talkToWorkerAnt: function(workerAntId, message) {
    this.getWorkerAntById(workerAntId).socket.sendMessage(message);
    logger.info(colors.bold.blue('Sended message to workerAnt[' + workerAntId + ']: ') + JSON.stringify(message));
  },

  // To do before shutdown
  doBeforeShutdown: function(callback) {
    var self = this;
    self.workerAnts.forEach(function(workerAnt) {
      self.talkToWorkerAnt(workerAnt.id, { type: 'CMD', cmd: 'STOP' });
    });
    callback();
    logger.info(colors.bold.red('QueenAnt disconnected'));
    process.exit();
  },

  // To call on server shutdown
  onShutdown: function(callback) {
    var self = this;
    callback = callback || function () {};
    process.on('SIGTERM', function () {
      self.doBeforeShutdown(callback);
    });
    process.on('SIGINT', function() {
      self.doBeforeShutdown(callback);
    });
    process.on('SIGQUIT', function() {
      self.doBeforeShutdown(callback);
    });
  },

  // To set Task complete callbacks
  onTaskComplete: function(callbacks) {
    var self = this;
    callbacks.forEach(function(callback) {
      callback = callback || function() {};
      self.onTaskCompleteCallbacks.push(callback);
    });
  },

  // To set Task processing callback
  onTaskProcess: function(callback) {
    callback = callback || function() {};
    this.onTaskProcessCallback = callback;
  },
};

// export the class
module.exports = QueenAnt;
