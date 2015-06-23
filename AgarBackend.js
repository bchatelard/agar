/**
 * AgarBackend
 *
 * Connects to a backend agar server and parses messages coming back.
 *
 * Useage:
 *
 * var backend = new AgarBackend();
 * backend.setClient(client);
 * backend.connect();
 *
 * backend.on('board size', ...);
 * backend.on('updates', ...);
 *
 * Events:
 *
 * 'userId' (id)
 *   The user id of the currently playing user.
 *
 * 'updates' (consumptions, entities, destructions)
 *   The most complicated / interesting event.
 *
 *   `consumptions` is an {Array(Object)} where each object has a `consumerId`
 *   and `consumedId`. Note that I am not confident of the "consumer"
 *   interpretation.
 *
 *   `entities` is an {Array(Object)} where each object has:
 *     id {int} Entity identifier.
 *     x {int} Current X position of the entity.
 *     y {int} Current Y position of the entity.
 *     size {int} Radius of the entity.
 *     color {string} Color of entity as a hex string (including '#').
 *     name {string} Name of the entity.
 *     TODO(ibash) document the flags
 *
 *   `destructions` is an {Array(int)} where each item is an id of a entity that
 *   no longer exists.
 *
 * 'boardSize' (x, y)
 *   The size of the game board (in generic units).
 *
 * TODO(ibash) document and add leaderboard and screen position
 */
var _ = require('lodash');
var WebSocket = require('ws');
var events = require('events');
var parser = require('./parser');
var request = require('request');
var util = require('util');

var numSocket = 2;

/**
 * AgarBackend
 *
 * @return {undefined}
 */
function AgarBackend(client) {
  _.bindAll(this);
  events.EventEmitter.call(this);
  this.sockets = [];
}
util.inherits(AgarBackend, events.EventEmitter);
module.exports = AgarBackend;


AgarBackend.prototype.getSocket = function getSocket() {
  var sockets = _.countBy(this.sockets, 'ip')
  var item = _.first(_.sortBy(_.map(sockets, function(v, k) {return {key: k, value: v}}), "value").reverse());
  var match = false;
  if (item && item.value >= numSocket)
    match = true;
  console.log(item);
  if (!match) {
    return;
  }
  var socket = _.first(_.filter(this.sockets, {used: false, ip: item.key}));
  // FIXME Give random socket here, if multiple room
  if (socket) {
    socket.used = true;
    console.log("giving socket ", socket.id);
    socket.socket.on("error", function (){
      console.log("releasing socket ", socket);
      socket.used = false;
    });
    socket.socket.on("closed", function (){
      console.log("releasing socket ", socket);
      socket.used = false;
    });
  }
  return socket;
};


function AgarSocket() {
  _.bindAll(this);
  events.EventEmitter.call(this);
}
util.inherits(AgarSocket, events.EventEmitter);


AgarSocket.prototype.setClient = function (client) {
  var socket = _.find(this.parent.sockets, {id: this.id});
  this.client = client;
  client.on("error", function (){
    console.log("releasing socket ", socket);
    socket.used = false;
  });
  client.on("close", function (){
    console.log("releasing socket ", socket);
    socket.used = false;
  });
}

var socketId = 0;

AgarSocket.prototype.connect = function (ip, code, cb) {
    var url = 'ws://' + ip + '/';
    var self = this;
    var notified = false;
    this.code = code;
    this.socket = new WebSocket(url, {origin: 'http://agar.io'});
    this.id = socketId++;
    this.socket.on('open', this.onSocketOpen);
    this.socket.on('message', function (data) {
      if (!notified) {
        notified = true;
        cb(true);
      }
      self.onSocketMessage(data);
    });
    this.socket.on('close', function (data) {
      if (!notified) {
        notified = true;
        cb(false);
      }
      self.onSocketClose(data);
    });
    this.socket.on('error', function (error) {
      if (!notified) {
        notified = true;
        cb(false);
      }
      console.log("error", error);
    });
}

/**
 * connect
 *
 * Connects to agar.io backend server.
 * TODO Backend server is currently hard coded but can (and should) do a lookup.
 *
 * @return {undefined}
 */
AgarBackend.prototype.connect = function connect() {

  var self = this;
  this.getServerIP(function(error, ip) {
    if (error) {
      throw error;
    }
    var ips = ip.split('\n');
    console.log("connecting to", ips);
    var socket = new AgarSocket()
    socket.parent = self;
    socket.connect(ips[0], ips[1], function (status) {
      function reconnect() {
        setTimeout(function () {
          self.connect();
        }, 7000);
      }
      if (status) {
        console.log("connected");
        // FIXME register on close to remove the socket from this list
        self.sockets.push({socket: socket, id: socket.id, ip: ips[0], used: false});
        console.log(self.sockets);

        var sockets = _.countBy(self.sockets, 'ip');
        console.log(sockets);
        var item = _.first(_.sortBy(_.map(sockets, function(v, k) {return {key: k, value: v}}), "value").reverse());
        var match = false;
        if (item && item.value >= numSocket)
          match = true;
        console.log(item);

        if (!match)
          reconnect();
        else
          console.log("ok got", item);
      }
      else {
        console.log("connection failed");
        reconnect();
      }
    });

  });
};

/**
 * send
 *
 * Send a message to the agar.io server.
 *
 * @param {Buffer} buffer
 * @return {undefined}
 */
AgarBackend.prototype.send = function send(buffer) {
  if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
    // TODO(ibash) should I throw an error?
    return;
  }
  this.socket.send(buffer);
};

/**
 * getServerIP
 *
 * Queries agar.io backend to get the ip of a websocket server.
 *
 * @param {function(error, ip)} callback
 */
AgarBackend.prototype.getServerIP = function getServerIP(callback) {
  request.post({
    url: 'http://m.agar.io',
    // TODO(ibash) this always connects to the US-Fremont region -- can change
    // later
    form: 'EU-London',
  }, function(error, resp, body) {
    if (error) {
      return callback(error);
    }

    callback(null, body);
  });
};

/**
 * onClientMessage
 *
 * @param data
 * @return {undefined}
 */
AgarBackend.prototype.onClientMessage = function onClientMessage(data) {
  console.log("client msg", data);
  if (this.socket && this.socket.readyState === WebSocket.OPEN) {
    this.socket.send(data);
  } else if (!this.socket || this.socket.readyState === WebSocket.CONNECTING) {
    this.initialIncomingBuffer.push(data);
  }
};

/**
 * onClientClose
 *
 * @return {undefined}
 */
AgarBackend.prototype.onClientClose = function onClientClose() {
  if (this.socket) {
    this.socket.close();
  }
};


function K(a) {
  return new DataView(new ArrayBuffer(a));
}

function L(socket, a) {
    socket.send(a.buffer)
}



/**
 * onSocketOpen
 *
 * @return {undefined}
 */
AgarBackend.prototype.onSocketOpen = function onSocketOpen() {
  console.log("server open");

  var a;
  ba = 500;
  a = K(5);
  a.setUint8(0, 254);
  a.setUint32(1, 4, !0);
  L(this.socket, a);
  a = K(5);
  a.setUint8(0, 255);
  a.setUint32(1, 673720361, !0);
  L(this.socket, a);
  a = K(1 + this.code.length);
  a.setUint8(0, 80);
  for (var c = 0; c < this.code.length; ++c)
      a.setUint8(c + 1, this.code.charCodeAt(c));
  L(this.socket, a);
  //Ia()


  while (this.initialIncomingBuffer && this.initialIncomingBuffer.length) {
    this.socket.send(this.initialIncomingBuffer.pop());
  }
};

/**
 * onSocketMessage
 *
 * @param data
 * @return {undefined}
 */
AgarBackend.prototype.onSocketMessage = function onSocketMessage(data) {
  if (this.client && this.client.readyState === WebSocket.OPEN) {
    this.client.send(data);
  }

  var message = parser.parse(data);
  if (message.type === parser.TYPES.USER_ID) {
    this.emit('userId', message.data.id);
  } else if (message.type === parser.TYPES.UPDATES) {
    this.emit('updates', message.data.consumptions, message.data.entities, message.data.destructions);
  } else if (message.type === parser.TYPES.BOARD_SIZE) {
    this.emit('boardSize', message.data.maxX, message.data.maxY);
  } else if (message.type === parser.TYPES.LEADER_BOARD) {
  } else {
    console.log('unknown message');
    console.log(JSON.stringify(message, null, 2));
  }
};

/**
 * onSocketClose
 *
 * @return {undefined}
 */
AgarBackend.prototype.onSocketClose = function onSocketClose() {
  console.log("socket closed");
  if (this.client) {
    this.client.close();
  }
};


/**
 * onSocketOpen
 *
 * @return {undefined}
 */
AgarSocket.prototype.onSocketOpen = function onSocketOpen() {
  console.log("server open");

  var a;
  ba = 500;
  a = K(5);
  a.setUint8(0, 254);
  a.setUint32(1, 4, !0);
  L(this.socket, a);
  a = K(5);
  a.setUint8(0, 255);
  // Why is this changing everyday ? we should also send this during the
  // m.agar.io request
  a.setUint32(1, 154669603, !0);
  L(this.socket, a);
  a = K(1 + this.code.length);
  a.setUint8(0, 80);
  for (var c = 0; c < this.code.length; ++c)
      a.setUint8(c + 1, this.code.charCodeAt(c));
  L(this.socket, a);


  //while (this.initialIncomingBuffer && this.initialIncomingBuffer.length) {
  //  this.socket.send(this.initialIncomingBuffer.pop());
  //}
};

/**
 * onSocketMessage
 *
 * @param data
 * @return {undefined}
 */
AgarSocket.prototype.onSocketMessage = function onSocketMessage(data) {
  if (this.client && this.client.readyState === WebSocket.OPEN) {
    this.client.send(data);
  }
};

/**
 * onSocketClose
 *
 * @return {undefined}
 */
AgarSocket.prototype.onSocketClose = function onSocketClose() {
  console.log("server closed", this.id);
  if (this.client && this.client.readyState === WebSocket.OPEN) {
    this.client.close();
  }
};

AgarSocket.prototype.send = function send(buffer) {
  if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
    // TODO(ibash) should I throw an error?
    return;
  }
  this.socket.send(buffer);
};
