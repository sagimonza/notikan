
var gcm				= require('node-gcm');
var LoggerFactory	= require('./logger.js');
var config			= require('./config.js');

var logger = LoggerFactory.createLogger("gcm");

var DEFAULT_ALL = -1;
var DEFAULT_SOUND = 1;
var DEFAULT_VIBRATE = 2;
var DEFAULT_LIGHTS = 4;

var gcmAPI = {
	notify : function(regIds, payload, options, callback) {
		logger.debug("notify message");
		// create a message with object values
		options.data = payload;
		var message = new gcm.Message(options);
		var sender = new gcm.Sender(config.gcm.senderId);
		var registrationIds = regIds;

		// OPTIONAL
		// add new key-value in data object
		//message.addDataWithKeyValue('key3','message3');
		//message.addDataWithKeyValue('key4','message4');

		// or add a data object
		//message.addDataWithObject({
		//	key5: 'message5',
		//	key6: 'message6'
		//});

		/**
		 * Params: message-literal, registrationIds-array, No. of retries, callback-function
		 **/
		logger.debug("sending notification message:" + message);
		sender.send(message, registrationIds, 4, function (err, result) {
			if (err)	logger.debug("notification wasn't sent, err:" + err);
			else		logger.debug("notification sent result:" + result);

			callback && callback(!!err); });
	}
};

module.exports = gcmAPI;
