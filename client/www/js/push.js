
var pushModule = angular.module('pushModule', ['ionic', 'ngCordova']);

pushModule.factory("pushService", ["$log", "$cordovaPush", function($log, $cordovaPush) {
	function log(msg) {
		$log.log(msg);
	}

	function onDeviceReady() {
		function appendStatus(str) {
			log("new status:" + str);
			var statusElem = document.createElement("li");
			statusElem.textContent = str;
			appStatus.appendChild(statusElem);
		}

		var appStatus = document.getElementById("app-status-ul");

		// Android and Amazon Fire OS
		window.onNotification = function(e) {
			appendStatus('EVENT -> RECEIVED:' + e.event);

			switch( e.event ) {
				case 'registered':
					if ( e.regid.length > 0 ) {
						appendStatus('REGISTERED -> REGID:' + e.regid);
						// Your GCM push server needs to know the regID before it can push to this device
						// here is where you might want to send it the regID for later use.
						log("regID = " + e.regid);
						PushObj.broadcast("push/registered", e.regid);
					}
					break;

				case 'message':
					// if this flag is set, this notification happened while we were in the foreground.
					// you might want to play a sound to get the user's attention, throw up a dialog, etc.
					if ( e.foreground ) {
						PushObj.broadcast("push/message", e);

						appendStatus('--INLINE NOTIFICATION--');

						// on Android soundname is outside the payload.
						// On Amazon FireOS all custom attributes are contained within payload
						var soundfile = e.soundname || e.payload.sound;
						// if the notification contains a soundname, play it.
						if (soundfile) {
							var my_media = new Media("/android_asset/www/"+ soundfile);
							if (my_media) my_media.play();
						}
					}
					else {  // otherwise we were launched because the user touched a notification in the notification tray.
						if ( e.coldstart ) {
							PushObj.broadcast("push/message", e);
							appendStatus('--COLDSTART NOTIFICATION--');
						} else {
							PushObj.broadcast("push/message", e);
							appendStatus('--BACKGROUND NOTIFICATION--');
						}
					}

					appendStatus('MESSAGE -> MSG: ' + e.payload.message);
					//Only works for GCM
					appendStatus('MESSAGE -> MSGCNT: ' + e.payload.msgcnt);
					//Only works on Amazon Fire OS
					appendStatus('MESSAGE -> TIME: ' + e.payload.timeStamp);
					break;

				case 'error':
					PushObj.broadcast("push/error", e);
					appendStatus('ERROR -> MSG:' + e.msg);
					break;

				default:
					PushObj.broadcast("push/unknown", e);
					appendStatus('EVENT -> Unknown, an event was received and we do not know what it is');
					break;
			}
		};

		var androidConfig = {
			"senderID":"183882612832",
			"ecb":"onNotification"
		};

		var iosConfig = {
			"badge":"true",
			"sound":"true",
			"alert":"true",
			"ecb":"onNotificationAPN"
		};

		PushObj.registerPush = function() {
			log("CordovaPush before registration");

			// todo: detect device
			$cordovaPush.register(androidConfig).then(
				function(result) {
					log("CordovaPush registered successfully:" + result);
					// Success!
				}, function(err) {
					log("CordovaPush failed registration");
					// An error occured. Show a message to the user
				}
			);

			log("CordovaPush after registration");
		};

		PushObj.registerPush();

		/*var options = {};
		 $cordovaPush.unregister(options).then(function(result) {
		 // Success!
		 }, function(err) {
		 // An error occured. Show a message to the user
		 });

		 // iOS only
		 $cordovaPush.setBadgeNumber(2).then(function(result) {
		 // Success!
		 }, function(err) {
		 // An error occured. Show a message to the user
		 });*/
	}

	document.addEventListener('deviceready', onDeviceReady, true);

	var PushObj = {
		setBroadcastingScope : function(scope) {
			log("setBroadcastingScope, pending:" + this._pendingBroadcasts.length);
			this._scope = scope;

			var broadcasts = this._pendingBroadcasts.concat();
			this._pendingBroadcasts = [];
			broadcasts.forEach(function(broadcast) {
				this.broadcast(broadcast[0], broadcast[1], broadcast[2]);
			}, this);
		},

		broadcast : function(type, arg1, arg2) {
			if (this._scope) {
				log("NotikanPushService broadcasting " + type);
				this._scope.$broadcast(type, arg1, arg2);
			} else {
				log("NotikanPushService pending broadcasting " + type);
				this._pendingBroadcasts.push([type, arg1, arg2]);
			}
		},

		_scope : null,

		_pendingBroadcasts : []
	};

	return PushObj;
}]);
