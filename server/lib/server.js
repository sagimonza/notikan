
var express = require('express');
var gcm = require('./gcm.js');

var app = express();

app.get('/', function(req, res){
  res.send('hello world');
});

app.get('/notify', function(req, res){
  gcm.notify();
  res.send('notification sent');
});


app.listen(8080);
