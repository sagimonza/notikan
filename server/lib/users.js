
var uuid			= require('node-uuid');
var speakeasy		= require('speakeasy');

var LoggerFactory	= require('./logger.js');
var config			= require('./config.js');
var DB				= require('./db.js');
var GCM				= require('./gcm.js');
var SMS				= require('./sms.js');

var logger = LoggerFactory.createLogger("users");

var States = {
	UNVERIFIED		: 0,
	PUSH_VERIFIED	: 1,
	CODE_PENDING	: 2,
	SMS_VERIFIED	: 3
};

var MessageTypes = {
	PUSH_VERIFICATION	: "push_verification",
	PUSH_VERIFIED		: "push_verified",
	SMS_VERIFICATION	: "verification_sms",
	INVALID_NUMBER		: "invalid_number",
	INVALID_CODE		: "invalid_code",
	VERIFIED			: "verified",
	MESSAGE				: "message"
};

// todo: validate Users.collection before start serving
// todo: handle cases where regId is being replaced and messages are in the queue for the old id
// todo: add phone number as identifier
// todo: l10n of notification messages and SMS
// todo: handle error from GCM callbacks

var Users = {
	register : function(regId, data) {
		UsersDB.findUser(regId, function(user) {
			if (user) {
				user.onRegister();
			} else if (data.oldRegId) {
				Users.handleOldUserRegister(data.oldRegId, regId, data);
			} else {
				Users.addUserAndRegister(regId);
			}
		});
	},

	handleOldUserRegister : function(oldRegId, regId, data) {
		logger.debug("try to find an old user with oldRegId:" + oldRegId);
		UsersDB.modifyUser(oldRegId, { state : States.SMS_VERIFIED }, { $set : { state : States.UNVERIFIED, _oldId : oldRegId } }, function(user) {
			if (user && user.verifyChallenge(data.token, data.code)) {
				logger.debug("old user is verified - updating regId and sending sms verified");
				user.oldToNew(regId, function(err) {
					if (err) {
						logger.error("failed to update oldRegId:".concat(data.oldRegId, " to regId:", regId));
						return;
					}

					user.sendSMSVerified();
				});

				return;
			}

			logger.debug("old user doesn't exist or unverified, thus need to verify all over again - adding new user");
			Users.addUserAndRegister(regId);
		});
	},

	addUserAndRegister : function(regId) {
		logger.debug("register-->adding user with regId:" + regId);
		UsersDB.addUser(regId, function(user, token) {
			if (user) {
				user.askPushVerify(token);
			} else {
				logger.error("user registration failed - couldn't add user with regId:" + regId);
			}
		});
	},
	
	unregister : function() {

	},

	pushVerify : function(regId, token) {
		logger.debug("push verifying regId:" + regId);
		UsersDB.findUser(regId, function(user) {
			if (!user) {
				logger.debug("push verification failed - couldn't find user");
				return;
			}

			user.onPushVerify(token);
		});
	},

	smsVerify : function(regId, phoneNumber) {
		UsersDB.findUser(regId, function(user) {
			if (!user) {
				logger.debug("sms verification failed - couldn't find user");
				return;
			}

			user.onSmsVerify(phoneNumber);
		})
	},

	codeVerify : function(regId, phoneNumber, code) {
		UsersDB.findUser(regId, function(user) {
			if (!user) {
				logger.debug("sms verification failed - couldn't find user");
				return;
			}

			user.onCodeVerify(phoneNumber, code);
		});
	},

	echo : function(regId, title, msg) {
		UsersDB.findUser(regId, function(user) {
			if (!user) {
				logger.debug("echo failed - couldn't find user");
				return;
			}

			user.onEcho(title, msg);
		});
	},

	notify : function(regId) {

	},

	healthCheck : function() {
		// try to silently push to the user once a day - if doesn't answer for 365 days, auto unregister
	}
};

function User(user) {
	this._user = user;
}

User.prototype = {
	onRegistrationStep : function(step, unverifiedCallback, pushVerifiedCallback, codePendingCallback, smsVerifiedCallback, params) {
		logger.debug("on '".concat(step, "' for user:", this.toString()));
		switch (this._user.state) {
			case States.UNVERIFIED :
				if (unverifiedCallback) unverifiedCallback.apply(this, params);
				else logger.debug("user registration state is unverified - he must reset to re initiate the registration");
				break;
			case States.PUSH_VERIFIED :
				if (pushVerifiedCallback) pushVerifiedCallback.apply(this, params);
				else logger.debug("user registration state is pushed unverified - he must reset to re initiate the registration");
				break;
			case States.CODE_PENDING :
				if (codePendingCallback) codePendingCallback.apply(this, params);
				else logger.debug("user registration state is code pending - he must reset to re initiate the registration");
				break;
			case States.SMS_VERIFIED :
				if (smsVerifiedCallback) smsVerifiedCallback.apply(this, params);
				else {
					logger.debug("user registration is already sms verified - send sms verified");
					this.sendSMSVerified();
				}
		}
	},

	onRegister : function() {
		this.onRegistrationStep("register");
	},

	askPushVerify : function(token) {
		logger.debug("asking to push verify user:" + this.toString());
		GCM.notify([this._user.regId],
			{	"message"			: "To start verifying this device please tap here",
				"title"				: "Verification Step One",
				"msgType"			: MessageTypes.PUSH_VERIFICATION,
				"regId"				: this._user.regId,
				"verificationToken"	: token
			}, { "collapseKey"		: "Pending Verification" });
	},

	onPushVerify : function(token) {
		this.onRegistrationStep("push verify", this.verifyToken, null, null, null, [token]);
	},

	verifyToken : function(token) {
		if (this._user.verification_token != token) {
			logger.debug("push verification failed - token mismatch");
			return;
		}

		var $this = this;
		UsersDB.updateUser(this._user.regId, { $set : { state : States.PUSH_VERIFIED, last_response_ts : new Date() } }, function(user) {
			if (user) {
				user.sendPushVerified();
			} else {
				// todo: send user 'reset' request?
				logger.error("push verification failed, couldn't mark as push verified:" + $this.toString());
			}
		});
	},

	sendPushVerified : function() {
		GCM.notify([this._user.regId],
			{	"message"			: "To continue verifying this device, please tap here",
				"title"				: "Verification Step One Succeeded",
				"msgType"			: MessageTypes.PUSH_VERIFIED,
				"regId"				: this._user.regId
			}, { "collapseKey"		: "Verification Success" });
	},

	onSmsVerify : function(phoneNumber) {
		this.onRegistrationStep("sms verify", null, this.askSMSVerify, null, null, [phoneNumber]);
	},

	askSMSVerify : function(phoneNumber) {
		logger.debug("asking to sms verify user:" + this.toString());

		if (this._user.verification_code) {
			logger.debug("sms verification failed - user already has verification code");
			UsersDB.updateUser(user.regId, { $unset : { verification_code : "" } });
			return;
		}

		var $this = this;
		var code = speakeasy.totp({ key : this._user.verification_token, step : config.users.codeStep });
		UsersDB.updateUser(this._user.regId, { $set : { verification_code : code, state : States.CODE_PENDING } }, function(user) {
			if (!user) {
				logger.debug("sms verification failed - update user failed:" + $this.toString());
				return;
			}

			SMS.send(phoneNumber,
				"Your verification code is:".concat(code, ".\nIn order to verify your device, please enter it to the 'Verification Code' input field and submit."),
				function(smsFailed) {
					if (!smsFailed) {
						logger.debug("SMS was sent successfully to:" + phoneNumber + " for user:" + user.toString());
						return;
					}

					logger.debug("failed to send SMS to:" + phoneNumber + " for user:" + user.toString());
					UsersDB.updateUser(user.regId, { $set : { state : States.PUSH_VERIFIED } }, function(user) {
						if (!user) {
							logger.debug("failed to notify user on phone number error:" + user.toString());
							return;
						}

						user.sendPhoneNumberError(phoneNumber);
					});
				});
		});
	},

	sendPhoneNumberError : function(phoneNumber) {
		GCM.notify([this._user.regId],
			{	"message"			: "You've entered an invalid phone number '".concat(phoneNumber, "'. Tap here to re enter your phone number"),
				"title"				: "Verification Failed - Invalid Phone Number",
				"msgType"			: MessageTypes.INVALID_NUMBER,
				"regId"				: this._user.regId
			}, { "collapseKey"		: "Verification Failed" });
	},

	onCodeVerify : function(phoneNumber, code) {
		this.onRegistrationStep("sms verify", null, null, this.verifyCode, null, [phoneNumber, code]);
	},

	verifyCode : function(phoneNumber, code) {
		if (this._user.verification_code != code) {
			logger.debug("sms verification failed - code mismatch");
			this.sendCodeError(code);
			return;
		}

		var $this = this;
		UsersDB.updateUser(this._user.regId, { $set : { state : States.SMS_VERIFIED, phone_number : phoneNumber, last_response_ts : new Date() } }, function(user) {
			if (user) {
				user.sendSMSVerified();
			} else {
				// todo: send user 'reset' request?
				logger.error("sms verification failed, couldn't mark as sms verified:" + $this.toString());
			}
		});
	},

	sendSMSVerified : function() {
		GCM.notify([this._user.regId],
			{	"message"			: "You're device is verified, all relevant contact will appear within the app in seconds",
				"title"				: "Verification Succeeded",
				"msgType"			: MessageTypes.VERIFIED,
				"regId"				: this._user.regId
			}, { "collapseKey"		: "Verification Success" });
	},

	sendCodeError : function(code) {
		GCM.notify([this._user.regId],
			{	"message"			: "You've entered an invalid verification code '".concat(code, "'. Tap here to re enter the code"),
				"title"				: "Verification Failed - Invalid Code",
				"msgType"			: MessageTypes.INVALID_CODE,
				"regId"				: this._user.regId
			}, { "collapseKey"		: "Verification Failed" });
	},

	echo : function(title, msg) {
		GCM.notify([this._user.regId],
			{	"message"			: msg,
				"title"				: "ECHO: " + title,
				"msgType"			: MessageTypes.MESSAGE,
				"regId"				: this._user.regId
			}, { "collapseKey"		: "Echo Message" });
	},

	verifyChallenge : function(token, code) {
		return this._user.verification_token == token && this._user.verification_code == code;
	},

	oldToNew : function(regId, callback) {
		var $this = this;
		UsersDB.updateUser(this._user.oldRegId, { $set : { _id : regId } }, function(err, result) {
			if (!err && result)
				$this._user = result.ops[0];
			callback(err);
		});
	},

	toString : function() {
		return this._user.regId;
	},

	_user : null
};

var UsersDB = {
	findUser : function(regId, callback) {
		this.collection.findOne({ type : "user", _id : regId }, function(err, user) {
			callback(user && new User(user));
		});
	},

	addUser : function(regId, callback) {
		var token = uuid.v4();
		// todo: check unique token
		this.collection.insertOne(
			{	_id 				: regId,
				type				: "user",
				state				: States.UNVERIFIED,
				verification_token	: token,
				last_response_ts	: new Date()
			},
			{ w : 1 },
			function(err, result) {
				callback(!err && result && new User(result.ops[0]), token); });
	},

	modifyUser : function(regId, constraints, data, callback) {
		var queryObj = { _oldId : regId };
		if (constraints) queryObj = { $and : [queryObj, constraints] };
		this.collection.findAndModify(queryObj, undefined, data, { "new" : true }, function(err, object) {
			callback(object && new User(object)); });
	},

	updateUser : function(regId, data, callback) {
		this.collection.updateOne({ _id : regId }, data, { w : 1 } , function(err, result) {
			if (err || !result) callback();
			callback(!err && result && new User(result.ops[0]));
		});
	},

	collection : null
};

DB.getDB("api", "users", function(db) {
	UsersDB.collection = db && db.collection("api"); });


module.exports = Users;
