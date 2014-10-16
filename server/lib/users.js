
var uuid			= require('node-uuid');
var speakeasy		= require('speakeasy');

var LoggerFactory	= require('./logger.js');
var config			= require('./config.js');
var DB				= require('./db.js');
var GCM				= require('./gcm.js');
var SMS				= require('./sms.js');

var logger = LoggerFactory.createLogger("users");

var States = {
	INVALID			: -1,
	UNVERIFIED		: 0,
	PUSH_VERIFIED	: 1,
	CODE_PENDING	: 2,
	SMS_VERIFIED	: 3
};

var MessageTypes = {
	PUSH_VERIFICATION	: "push_verification",
	PUSH_VERIFIED		: "push_verified",
	INVALID_NUMBER		: "invalid_number",
	USED_NUMBER			: "used_number",
	INVALID_CODE		: "invalid_code",
	VERIFIED			: "verified",
	MESSAGE				: "message"
};

// todo: validate Users.collection before start serving
// todo: handle cases where regId is being replaced and messages are in the queue for the old id
// todo: add phone number as identifier
// todo: l10n of notification messages and SMS
// todo: handle error from GCM callbacks
// todo: allow reset registration state
// todo: use sms_verify_tries to block user for X minutes after too many invalid number attempts


var Users = {
	register : function(data) {
		var paramsError = Users._verifyParams(data);
		if (paramsError) return "invalid params:" + paramsError;

		UsersDB.findUser(data.regId, function(user) {
			if (user) {
				if (data.forceReset)
					user.resetRegistration();
				else
					logger.debug("ignoring register request for existing user without 'forceReset' flag");
			} else if (data && data.oldRegId) {
				Users._handleOldUserRegister(data.oldRegId, data.regId, data);
			} else {
				Users.addUserAndRegister(data.regId);
			}
		});
	},

	pushVerify : function(data) {
		var paramsError = Users._verifyParams(data, ["token"]);
		if (paramsError) return "invalid params:" + paramsError;

		UsersDB.findUser(data.regId, function(user) {
			if (!user) {
				logger.debug("push verification failed - couldn't find user");
				return;
			}

			user.onPushVerify(data);
		});
	},

	smsVerify : function(data) {
		var paramsError = Users._verifyParams(data, ["phoneNumber"]);
		if (paramsError) return "invalid params:" + paramsError;

		UsersDB.findUser(data.regId, function(user) {
			if (!user) {
				logger.debug("sms verification failed - couldn't find user");
				return;
			}

			user.onSmsVerify(data);
		});
	},

	codeVerify : function(data) {
		var paramsError = Users._verifyParams(data, ["phoneNumber", "code"]);
		if (paramsError) return "invalid params:" + paramsError;

		UsersDB.findUser(data.regId, function(user) {
			if (!user) {
				logger.debug("sms verification failed - couldn't find user");
				return;
			}

			user.onCodeVerify(data);
		});
	},

	echo : function(data) {
		var paramsError = Users._verifyParams(data, ["title", "message"]);
		if (paramsError) return "invalid params:" + paramsError;

		UsersDB.findUser(data.regId, function(user) {
			if (!user) {
				logger.debug("echo failed - couldn't find user");
				return;
			}

			user.sendEcho(data.title, data.message);
		});
	},

	unregister : function(data) {
		var paramsError = Users._verifyParams(data);
		if (paramsError) return "invalid params:" + paramsError;

		UsersDB.findUser(data.regId, function(user) {
			if (!user) {
				logger.debug("unregistration failed - couldn't find user");
				return;
			}

			user.invalidate(function(user) {
				if (!user) logger.debug("unregistration failed - couldn't invalidate user"); });
		});
	},

	addUserAndRegister : function(regId, callback) {
		logger.debug("register-->adding user with regId:" + regId);
		var token = uuid.v4();
		UsersDB.addUser(regId, token, function(user) {
			if (user) {
				user.askPushVerify(token);
			} else {
				logger.error("user registration failed - couldn't add user with regId:" + regId);
			}
			callback && callback(user);
		});
	},

	_verifyParams : function(reqBody, expectedParams) {
		function paramError(params) { return "missing " + params; }

		if (!reqBody) return paramError("body");
		if (!reqBody.regId) return paramError("regId");
		if (expectedParams) {
			var missingParams = [];
			expectedParams.forEach(function(param) {
				if (!reqBody.hasOwnProperty(param)) missingParams.push(param); });
			if (missingParams.length) return paramError(missingParams);
		}
	},

	_handleOldUserRegister : function(oldRegId, regId, data) {
		logger.debug("try to find an old user with oldRegId:" + oldRegId);
		UsersDB.modifyUser(oldRegId, true, { state : States.SMS_VERIFIED }, { $set : { state : States.UNVERIFIED, _oldId : oldRegId } }, function(user) {
			if (user && user.verifyChallenge(data)) {
				logger.debug("old user is verified - updating regId and sending sms verified");
				user.oldToNew(regId, States.SMS_VERIFIED, function(err) {
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

	notify : function(regId) {},

	// try to silently push to the user once a day - if doesn't answer for 365 days, auto unregister
	healthCheck : function() {}
};

function User(user) {
	this._user = user;
}

User.prototype = {
	onRegistrationStep : function(step, unverifiedCallback, pushVerifiedCallback, codePendingCallback, smsVerifiedCallback, data) {
		logger.debug("on '".concat(step, "' for user:", this.toString()));
		switch (this._user.state) {
			case States.UNVERIFIED :
				if (unverifiedCallback) unverifiedCallback.call(this, data);
				else logger.debug("user registration state is unverified - he must reset to re initiate the registration");
				break;
			case States.PUSH_VERIFIED :
				if (pushVerifiedCallback) pushVerifiedCallback.call(this, data);
				else logger.debug("user registration state is pushed unverified - he must reset to re initiate the registration");
				break;
			case States.CODE_PENDING :
				if (codePendingCallback) codePendingCallback.call(this, data);
				else logger.debug("user registration state is code pending - he must reset to re initiate the registration");
				break;
			case States.SMS_VERIFIED :
				if (smsVerifiedCallback) smsVerifiedCallback.call(this, data);
				else {
					logger.debug("user registration is already sms verified - send sms verified");
					this.sendSMSVerified();
				}
		}
	},

	resetRegistration : function() {
		var $this = this;
		this.invalidate(function(user, invalidId) {
			if (!user) {
				logger.error("reset registration failed - couldn't invalidate user:".concat($this.toString(), " invalidId:" + invalidId));
				return;
			}

			Users.addUserAndRegister($this._user._id, function(addedUser) {
				if (!addedUser) logger.error("reset registration failed - couldn't add user:" + $this.toString()); });
		});
	},

	askPushVerify : function(token) {
		logger.debug("asking to push verify user:" + this.toString());
		GCM.notify([this._user._id],
			{	"message"			: "To start verifying this device please tap here",
				"title"				: "Verification Step One",
				"msgType"			: MessageTypes.PUSH_VERIFICATION,
				"regId"				: this._user._id,
				"verificationToken"	: token
			}, { "collapseKey"		: "Pending Verification" });
	},

	onPushVerify : function(data) {
		this.onRegistrationStep("push verify", this.verifyToken, null, null, null, data);
	},

	verifyToken : function(data) {
		if (!this._user.verification_token || this._user.verification_token != data.token) {
			logger.debug("push verification failed - token mismatch, token exist:" + !!this._user.verification_token);
			return;
		}

		var $this = this;
		UsersDB.modifyUser(this._user._id, false, null, { $set : { state : States.PUSH_VERIFIED, last_response_ts : new Date() } }, function(user) {
			if (user) {
				user.sendPushVerified();
			} else {
				// todo: send user 'reset' request?
				logger.error("push verification failed, couldn't mark as push verified:" + $this.toString());
			}
		});
	},

	sendPushVerified : function() {
		GCM.notify([this._user._id],
			{	"message"			: "To continue verifying this device, please tap here",
				"title"				: "Verification Step One Succeeded",
				"msgType"			: MessageTypes.PUSH_VERIFIED,
				"verificationToken"	: this._user.verification_token,
				"regId"				: this._user._id
			}, { "collapseKey"		: "Verification Success" });
	},

	onSmsVerify : function(data) {
		this.onRegistrationStep("sms verify", null, this.askSMSVerify, null, null, data);
	},

	askSMSVerify : function(data) {
		logger.debug("asking to sms verify user:" + this.toString());

		if (this._user.verification_code) {
			logger.debug("sms verification failed - user already has verification code");
			return;
		}

		this.askSMSVerifyWithNumber(data.phoneNumber);
	},

	handleRegisteredPhoneNumber : function(newRegId, phoneNumber, overrideIfExist, callback) {
		if (!overrideIfExist) {
			this.sendPhoneNumberUsedError(this._user.phone_number);
			return callback("sms verification failed - phone number is already registered");
		}

		logger.debug("sms verification continue with an already registered phone number");
		this.invalidate(function(invalidatedUser) {
			if (!invalidatedUser) {
				return callback("phone number registration failed - couldn't invalidate old user");
			}

			UsersDB.modifyUser(newRegId, false, null, { $set : { appears_in_numbers : invalidatedUser.appears_in_numbers } }, function(user) {
				if (!user) {
					return callback("sms verification failed - couldn't update new user");
				}

				callback();
			});
		});
	},

	askSMSVerifyWithNumber : function(phoneNumber) {
		var $this = this;
		var code = speakeasy.totp({ key : this._user.verification_token, step : config.users.codeStep });
		UsersDB.modifyUser(this._user._id, false, null, { $set : { verification_code : code, state : States.CODE_PENDING } }, function(user) {
			if (!user) {
				logger.debug("sms verification failed - update user failed:" + $this.toString());
				return;
			}

			SMS.send(phoneNumber,
				"Your verification code is:".concat(code, ".\nPlease enter it to the 'Verification Code' input field and submit."),
				function(smsFailed) {
					if (!smsFailed) {
						logger.debug("SMS was sent successfully to:" + phoneNumber + " for user:" + user.toString());
						return;
					}

					logger.debug("failed to send SMS to:" + phoneNumber + " for user:" + user.toString());
					var modifyData = { $set : { state : States.PUSH_VERIFIED, sms_verify_tries : (user.sms_verify_tries || 0) + 1 },
						$unset : { verification_code : "" } };
					UsersDB.modifyUser(user._id, false, null, modifyData, function(pushVerifiedUser) {
						if (!pushVerifiedUser) {
							logger.debug("failed to notify user on phone number error:" + user.toString());
							return;
						}

						pushVerifiedUser.sendPhoneNumberInvalidError(phoneNumber);
					});
				});
		});
	},

	sendPhoneNumberUsedError : function(phoneNumber) {
		GCM.notify([this._user._id],
			{	"message"			: "You've entered a phone number that is already registered '".concat(phoneNumber, "'. Tap here and let us know how to continue"),
				"title"				: "Verification Failed - Already Registered Phone Number",
				"msgType"			: MessageTypes.USED_NUMBER,
				"regId"				: this._user._id
			}, { "collapseKey"		: "Verification Failed" });
	},

	sendPhoneNumberInvalidError : function(phoneNumber) {
		GCM.notify([this._user._id],
			{	"message"			: "You've entered an invalid phone number '".concat(phoneNumber, "'. Tap here to re enter your phone number"),
				"title"				: "Verification Failed - Invalid Phone Number",
				"msgType"			: MessageTypes.INVALID_NUMBER,
				"regId"				: this._user._id
			}, { "collapseKey"		: "Verification Failed" });
	},

	onCodeVerify : function(data) {
		this.onRegistrationStep("sms verify", null, null, this.verifyCode, null, data);
	},

	verifyCode : function(data) {
		function updateUserVerified() {
			UsersDB.modifyUser($this._user._id, false, null, { $set : { state : States.SMS_VERIFIED, phone_number : data.phoneNumber, last_response_ts : new Date() } }, function(user) {
				if (user) {
					user.sendSMSVerified();
				} else {
					// todo: send user 'reset' request?
					logger.error("sms verification failed, couldn't mark as sms verified:" + $this.toString());
				}
			});
		}

		if (!this._user.verification_code || this._user.verification_code != data.code) {
			logger.debug("sms verification failed - code mismatch, code exist:" + !!this._user.verification_code);
			this.sendCodeError(data.code);
			return;
		}

		var $this = this;
		UsersDB.findUserWithNumber(data.phoneNumber, function(user) {
			if (user) {
				user.handleRegisteredPhoneNumber($this._user._id, data.phoneNumber, data.overrideIfExist, function(err) {
					if (err) {
						logger.debug("failed to handle registered phone number:" + err);
						return;
					}

					updateUserVerified();
				});
			} else {
				updateUserVerified();
			}
		});


		var $this = this;
		UsersDB.modifyUser(this._user._id, false, null, { $set : { state : States.SMS_VERIFIED, phone_number : data.phoneNumber, last_response_ts : new Date() } }, function(user) {
			if (user) {
				user.sendSMSVerified();
			} else {
				// todo: send user 'reset' request?
				logger.error("sms verification failed, couldn't mark as sms verified:" + $this.toString());
			}
		});
	},

	sendSMSVerified : function() {
		GCM.notify([this._user._id],
			{	"message"			: "You're device is verified, all relevant contacts will appear within your app in seconds",
				"title"				: "Verification Succeeded",
				"msgType"			: MessageTypes.VERIFIED,
				"verificationCode"	: this._user.verification_code,
				"regId"				: this._user._id
			}, { "collapseKey"		: "Verification Success" });
	},

	sendCodeError : function(code) {
		GCM.notify([this._user._id],
			{	"message"			: "You've entered an invalid verification code '".concat(code, "'. Tap here to re enter the code"),
				"title"				: "Verification Failed - Invalid Code",
				"msgType"			: MessageTypes.INVALID_CODE,
				"regId"				: this._user._id
			}, { "collapseKey"		: "Verification Failed" });
	},

	sendEcho : function(title, msg) {
		GCM.notify([this._user._id],
			{	"message"			: msg,
				"title"				: "ECHO: " + title,
				"msgType"			: MessageTypes.MESSAGE,
				"regId"				: this._user._id
			}, { "collapseKey"		: "Echo Message" });
	},

	invalidate : function(callback) {
		var invalidatedUser = this.clone(), invalidId = process.hrtime();;

		invalidatedUser._id = invalidId[0] + "/" + invalidId[1];
		invalidatedUser.invalid_id = this._user._id;
		invalidatedUser.state = States.INVALID;
		invalidatedUser.invalid_phone_number = this._user.phone_number;
		delete invalidatedUser.phone_number;

		var $this = this;
		UsersDB.addUserDocument(invalidatedUser, function(user) {
			if (!user) {
				logger.error("invalidate error - couldn't add cloned invalidated user");
				return;
			}

			UsersDB.deleteUser($this._user._id, function(user) {
				callback(user && invalidatedUser); });
		});
	},

	verifyChallenge : function(data) {
		return this._user.verification_token && this._user.verification_token == data.token &&
			this._user.verification_code && this._user.verification_code == data.code;
	},

	oldToNew : function(regId, state, callback) {
		var $this = this;
		UsersDB.modifyUser(this._user._oldId, false, null, { $set : { _id : regId, state : state } }, function(user) {
			if (user) $this._user = user;
			callback(err);
		});
	},

	toString : function() {
		return this._user._id;
	},

	clone : function() {
		var clonedUser = {};
		Object.keys(this._user).forEach(function(entry) { clonedUser[entry] = this[entry]; }, this._user);
		return new User(clonedUser);
	},

	_user : null
};

var UsersDB = {
	findUser : function(regId, callback) {
		this.collection.findOne({ type : "user", _id : regId }, function(err, user) {
			callback(user && new User(user)); });
	},

	findUserWithNumber : function(number, callback) {
		this.collection.findOne({ type : "user", phone_number : number }, function(err, user) {
			callback(user && new User(user)); });
	},

	addUser : function(regId, token, callback) {
		// todo: check unique token
		this.addUserDocument({
			_id 				: regId,
			type				: "user",
			state				: States.UNVERIFIED,
			verification_token	: token,
			last_response_ts	: new Date()
		}, callback);
	},

	addUserDocument : function(doc, callback) {
		this.addDocument(doc, function(err, result) { callback(!err && result && new User(result[0])); });
	},

	modifyUser : function(regId, isOld, constraints, data, callback) {
		var queryObj = isOld ? { _oldId : regId } : { _id : regId };
		if (constraints) queryObj = { $and : [queryObj, constraints] };
		this.collection.findAndModify(queryObj, undefined, data, { "new" : true }, function(err, object) {
			logger.debug("modified user, err:" + err);
			callback && callback(object && new User(object)); });
	},

	deleteUser : function(regId, callback) {
		this.collection.findOneAndDelete({ _id : regId }, null, function(err, result) {
			callback(!err && result && new User(result)); });
	},

	addDocument : function(doc, callback) {
		this.collection.insert(doc, { w : 1 }, function(err, result) { callback(err, result); });
	},

	collection : null
};

DB.getDB("api", "users", function(db) {
	UsersDB.collection = db && db.collection("api"); });


module.exports = Users;
