'use strict';

// Required modules
var net = require('net'),
    events = require('events'),
    JsonSocket = require('json-socket'),
    kue = require('kue'),
    colors = require('colors'),
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
  this.eventEmitter.setMaxListeners(0);
}

WorkerAnt.prototype = {
  // TO connect workerAnt
  connect: function() {
    var self = this;
    self.socket = new JsonSocket(new net.Socket());

    // Connect WorkerAnt to ant-hill
    self.socket.connect(self.port, self.host);

    /// Add a 'connect' event handler for the client socket
    self.socket.on('connect', function() {
      logger.info(colors.bold.green('WorkerAnt connected to AntHill on : ' + self.host + ':'  + self.port));
      self.setState(self.antStates.READY);
      if (self.intervalId && self.state === self.antStates.READY) {
        clearInterval(self.intervalId);
        self.intervalId = null;
      }
      self.talkToQueenAnt({ type: 'CONNECTED', workerAntState: self.state });

      // Add a 'message' event handler for the client socket
      self.socket.on('message', function(message) {
        logger.info(colors.bold.cyan('Received message : ') + JSON.stringify(message));
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
      // todo: handle mac os connect reset signal /!\
      if (e.code === 'ECONNRESET') {
        self.intervalId = setInterval(function() {
          self.connect();
        }, self.timeout);
      }
    });

    // Add a 'close' event handler for the client socket
    self.socket.on('close', function() {
      logger.info(colors.red('Connection closed'));
    });

    self.onShutdown();
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
    logger.info(colors.bold.blue('Sended message : ') + JSON.stringify(message));
  },

  // To pause proccessing taskQueue
  pauseWork: function(during, delay) {
    var self = this;
    logger.info(colors.magenta('CMD : [PAUSE]'));
    self.setState(self.antStates.PAUSED);
    self.talkToQueenAnt({ type: 'MESSAGE', workerAntState: self.state });
    if (self.ctx === null) {
      return logger.warn('WorkerAnt can\'t pause unstarted work');
    }
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
    logger.info(colors.magenta('CMD : [RESUME]'));
    delay = delay || 0;
    logger.info('WorkerAnt resume work in ' + delay + 'sec');
    setTimeout(function() {
      self.ctx.resume();
      self.setState(self.antStates.READY);
    }, delay * 1000);
  },

  // To stop proccessing taskQueue
  stopWork: function(delay) {
    logger.info(colors.magenta('CMD : [STOP]'));
    this.pauseWork(delay);
    this.socket.destroy();
    logger.info('WorkerAnt stoped work');
  },

  // To start proccessing taskQueue
  startWork: function() {
    var self = this;
    logger.info(colors.magenta('CMD : [START]'));
    self.tasksQueue.process(self.taskType, 1, function (job, done, ctx) {
      self.ctx = ctx;
      self.currentTask = job;
      logger.info(colors.gray('Doing task ' + job.id));
      self.setState(self.antStates.BUSY);
      self.done = done;
      self.talkToQueenAnt({ type: 'PROCESSING', workerAntState: self.state, taskId: job.id, taskObjId: job.data.taskObjId });
      self.callback(job, function(err, result) {
        self.setState(self.antStates.READY);
        self.pauseWork();
        if (err) {
          self.talkToQueenAnt({ type: 'ERROR', workerAntState: self.state, taskId: job.id, taskObjId: job.data.taskObjId, error: err });
        } else {
          self.talkToQueenAnt({ type: 'SUCCESS', workerAntState: self.state, taskId: job.id, taskObjId: job.data.taskObjId, success: result });
        }
        self.eventEmitter.on('COMPLETE', function() {
          self.currentTask = null;
          done(err);
          self.resumeWork();
        });
      });
    });
  },

  // To get task by id
  getTaskById: function(TaskId) {
    kue.Job.get(TaskId, function (err, job) {
      if (err) {
        return logger.error(colors.bgRed.white(err));
      }
      return job;
    });
  },

  // To set task state
  setTaskState: function(task, toState) {
    task.state(toState).save();
    logger.info('Set job[' + task.id + '] state from: ' + task._state + ' to : ' + toState);
  },

  // To set state
  setState: function(state) {
    this.state = state;
    logger.info(colors.bold.white('Set WorkerAnt state to : ') + this.getStateColor(state));
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

  // To do before shutdown
  doBeforeShutdown: function(callback) {
    this.setState(this.antStates.STOPED);
    var taskId = (this.currentTask) ? this.currentTask.id : null;
    var taskObjId = (this.currentTask) ? this.currentTask.id : null;
    this.talkToQueenAnt({ type: 'DISCONNECTED', workerAntState: this.state, taskId: taskId, taskObjId: taskObjId });
    callback();
    logger.info(colors.bold.red('WorkerAnt disconnected'));
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

};

// export the class
module.exports = WorkerAnt;
