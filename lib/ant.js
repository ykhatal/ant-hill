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
  this.ctx = null;
}

Ant.prototype = {
  connect: function() {
    var self = this;

    // On Ant connection
    self.socket.connect(self.port, self.host, function() {
    });

    //Don't send until we're connected
    self.socket.on('connect', function() {
      self.sendToAntHill({ type: 'MESSAGE', state: "READY", data: "Worker READY." });
      // Called when data received
      self.socket.on('message', function(message) {
        console.log('Received message : ' + JSON.stringify(message));
        switch(message.type) {
          case 'CMD':
            switch(message.cmd) {
              case 'START':
                console.log('CMD : [START]');
              break;
              case 'STOP':
                console.log('CMD : [STOP]');
              break;
              case 'PAUSE':
                // self.pauseWork(message.during * 1000);
              break;
              case 'RESUME':
                console.log('CMD : [RESUME]');
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
  processQueue: function(task) {
    var self = this;
    tasksQueue.process(task.type, function(job, done, ctx) {
      self.ctx = ctx;
      self.sendToAntHill({ type: 'MESSAGE',state: "BUSY", data: "Worker BUSY." });
      self.sendToAntHill({ taskId: job.id, state: "COMPLETE", data: task.doTask(job) });
      done && done();
    });
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
      if (during > 0) {
        console.log('WorkerAnt is paused for ' + during);
        setTimeout(function() {
          self.onResume();
        }, during * 1000);
      } else {
        console.log('WorkerAnt is paused until resume event handled');
      }
    });
  }

};

// export the class
module.exports = Ant;
