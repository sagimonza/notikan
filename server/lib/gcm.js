
var gcm = require('node-gcm');

var DEFAULT_ALL = -1;
var DEFAULT_SOUND = 1;
var DEFAULT_VIBRATE = 2;
var DEFAULT_LIGHTS = 4;

var gcmAPI = {
	notify : function() {
		console.log("GCM API notify message");
		// create a message with object values
		var message = new gcm.Message({
			collapseKey: 'demo',
			delayWhileIdle: true,
			timeToLive: 100,
			data: {
				"title": "Notikan Title",
				"message": "Notikan Message",
				"key1": "message1",
				"key2": "message2"
			}
		});

		var sender = new gcm.Sender('AIzaSyAbLbv70QRjyPCulbFFB61SrBdeB9lHFUE');
		var registrationIds = [];

		// OPTIONAL
		// add new key-value in data object
		//message.addDataWithKeyValue('key3','message3');
		//message.addDataWithKeyValue('key4','message4');

		// or add a data object
		//message.addDataWithObject({
		//	key5: 'message5',
		//	key6: 'message6'
		//});

		// At least one required
		registrationIds.push('APA91bH-QOCPUx84i9MpCXENZSU1YFwrvn5Ry9S4OTRJ6HopdNDoHHOEIYUVK9c2-bqjMvD2EZ5iELBxZ3jQnHJjkbfMoKByLJfPpom1a9Z92_W0tNl1JkRQM5-CuSkRWQ4uPsOEPlBwVLBzSBq_YrEkPGGnJLSxOUpoues1wOeWO3XuenuI5bE');

		/**
		 * Params: message-literal, registrationIds-array, No. of retries, callback-function
		 **/
		sender.send(message, registrationIds, 4, function (err, result) {
			console.log(result);
		});
	}
};

module.exports = gcmAPI;
