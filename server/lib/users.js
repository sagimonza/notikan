
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
	register : function(regId) {
		if (!Users.collection) {
			logger.error("user registration failed - no user collection");
			return;
		}
		
		Users.findUser(regId, function(user) {
			if (user) {
				if (user.state != States.UVERIFIED) {
					logger.debug("user already appears as registered - send verified");
					Users.sendVerified(regId);
					return;
				} else {
					logger.debug("user registration is still unverified - ask again to verify");
					return Users.askVerify(regId);
				}
			} else {
				Users.addUser(regId, function(result, token) {
					if (result) {
						Users.askVerify(regId,token);
					} else {
						logger.error("user registration failed - couldn't add user with regId:" + regId);
					}
				});
			}
		});
	},
	
	unregister : function() {
	},
	
	findUser : function(regId, callback) {
		Users.collection.findOne({ type : "user", _id : regId }, callback);
	},
	
	addUser : function(regId, callback) {
		var token = uuid.v4();
		// todo: check unique token
		apiCollection.insert({	_id 				: regId,
								type				: "user",
								state				: States.UNVERIFIED,
								verification_token	: token,
								last_response_ts	: new Date()
							},
							{ w : 1 },
							function(err, result) {
								callback(!err && result, token); });
	},
	
	askVerify : function(regId, token) {
		logger.debug("asking to verify regId:" + regId);
		GCM.notify([regId],
			{	"message"			: "To verify this device please tap here",
				"title"				: "Tap to verify",
				"msgType"			: MessageTypes.VERIFICATION,
				"verificationToken": token
			}, { "collapseKey" : "Pending Verification" });
	},
	
	verify : function(regId, token) {
		logger.debug("verifying regId:" + regId);
		Users.findUser(regId, function(user) {
			if (!user) {
				logger.error("verification failed - couldn't find user");
				return;
			}
			
			if (user.token != token) {
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
		Users.update({ _id : regId, verificationToken : undefined }, { $set : { state : States.VERIFIED, last_response_ts : new Date() } }, { w : 1 } , callback);
	},

	sendVerified : function(regId) {
		GCM.notify([regId],
			{	"message"			: "Device was verified successfully",
				"title"				: "Verification Succeeded",
				"msgType"			: MessageTypes.VERIFIED,
				"regId"				: regId
			}, { "collapseKey" : "Verification Success" });
	},
	
	notify : function(regId) {
		
	},
	
	healthCheck : function() {
		// try to silently push to the user once a day - if doesn't answer for 365 days, auto unregister
	},
	
	collection : null
};

DB.getDB("api", "users", function(db) {
	Users.collection = db && db.collection("api"); });

module.exports = Users;
