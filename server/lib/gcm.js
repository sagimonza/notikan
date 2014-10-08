
var gcm		= require('node-gcm');
var config	= require('./config.js');

var DEFAULT_ALL = -1;
var DEFAULT_SOUND = 1;
var DEFAULT_VIBRATE = 2;
var DEFAULT_LIGHTS = 4;

var gcmAPI = {
	notify : function(regIds, payload, options) {
		console.log("GCM API notify message");
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
		sender.send(message, registrationIds, 4, function (err, result) {
			console.log(result);
		});
	}
};

module.exports = gcmAPI;
