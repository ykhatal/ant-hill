'use strict';

// Required modules
var net = require('net'),
    events = require('events'),
    JsonSocket = require('json-socket'),
    kue = require('kue'),
    logger = require('./logger');

// Constructor
function WorkerAnt(host, port, timeout) {
  this.host = host;
  this.port = port;
  this.antStates = {
    READY: 'READY',
    BUSY: 'BUSY',
    PAUSED: 'PAUSED',
    STOPED: 'STOPED'
  };
  this.timeout = timeout || 60000;
  this.state = this.antStates.STOPED;
  this.socket = null;
  this.ctx = null;
  this.taskType = '';
  this.callback = null;
  this.tasksQueue = null;
  this.intervalId = null;
  this.currentTask = null;
  this.eventEmitter = new events.EventEmitter();
}

WorkerAnt.prototype = {
  // TO connect workerAnt
  connect: function() {
    var self = this;
    self.socket = new JsonSocket(new net.Socket());

    // Connect WorkerAnt to ant-hill
    self.socket.connect(self.port, self.host, function() {
      logger.info('WorkerAnd try to connect to AntHill on : ' + self.host + ':'  + self.port);
    });

    /// Add a 'connect' event handler for the client socket
    self.socket.on('connect', function() {
      self.state = self.antStates.READY;
      if (self.intervalId && self.state === self.antStates.READY) {
        clearInterval(self.intervalId);
        self.intervalId = null;
      }
      self.talkToQueenAnt({ type: 'CONNECTED', workerAntState: self.state });

      // Add a 'message' event handler for the client socket
      self.socket.on('message', function(message) {
        logger.info('Received message : ' + JSON.stringify(message));
        switch(message.type) {
        case 'CMD':
          switch(message.cmd) {
          case 'START':
            self.startWork();
            break;
          case 'STOP':
            self.stopWork(message.delay);
            break;
          case 'PAUSE':
            self.pauseWork(message.during, message.delay);
            break;
          case 'RESUME':
            self.resumeWork(message.delay);
            break;
          }
          break;
        case 'COMPLETE':
          self.eventEmitter.emit('COMPLETE');
          break;
        }
      });
    });

    // Add a 'error' event handler for the client socket
    self.socket.on('error', function(e) {
      if(e.code === 'ECONNRESET') {
        self.intervalId = setInterval(function() {
          self.connect();
        }, self.timeout);
      }
    });

    // Add a 'close' event handler for the client socket
    self.socket.on('close', function() {
      logger.info('Connection closed');
    });
  },

  // To  create task queue
  createQueue: function(options) {
    this.tasksQueue = kue.createQueue(options);
  },

  // To do task
  doTask: function(task) {
    this.taskType = task.type;
    this.callback = task.callback || function () {};
  },

  // To send message to AntHill
  talkToQueenAnt: function(message) {
    this.socket.sendMessage(message);
    logger.info('Sended message : ' + JSON.stringify(message));
  },

  // To pause proccessing taskQueue
  pauseWork: function(during, delay) {
    var self = this;
    self.state = self.antStates.PAUSED;
    self.talkToQueenAnt({ type: 'MESSAGE', workerAntState: self.state });
    if (self.ctx === null) {
      return logger.warn('WorkerAnt can\'t pause unstarted work');
    }
    logger.info('CMD : [PAUSE]');
    delay = delay || 0;
    setTimeout(function() {
      self.ctx.pause(function(err) {
        if (err) {
          logger.info('Error on pause : ' + err);
        }
        if (during >= 0) {
          logger.info('WorkerAnt paused work for ' + during + 'sec');
          setTimeout(function() {
            self.ctx.resume();
          }, during * 1000);
        }
        else {
          logger.info('WorkerAnt paused work until resume event handled');
        }
      });
    }, delay * 1000);
  },

  // To resume proccessing taskQueue
  resumeWork: function(delay) {
    var self = this;
    if (self.ctx === null) {
      return logger.warn('WorkerAnt can\'t resume unstarted work');
    }
    logger.info('CMD : [RESUME]');
    delay = delay || 0;
    logger.info('WorkerAnt resume work in ' + delay + 'sec');
    setTimeout(function() {
      self.ctx.resume();
      self.state = self.antStates.READY;
    }, delay * 1000);
  },

  // To stop proccessing taskQueue
  stopWork: function(delay) {
    logger.info('CMD : [STOP]');
    this.pauseWork(delay);
    this.socket.destroy();
    logger.info('WorkerAnt stoped work');
  },

  // To start proccessing taskQueue
  startWork: function() {
    var self = this;
    logger.info('CMD : [START]');
    self.tasksQueue.process(self.taskType, function (job, done, ctx) {
      self.ctx = ctx;
      self.currentTask = job;
      self.state = self.antStates.BUSY;
      self.done = done;
      self.talkToQueenAnt({ type: 'MESSAGE', workerAntState: self.state, taskId: job.id });
      self.callback(job, function(err, result) {
        self.state = self.antStates.READY;
        if (err) {
          self.talkToQueenAnt({ type: 'ERROR', workerAntState: self.state, taskId: job.id, error: err });
        } else {
          self.talkToQueenAnt({ type: 'SUCCESS', workerAntState: self.state, taskId: job.id, success: result });
        }
        self.eventEmitter.on('COMPLETE', function() {
          done(err);
        });
      });
    });
  },

  // To get task by id
  getTaskById: function(TaskId) {
    kue.Job.range(TaskId, TaskId, 'asc', function (err, selectedJobs) {
      selectedJobs.forEach(function (job) {
        return job;
      });
    });
  },

  // To set task state
  setTaskState: function(task, toState) {
    task.state(toState).save();
    logger.info('Set job[' + task.id + '] state from: ' + task._state + ' to : ' + toState);
  },

  // To do before shutdown
  doBeforeShutdown: function(callback) {
    this.state = this.antStates.STOPED;
    this.talkToQueenAnt({ type: 'DISCONNECTED', workerAntState: this.state, taskId: this.currentTask.id });
    callback();
    process.exit();
  },

  // To call on server shutdown
  onShutdown: function(callback) {
    var self = this;
    callback = callback || function () {};
    process.on('SIGTERM', function () {
      self.doBeforeShutdown(callback);
    }).on('SIGINT', function() {
      self.doBeforeShutdown(callback);
    }).on('SIGQUIT', function() {
      self.doBeforeShutdown(callback);
    });
  },
};

// export the class
module.exports = WorkerAnt;