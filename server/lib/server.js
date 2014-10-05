
var Express = require('express');
var LoggerFactory = require('./logger.js')
var Users = require('./users.js');

var logger = LoggerFactory.createLogger("server");
var app = Express();

app.get('/', function(req, res){
	res.send('hello world');
});

app.get('/echo', function(req, res){
	try { var bodyJSON = JSON.parse(req.body), regId = bodyJSON.regId, title = bodyJSON.title, msg = bodyJSON.message;
	} catch(ex) { logger.error("exception:" + ex); }

	Users.echo(regId, title, msg);
	res.send("echo notification sent");
});

app.post('/register', function(req, res) {
	try { var regId = JSON.parse(req.body).regId;
	} catch(ex) { logger.error("exception:" + ex); }
	
	if (!regId) {
		logger.error("registration failed - couldn't get registration id");
		res.send("registration failed");
		return;
	}
	
	Users.register(regId);
	res.send("registration started");
});

app.post('/verify', function(req, res) {
	try { var bodyJSON = JSON.parse(req.body), regId = bodyJSON.regId, token = bodyJSON.token;
	} catch(ex) { logger.error("exception:" + ex); }
	
	if (!regId || token) {
		logger.error("verification failed - couldn't get registration id");
		res.send("verification failed");
		return;
	}

	Users.verify(regId, token);
	res.send('verification started');
});


app.listen(8080);
