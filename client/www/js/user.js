/**
 * Created by Sagi Monza on 05/10/2014.
 */

// todo: implement content observer to know when contacts are modified (added/deleted/etc.)

var userModule = angular.module('userModule', ['LocalStorageModule']);

userModule.factory('userService', ['$log', '$http', 'localStorageService', function($log, $http, localStorageService) {
	function log(msg) {
		$log.log(msg);
	}

	var MessageTypes = {
		PUSH_VERIFICATION	: "push_verification",
		PUSH_VERIFIED		: "push_verified",
		INVALID_NUMBER		: "invalid_number",
		INVALID_CODE		: "invalid_code",
		VERIFIED			: "verified",
		MESSAGE				: "message"
	};

	var MessageHandlersManager = {
		change : function(type) {
			log("MessageHandlersManager change to: " + type);
			if (this._activeOff) this._activeOff();
			this._activeOff = UserService._scope.$on("push/message", this._handlers[type]);
		},

		_handlers : {
			unregistered : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler unregistered got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.PUSH_VERIFICATION :
						UserService.pushVerify(payload.regId, payload.verificationToken);
						break;
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId);
						break;
					default :
						log("unexpected message type while in unregistered state:" + payload.msgType);
						break;
				}
			},

			pushVerify : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler pushVerify got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.PUSH_VERIFIED :
						UserService.pushVerified(payload.regId, payload.verificationToken);
						break;
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId);
						break;
					default :
						log("unexpected message type while in pushVerify state:" + payload.msgType);
						break;
				}
			},

			pushVerified : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler pushVerified got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId);
						break;
					default :
						log("unexpected message type while in pushVerified state:" + payload.msgType);
						break;
				}
			},

			smsVerify : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler smsVerify got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId);
						break;
					default :
						log("unexpected message type while in smsVerify state:" + payload.msgType);
						break;
				}
			},

			codeVerify : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler codeVerify got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.INVALID_NUMBER :
						UserService.invalidNumber();
						break;
					case MessageTypes.INVALID_CODE :
						UserService.invalidCode();
						break;
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId, payload.verificationCode);
						break;
					default :
						log("unexpected message type while in codeVerify state:" + payload.msgType);
						break;
				}
			},

			verified : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler verified got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.MESSAGE :
						UserService.message(payload);
						break;
					default :
						log("unexpected message type while in verified state:" + payload.msgType);
						break;
				}
			},

			none : function() {}
		},

		_activeOff : null
	};

	var UserService = {
		setScope : function(scope) {
			if (this._offFunc) this._offFunc();

			this._scope = scope;
			this._offFunc = this._scope.$on("push/registered", function(e, regId) {
				log("got push/registered event");
				var currRegId = UserService.getParam("regId");
				if (currRegId != regId) {
					UserService.register(regId, currRegId);
				} else {
					UserService.verified(regId);
				}
			});
		},

		register : function(regId, oldRegId) {
			MessageHandlersManager.change("unregistered");
			UserService.apiPost("register", { "regId" : regId, "data" : { "oldRegId" : oldRegId } });
		},

		pushVerify : function(regId, token) {
			MessageHandlersManager.change("pushVerify");
			UserService.apiPost("pushVerify", { "regId" : regId, "token" : token });
		},

		pushVerified : function(regId, token) {
			log("UserController push verified");
			MessageHandlersManager.change("pushVerified");
			UserService.saveParams({ regId : regId, verificationToken : token });
			UserService._scope.$emit("user/pushVerified");
		},

		smsVerify : function(phoneNumber) {
			MessageHandlersManager.change("smsVerify");
			UserService.saveParams({ phoneNumber : phoneNumber });
			UserService.apiPost("smsVerify", { "regId" : UserService.getParam("regId"), "phoneNumber" : phoneNumber });
		},

		codeVerify : function(verificationCode) {
			MessageHandlersManager.change("codeVerify");
			UserService.apiPost("codeVerify", { "regId" : UserService.getParam("regId"),
				"phoneNumber" : UserService.getParam("phoneNumber"), "code" : verificationCode });
		},

		invalidNumber : function() {
			log("UserController invalid number");
			UserService._scope.$emit("user/invalidNumber");
		},

		invalidCode : function() {
			log("UserController invalid code");
			UserService._scope.$emit("user/invalidCode");
		},

		verified : function(regId, code) {
			log("UserController verified!!!!");
			MessageHandlersManager.change("verified");
			UserService.saveParams({ verificationCode : code });
			UserService._scope.$emit("user/verified");
		},

		message : function(msgEventPayload) {
			log("new message arrived:" + msgEventPayload);
			UserService._scope.$emit("user/message");
		},

		sendEcho : function(title, msg) {
			title = title || "NOTIKAN ECHO TITLE";
			msg = msg || "NOTIKAN ECHO MESSAGE";
			log("UserConroller sending echo, title:" + title + " msg:" + msg);
			UserService.apiPost("echo", { "regId" : UserService.getParam("regId"), "title" : title, "message" : msg });
		},

		apiPost : function(action, data) {
			$http.post("https://app.notikan.com:8443/" + action, JSON.stringify(data)).then(
				function() { log("'".concat(action, "' post api call succeeded")); },
				function() { log("'".concat(action, "' post api call failed")); });
		},

		saveParams : function(obj) {
			Object.keys(obj).forEach(function(key) {
				log("UserController set param:" + key + " value:" + obj[key]);
				localStorageService.set(key, obj[key]);
			});
		},

		getParam : function(key) {
			return localStorageService.get(key);
		},

		_scope : null
	};

	return UserService;
}]);
