'use strict';

// Required modules
var net = require('net'),
    JsonSocket = require('json-socket'),
    kue = require('kue'),
    logger = require('./logger'),
    _ = require('lodash'),
    tasksQueue = kue.createQueue();

// Constructor
function QueenAnt(host, port) {
  this.host = host;
  this.port = port;
  this.workerAnts = [];
  this.callbacks = [];
  this.antStates = {
    ERROR: 'ERROR',
    READY: 'READY',
    BUSY: 'BUSY',
    PAUSED: 'PAUSED',
    STOPED: 'STOPED',
    CONNECTED: 'CONNECTED'
  };
}

QueenAnt.prototype = {
  // To create server and listen to port
  createServer: function() {
    var self = this;
    logger.info('Server listening on ' + this.host + ':' + this.port);
    net.createServer(function(socket) {
      socket = new JsonSocket(socket); // net.Socket decorated to be a JsonSocket
      var workerAnt = self.addWorkerAnt(socket);
      // Called on data received
      socket.on('message', function(message) {
        logger.info('Received message : ' + JSON.stringify(message));
        switch(message.state) {
        case 'CONNECTED':
          self.setWorkerAntState(workerAnt, self.antStates.READY);
          self.sendToWorkerAnt(workerAnt, { type: 'CMD', cmd: 'START' });
          break;
        case 'READY':
          self.setWorkerAntState(workerAnt, self.antStates.READY);
          _.first(_.where(self.callbacks, { 'taskId': parseInt(message.taskId) })).success(message);
          break;
        case 'BUSY':
          self.setWorkerAntState(workerAnt, self.antStates.BUSY);
          break;
        case 'ERROR':
          self.setWorkerAntState(workerAnt, self.antStates.ERROR);
          _.first(_.where(self.callbacks, { 'taskId': parseInt(message.taskId) })).error(message);
          break;
        }
      });
      // Called on workerAnt disconnection
      socket.on('close', function() {
        self.removeWorkerAnt(socket);
      });
    }).listen(this.port, this.host);
  },

  // To add connected workerAntm
  addWorkerAnt: function(socket) {
    var workerAnt = {
      'id': this.workerAnts.length + 1,
      'state': this.antStates.READY,
      'socket': socket
    };
    this.workerAnts.push(workerAnt);
    logger.info('workerAnt ' + workerAnt.id + ' connected');
    return workerAnt;
  },

  // To remove disconnected workerAnt
  removeWorkerAnt: function(socket) {
    _.remove(this.workerAnts, function(workerAnt) {
      logger.info('workerAnt ' + workerAnt.id + ' disconnected');
      return workerAnt.socket === socket;
    });
  },

  // To get all workerAnts
  getWorkerAnts: function() {
    return this.workerAnts;
  },

  // To get all workerAnts with status
  getWorkerAntsByState: function(state) {
    return _.where(this.workerAnts, { 'state': state });
  },

  // To get all workerAnts with status
  getWorkerAntsById: function(id) {
    return _.where(this.workerAnts, { 'id': id });
  },

  // To add task to queue
  addTask: function(task) {
    var self = this;
    var job = tasksQueue.create(task.type, {
        'task': task.data
      }).attempts(task.attempt).priority(task.priority).delay(task.delay).save();
    job.on('enqueue', function() {
      logger.info('task', job.id, 'enqueued', job.data.task);
      self.callbacks.push({
        'taskId': job.id,
        'success': task.success,
        'error': task.error
      });
    });
    job.on('complete', function() {
      logger.info('task', job.id, 'completed', job.data.task);
    });
    job.on('failed', function() {
      logger.info('task', job.id, 'failed', job.data.task);
    });
  },

  // To set workerAnt state
  setWorkerAntState: function(workerAnt, state) {
    _.where(this.workerAnts, { 'id': workerAnt.id })[0].state = state;
    logger.info('workerAnt state : ' + state);
  },

  // To set workerAnt state
  getWorkerAntState: function(workerAnt) {
    var self = this;
    self.sendToWorkerAnt(workerAnt, { type: 'CMD', cmd: 'GET-STATUS' });
    workerAnt.on('message', function(message) {
      if (message.type === 'STATUS') {
        self. setWorkerAntState(workerAnt, message.state);
        return message.state;
      }
    });
  },

  // To set task state
  setTaskState: function(task, taskState) {
    task.state(taskState).save();
    logger.info('Task ' + task.id + ' state changed  to : ' + taskState);
  },

  // To send message to WorkerAnt
  sendToWorkerAnt: function(workerAnt, message) {
    workerAnt.socket.sendMessage(message);
    logger.info('Sended message : ' + JSON.stringify(message));
  }
};

// export the class
module.exports = QueenAnt;
