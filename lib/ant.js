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
    PAUSED: 'PAUSED'
  };
  this.state = this.antStates.READY;
  this.socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
}

Ant.prototype = {
  connect: function() {
    var self = this;

    // On Ant connection
    self.socket.connect(self.port, self.host, function() {
      self.socket.sendMessage({ type: 'MESSAGE', state: "READY", data: "Worker READY." });
    });

    // Called when data received
    self.socket.on('message', function(message) {
      var messageObj = JSON.parse(message);
      switch(messageObj.type) {
        case 'CMD':
          switch(messageObj.cmd) {
            case 'START':
            break;
            case 'STOP':
            break;
            case 'PAUSE':
            break;
            case 'RESUME':
            break;
          }
        break;
      }
    });

    // Add a 'close' event handler for the client socket
    self.socket.on('close', function() {
        console.log('Connection closed');
    });
  },
  processQueue: function(task) {
    var self = this;
    tasksQueue.process(task.type, function(job, done, ctx) {
      self.socket.sendMessage({ type: 'MESSAGE',state: "BUSY", data: "Worker BUSY." });
      self.socket.sendMessage({ taskId: job.id, state: "COMPLETE", data: task.doTask(job) });
      done && done();
    });
  }

};

// export the class
module.exports = Ant;
