'use strict';

// Required modules
var net = require('net'),
    JsonSocket = require('json-socket'),
    kue = require('kue'),
    logger = require('./logger'),
    _ = require('lodash');

// Constructor
function QueenAnt(host, port) {
  this.host = host;
  this.port = port;
  this.workerAnts = [];
  this.callbacks = [];
  this.antStates = {
    READY: 'READY',
    BUSY: 'BUSY',
    PAUSED: 'PAUSED',
    STOPED: 'STOPED'
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
      logger.info('There is ' + self.getWorkerAnts().length + ' connected simultanously');

      // Add a 'message' event handler for the client socket
      socket.on('message', function(message) {
        logger.info('Received message : ' + JSON.stringify(message));
        self.setWorkerAntState(workerAnt, message.workerAntState);
        switch(message.type) {
        case 'SUCCESS':
          _.first(_.where(self.callbacks, { 'taskId': parseInt(message.taskId) })).success(message.success);
          break;
        case 'ERROR':
          _.first(_.where(self.callbacks, { 'taskId': parseInt(message.taskId) })).error(message.error);
          break;
        case 'CONNECTED':
          self.talkToWorkerAnt(workerAnt.id, { type: 'CMD', cmd: 'START' });
          break;
        }
      });

      // Add a 'close' event handler for the client socket
      socket.on('close', function() {
        self.removeWorkerAnt(socket);
      });
    }).listen(this.port, this.host);
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
  addTask: function(task) {
    var self = this;
    var job = self.tasksQueue.create(task.type, {
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
    _.first(_.where(this.workerAnts, { 'id': workerAnt.id })).state = state;
    logger.info('Set workerAnt state to : ' + state);
  },

  // To set workerAnt state
  getWorkerAntState: function(workerAnt) {
    return _.first(_.where(this.workerAnts, { 'id': workerAnt.id })).state;
  },

  // To set task state
  setTaskState: function(task, taskState) {
    task.state(taskState).save();
    logger.info('Task ' + task.id + ' state changed  to : ' + taskState);
  },

  // To send message to WorkerAnt
  talkToWorkerAnt: function(workerAntId, message) {
    this.getWorkerAntById(workerAntId).socket.sendMessage(message);
    logger.info('Sended message : ' + JSON.stringify(message));
  },

  onShutdown: function(callback) {
    var self = this;
    callback = callback || function () {};
    process.on('SIGTERM', function () {
      self.workerAnts.forEach(function(workerAnt) {
        self.talkToWorkerAnt(workerAnt.id, { type: 'CMD', cmd: 'STOP' });
      });
      callback();
      process.exit();
    });
  }
};



// export the class
module.exports = QueenAnt;
