
var LoggerFactory = require('./logger.js')
var uuid = require('node-uuid');
var DB = require('./db.js');
var GCM = require('./gcm.js');

var logger = LoggerFactory.createLogger("users");

var States = {
	UNVERIFIED	: 0,
	VERIFIED	: 1
};

var MessageTypes = {
	VERIFICATION	: "verification",
	VERIFIED		: "verified",
	MESSAGE			: "message"
};

var PACKAGE_NAME = "com.ionicframework.notikan721974";

// todo: handle cases where regId is being replaced and messages are in the queue for the old id
// todo: add phone number as identifier

var Users = {
	register : function(regId, oldRegId) {
		function addUser(regId) {
			logger.debug("register-->adding user with regId:" + regId);
			Users.addUser(regId, function(result, token) {
				if (result) {
					logger.debug("register-->asking to verify user with regId:" + regId);
					Users.askVerify(regId, token);
				} else {
					logger.error("user registration failed - couldn't add user with regId:" + regId);
				}
			});
		}

		if (!Users.collection) {
			logger.error("user registration failed - no user collection");
			return;
		}
		
		Users.findUser(regId, function(err, user) {
			if (user) {
				if (user.state != States.UNVERIFIED) {
					logger.debug("user already appears as registered - send verified");
					Users.sendVerified(regId);
					return;
				} else {
					logger.debug("user registration is still unverified - ask again to verify");
					return Users.askVerify(regId, user.verification_token);
				}
			} else if (oldRegId) {
				logger.debug("try to find an old user with oldRegId:" + oldRegId);
				Users.modifyUser(oldRegId, { _id : regId, state : States.UNVERIFIED, _oldId : oldRegId }, function(oldUser) {
					logger.debug("old user:" + oldUser);
					if (oldUser) Users.askVerify(regId, oldUser.verification_token);
					else addUser(regId);
				});
			} else {
				addUser(regId);
			}
		});
	},
	
	unregister : function() {

	},

	askVerify : function(regId, token) {
		logger.debug("asking to verify regId:" + regId);
		GCM.notify([regId],
			{	"message"			: "To verify this device please tap here",
				"title"				: "Tap to verify",
				"msgType"			: MessageTypes.VERIFICATION,
				"regId"				: regId,
				"verificationToken"	: token
			}, { "collapseKey" : "Pending Verification" });
	},

	verify : function(regId, token) {
		logger.debug("verifying regId:" + regId);
		Users.findUser(regId, function(err, user) {
			if (!user) {
				logger.error("verification failed - couldn't find user");
				return;
			}

			if (user.verification_token != token) {
				logger.error("verification failed - token mismatch");
				return;
			}

			Users.markVerified(regId, function(err, result) {
				if (!err) {
					Users.sendVerified(regId);
				} else {
					logger.error("verification failed:" + err);
				}
			});
		});
	},

	markVerified : function(regId, callback) {
		Users.updateUser(regId, { $set : { state : States.VERIFIED, last_response_ts : new Date() } }, callback);
	},

	sendVerified : function(regId) {
		GCM.notify([regId],
			{	"message"			: "Device was verified successfully",
				"title"				: "Verification Succeeded",
				"msgType"			: MessageTypes.VERIFIED,
				"regId"				: regId
			}, { "collapseKey" : "Verification Success" });
	},

	echo : function(regId, title, msg) {
		GCM.notify([regId],
			{	"message"			: msg,
				"title"				: "ECHO: " + title,
				"msgType"			: MessageTypes.MESSAGE,
				"regId"				: regId
			}, { "collapseKey" : "Echo Message" });
	},

	notify : function(regId) {

	},

	healthCheck : function() {
		// try to silently push to the user once a day - if doesn't answer for 365 days, auto unregister
	},

	findUser : function(regId, callback) {
		Users.collection.findOne({ type : "user", _id : regId }, callback);
	},
	
	addUser : function(regId, callback) {
		var token = uuid.v4();
		// todo: check unique token
		Users.collection.insert({	_id 				: regId,
									type				: "user",
									state				: States.UNVERIFIED,
									verification_token	: token,
									last_response_ts	: new Date()
								},
								{ w : 1 },
								function(err, result) {
									callback(!err && result, token); });
	},

	modifyUser : function(regId, data, callback) {
		Users.collection.findAndModify({ $or : [{ _id : regId }, { _oldId : regId }] }, undefined, { $set : data }, {}, function(err, object) {
			callback(object); });
	},

	updateUser : function(regId, data, callback) {
		Users.collection.updateUser({ _id : regId }, data, { w : 1 } , callback);
	},

	collection : null
};

DB.getDB("api", "users", function(db) {
	Users.collection = db && db.collection("api"); });

module.exports = Users;
