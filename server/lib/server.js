
var https			= require('https');
var socketio		= require('socket.io');
var express			= require('express');
var bodyParser		= require('body-parser');

var fs				= require('fs');
var LoggerFactory	= require('./logger.js');
var config			= require('./config.js');
var users			= require('./users.js');

var logger = LoggerFactory.createLogger("server");
var app = express();

app.use(bodyParser.json());

app.get('/', function(req, res){
	res.send('hello world');
});

app.post('/echo', function(req, res){
	logger.debug("echo get call, body:" + req.body);

	var regId = req.body && req.body.regId, title = req.body && req.body.title, msg = req.body && req.body.message;
	res.send("echo notification sent");

	users.echo(regId, title, msg);
});

app.post('/register', function(req, res) {
	logger.debug("register post call, body:" + req.body);

	var regId = req.body && req.body.regId, oldRegId = req.body && req.body.oldRegId;
	if (!regId) {
		logger.error("registration failed - couldn't get registration id");
		res.send("registration failed");
		return;
	}

	res.send("registration started");

	logger.debug("BEFORE trying to register user with regId=" + regId);
	users.register(regId, oldRegId);
	logger.debug("AFTER trying to register user with regId=" + regId);
});

app.post('/verify', function(req, res) {
	logger.debug("verify post call, body:" + req.body);

	var regId = req.body && req.body.regId, token = req.body && req.body.token;
	if (!regId || !token) {
		logger.error("verification failed - regId: ".concat(regId, " token: ", token));
		res.send("verification failed");
		return;
	}

	res.send('verification started');

	logger.debug("BEFORE trying to verify user with regId=" + regId);
	users.verify(regId, token);
	logger.debug("AFTER trying to verify user with regId=" + regId);
});

// todo: sign real certificates, meanwhile: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days XXX
var options = {
	key: fs.readFileSync(config.server.certKeyPath),
	cert: fs.readFileSync(config.server.certPath)
};

var server = https.createServer(options, app);
var io = socketio(server);
io.on('connection', function(socket){
	socket.on('event', function(data){});
	socket.on('disconnect', function(){});
});
server.listen(8443);
