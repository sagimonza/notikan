
var https = require('https');
var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var LoggerFactory = require('./logger.js');
var Users = require('./users.js');

var logger = LoggerFactory.createLogger("server");
var app = express();

app.use(bodyParser.json());

app.get('/', function(req, res){
	res.send('hello world');
});

app.post('/echo', function(req, res){
	logger.debug("echo get call, body:" + req.body);
	try { var bodyJSON = JSON.parse(req.body), regId = bodyJSON.regId, title = bodyJSON.title, msg = bodyJSON.message;
	} catch(ex) { logger.error("exception:" + ex); }

	Users.echo(regId, title, msg);
	res.send("echo notification sent");
});

app.post('/register', function(req, res) {
	logger.debug("register post call, body:" + req.body);
	try { var regId = JSON.parse(req.body).regId;
	} catch(ex) { logger.error("exception:" + ex); }
	
	if (!regId) {
		logger.error("registration failed - couldn't get registration id");
		res.send("registration failed");
		return;
	}

	res.send("registration started");

	logger.debug("BEFORE trying to register user with regId=" + regId);
	Users.register(regId);
	logger.debug("AFTER trying to register user with regId=" + regId);
});

app.post('/verify', function(req, res) {
	logger.debug("verify post call, body:" + req.body);
	try { var bodyJSON = JSON.parse(req.body), regId = bodyJSON.regId, token = bodyJSON.token;
	} catch(ex) { logger.error("exception:" + ex); }
	
	if (!regId || token) {
		logger.error("verification failed - couldn't get registration id");
		res.send("verification failed");
		return;
	}

	res.send('verification started');

	logger.debug("BEFORE trying to verify user with regId=" + regId);
	Users.verify(regId, token);
	logger.debug("AFTER trying to verify user with regId=" + regId);
});

var options = {
	key: fs.readFileSync('./keys/key.pem'),
	cert: fs.readFileSync('./keys/cert.pem')
};

https.createServer(options, app).listen(8443);
