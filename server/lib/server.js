
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

function apiCall(req, res, methodName) {
	logger.debug(methodName.concat(" call for:" + (req.body && req.body.regId)));

	var err = users[methodName](req.body);
	if (!err) {
		res.send(methodName + " started");
	} else {
		logger.error(methodName.concat(" failed - ", err));
		res.send(methodName + " failed");
	}
}
// todo: avoid writing regId to log in all files

app.get('/', function(req, res){
	res.send('hello world');
});

app.post('/register', function(req, res) {
	apiCall(req, res, "register");
});

app.post('/pushVerify', function(req, res) {
	apiCall(req, res, "pushVerify");
});

app.post('/smsVerify', function(req, res) {
	apiCall(req, res, "smsVerify");
});

app.post('/codeVerify', function(req, res) {
	apiCall(req, res, "codeVerify");
});

app.post('/unregister', function(req, res) {
	apiCall(req, res, "unregister");
});

app.post('/echo', function(req, res){
	apiCall(req, res, "echo");
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
