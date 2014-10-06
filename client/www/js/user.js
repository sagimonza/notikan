/**
 * Created by Sagi Monza on 05/10/2014.
 */

var userModule = angular.module('userModule', ['LocalStorageModule']);

userModule.factory('userService', ['$log', '$http', 'localStorageService', function($log, $http, localStorageService) {
	function log(msg) {
		$log.log(msg);
	}

	var MessageTypes = {
		VERIFICATION	: "verification",
		VERIFIED		: "verified",
		MESSAGE			: "message"
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
					case MessageTypes.VERIFICATION :
						UserService.verify(payload.regId, payload.verificationToken);
						break;
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId);
						break;
					default :
						log("unexpected message type while in unregistered state:" + payload.msgType);
						break;
				}
			},

			unverified : function(e, msgEvent) {
				var payload = msgEvent.payload;
				log("MessageHandler unverified got:" + payload.msgType);
				switch (payload.msgType) {
					case MessageTypes.VERIFIED :
						UserService.verified(payload.regId);
						break;
					default :
						log("unexpected message type while in unverified state:" + payload.msgType);
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
				var currRegId = UserService.getRegId();
				if (currRegId != regId) {
					UserService.register(regId, currRegId);
				} else {
					UserService.verified(regId);
				}
			});
		},

		getRegId : function() {
			return localStorageService.get("regId");
		},

		setRegId : function(regId) {
			log("UserController setRegId:" + regId);
			localStorageService.set("regId", regId);
		},

		register : function(regId, oldRegId, callback) {
			MessageHandlersManager.change("unregistered");
			UserService.apiPost("register", { "regId" : regId, "oldRegId" : oldRegId });
		},

		verify : function(regId, token) {
			MessageHandlersManager.change("unverified");
			UserService.apiPost("verify", { "regId" : regId, "token" : token });
		},

		verified : function(regId) {
			log("UserController verified!!!!");
			MessageHandlersManager.change("verified");
			UserService.setRegId(regId);
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
			UserService.apiPost("echo", { "regId" : UserService.getRegId(), "title" : title, "message" : msg });
		},

		apiPost : function(action, data) {
			$http.post("https://app.notikan.com:8443/" + action, JSON.stringify(data)).then(
				function() { log("'".concat(action, "' post api call succeeded")); },
				function() { log("'".concat(action, "' post api call failed")); });
		},

		_scope : null
	};

	return UserService;
}]);
