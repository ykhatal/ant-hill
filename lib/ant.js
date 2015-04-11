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
    STOPED: 'STOPED',
    CONNECTED: 'CONNECTED'
  };
  this.state = this.antStates.CONNECTED;
  this.socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
  this.ctx = null;
  this.taskType = '';
  this.callback = null;
}

Ant.prototype = {
  // TO connect workerAnt
  connect: function() {
    var self = this;
    // On Ant connection
    self.socket.connect(self.port, self.host, function() {
      console.log('WorkerAnd try to connect to AntHill on : ' + self.host + ':'  + self.port);
    });
    //Don't send until we're connected
    self.socket.on('connect', function() {
      self.sendToAntHill({ type: 'MESSAGE', state: self.state, data: 'Worker ' + self.state });
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
            self.pauseWork(message.during, message.delay);
            break;
          case 'RESUME':
            self.resumeWork(message.delay);
            break;
          case 'GET-STATUS':
            self.sendToAntHill({ type: 'MESSAGE', state: self.state, data: 'Worker ' + self.state });
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

  // Do task
  doTask: function(task) {
    this.taskType = task.type;
    this.callback = task.callback || function () {};
  },

  // To send message to AntHill
  sendToAntHill: function(message) {
    this.socket.sendMessage(message);
    console.log('Sended message : ' + JSON.stringify(message));
  },

  // To pause proccessing taskQueue
  pauseWork: function(during, delay) {
    var self = this;
    if (self.ctx === null) {
      return console.log('WorkerAnt can\'t pause unstarted work');
    }
    console.log('CMD : [PAUSE]');
    delay = delay || 0;
    setTimeout(function() {
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
    }, delay * 1000);
  },

  // To resume proccessing taskQueue
  resumeWork: function(delay) {
    var self = this;
    if (self.ctx === null) {
      return console.log('WorkerAnt can\'t resume unstarted work');
    }
    console.log('CMD : [RESUME]');
    delay = delay || 0;
    console.log('WorkerAnt resume work in ' + delay + 'sec');
    setTimeout(function() {
      self.ctx.resume();
    }, delay * 1000);
  },

  // To stop proccessing taskQueue
  stopWork: function(delay) {
    console.log('CMD : [STOP]');
    console.log('WorkerAnt stoped work');
  },

  // To start proccessing taskQueue
  startWork: function() {
    var self = this;
    tasksQueue.process(self.taskType, function (job, done, ctx) {
      self.ctx = ctx;
      self.state = self.antStates.BUSY;
      self.sendToAntHill({ type: 'MESSAGE', state: self.state, data: 'Worker ' + self.state });
      self.callback(job, function(result) {
        done();
        self.state = self.antStates.READY;
        self.sendToAntHill({ type: 'MESSAGE', state: self.state, data: result, taskId: job.id });
      });
    });
  }
};

// export the class
module.exports = Ant;
