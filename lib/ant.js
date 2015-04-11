'use strict';

// Required modules
var net = require('net'),
    JsonSocket = require('json-socket'),
    kue = require('kue'),
    tasksQueue = kue.createQueue();

// Constructor
function Ant(host, port) {
  this.host = host;
  this.port = port;
  this.antStates = {
    ERROR: 'ERROR',
    READY: 'READY',
    BUSY: 'BUSY',
    PAUSED: 'PAUSED',
    STOPED: 'STOPED'
  };
  this.state = this.antStates.READY;
  this.socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
  this.ctx = null;
  this.taskType = '';
  this.callback = null;
}

Ant.prototype = {
  connect: function() {
    var self = this;
    // On Ant connection
    self.socket.connect(self.port, self.host, function() {
    });
    //Don't send until we're connected
    self.socket.on('connect', function() {
      self.sendToAntHill({ type: 'MESSAGE', state: 'READY', data: 'Worker READY.' });
      // Called when data received
      self.socket.on('message', function(message) {
        console.log('Received message : ' + JSON.stringify(message));
        switch(message.type) {
        case 'CMD':
          switch(message.cmd) {
          case 'START':
            self.startWork();
            break;
          case 'STOP':
            self.stopWork();
            break;
          case 'PAUSE':
            self.pauseWork(message.during);
            break;
          case 'RESUME':
            self.resumeWork(message.delay);
            break;
          }
          break;
        }
      });
    });
    // Add a 'close' event handler for the client socket
    self.socket.on('close', function() {
      console.log('Connection closed');
    });
  },
  doTask: function(task) {
    this.taskType = task.type;
    this.callback = task.callback || function () {};
  },
  sendToAntHill: function(message) {
    this.socket.sendMessage(message);
    console.log('Sended message : ' + JSON.stringify(message));
  },
  pauseWork: function(during) {
    var self = this;
    console.log('CMD : [PAUSE]');
    self.ctx.pause(function(err) {
      if (err) {
        console.log('Error on pause : ' + err);
      }
      if (during >= 0) {
        console.log('WorkerAnt paused work for ' + during + 'sec');
        setTimeout(function() {
          self.ctx.resume();
        }, during * 1000);
      }
      else {
        console.log('WorkerAnt paused work until resume event handled');
      }
    });
  },
  resumeWork: function(delay) {
    var self = this;
    console.log('CMD : [RESUME]');
    delay = delay || 0;
    console.log('WorkerAnt resume work in ' + delay + 'sec');
    setTimeout(function() {
      self.ctx.resume();
    }, delay * 1000);
  },
  stopWork: function(delay) {
    console.log('CMD : [STOP]');
    console.log('WorkerAnt stoped work');
  },
  startWork: function() {
    var self = this;
    tasksQueue.process(self.taskType, function (job, done, ctx) {
      self.ctx = ctx;
      self.sendToAntHill({ type: 'MESSAGE',state: 'BUSY', data: 'Worker BUSY.' });
      self.sendToAntHill({ taskId: job.id, state: 'COMPLETE', data: self.callback(job) });
      done && done();
    });
  }
};

// export the class
module.exports = Ant;
