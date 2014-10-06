/**
 * Created by Sagi Monza on 05/10/2014.
 */

var nkAppModule = angular.module('nkAppModule', ['ionic', 'ngCordova', 'pushModule', 'userModule']);

nkAppModule.factory('loadingService', ['$ionicLoading', function ($ionicLoading) {
	return {
		show : function() {
			$ionicLoading.show({
				template: 'Verifying...'
			});
		},

		hide : function() {
			$ionicLoading.hide();
		}
	};
}]);

nkAppModule.controller('nkCtrl', ['$scope', '$log', 'loadingService', 'userService', 'pushService', '$ionicSideMenuDelegate', function($scope, $log, loadingService, userService, pushService, $ionicSideMenuDelegate) {
	function log(msg) {
		$log.log(msg)
	}

	userService.setScope($scope);
	pushService.setBroadcastingScope($scope);
	log("showing loading shield");
	loadingService.show();
	var verifiedOffFunc = $scope.$on("user/verified", function() {
		log("user verified - removing loading shield");
		verifiedOffFunc();
		loadingService.hide();
	});

	$scope.sendEcho = function(title, msg) {
		userService.sendEcho(title, msg);
	};

	$scope.toggleSettings = function() {
		$ionicSideMenuDelegate.toggleLeft();
	};
}]);
