var request = require('request');
var WebSocket = require('ws');

function K(a) {
  return new DataView(new ArrayBuffer(a));
}

var socket;
var code;

function L(socket, a) {
    socket.send(a.buffer)
}

function open() {
  //console.log("socket", socket, code);
  var a;
  ba = 500;
  a = K(5);
  a.setUint8(0, 254);
  a.setUint32(1, 4, !0);
  L(socket, a);
  a = K(5);
  a.setUint8(0, 255);
  a.setUint32(1, 154669603, !0);
  L(socket, a);
  a = K(1 + code.length);
  a.setUint8(0, 80);
  for (var c = 0; c < code.length; ++c)
      a.setUint8(c + 1, code.charCodeAt(c));
  L(socket, a);
}



function connect(array) {
    console.log(array);
    var url = 'ws://' + array[0] + '/';
    code = array[1];
    socket = new WebSocket(url, {origin: 'http://agar.io'});
    socket.on('open', open);
    socket.on('message', function (data) {
      console.log("data", data)
    });
    socket.on('close', function (error) {
      console.log("close", error);
    });
    socket.on('error', function (error) {
      console.log("error", error);
    });

}

//request.post({
  //url: 'http://m.agar.io',
  //// TODO(ibash) this always connects to the US-Fremont region -- can change
  //// later
  //form: 'EU-London',
//}, function(error, resp, body) {
  //connect(body.split("\n"));
//});


var args = process.argv;
console.log("connecting to", args[2], args[3]);
connect([args[2], args[3]]);
