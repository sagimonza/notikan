
var twilio			= require('twilio');
var LoggerFactory	= require('./logger.js');
var config			= require('./config.js');

var twilClient = twilio(config.twilio.accountSid, config.twilio.authToken);

var logger = LoggerFactory.createLogger("SMS");

var SMS = {
	send	: function(to, msg, callback) {
		// todo: verify valid phoneNumber format...
		if (config.twilio.allowedNumbers.indexOf(to) == -1) {
			logger.debug("number '".concat(to, "' is not authorized to SMS messaging"));
			process.nextTick(function() { callback(true); });

			return;
		}

		twilClient.sendSms({ to : to, from  : config.twilio.number, body : msg }, function (err, data) {
			if (err) logger.debug("failed to send sms to '".concat(to, " - error:", err));
			callback(!!err); });
	}
};

module.exports = SMS;
