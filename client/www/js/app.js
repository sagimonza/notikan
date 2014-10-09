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

nkAppModule.controller('nkCtrl', ['$scope', '$log', 'loadingService', '$ionicModal', 'userService', 'pushService', '$ionicSideMenuDelegate', function($scope, $log, loadingService, $ionicModal, userService, pushService, $ionicSideMenuDelegate) {
	function log(msg) {
		$log.log(msg)
	}

	userService.setScope($scope);
	pushService.setBroadcastingScope($scope);
	log("showing loading shield");
	loadingService.show();

	$scope.sendEcho = function(title, msg) {
		userService.sendEcho(title, msg);
	};

	$scope.toggleSettings = function() {
		$ionicSideMenuDelegate.toggleLeft();
	};

	$scope.smsVerify = function(phoneNumber) {
		userService.smsVerify(phoneNumber);
		loadingService.show();
		$scope.telephoneModal.hide().then(function() {
			$scope.verificationCodeModal.show().then(function() {
				loadingService.hide(); });
		});
	};

	$scope.codeVerify = function(code) {
		userService.codeVerify(code);
		loadingService.show();
	};

	var pushVerifiedOffFunc = $scope.$on("user/pushVerified", function() {
		log("user push verified - removing loading shield");
		pushVerifiedOffFunc();
		loadingService.hide();
		$scope.telephoneModal.show();
	});

	$scope.$on("user/invalidNumber", function() {
		loadingService.hide();
		if ($scope.verificationCodeModal.isShown())
			$scope.verificationCodeModal.hide().then(function() {
				$scope.telephoneModal.show(); });
		else $scope.telephoneModal.show();
	});

	$scope.$on("user/invalidCode", function() {
		loadingService.hide();
		// todo: allow user to reset back and change phone number
	});

	var verifiedOffFunc = $scope.$on("user/verified", function() {
		loadingService.hide();
		log("user verified - clearing dialogs");
		verifiedOffFunc();
		$scope.verificationCodeModal.hide();
	});

	// Create and load the Modal
	$ionicModal.fromTemplateUrl('enter_phone_number.html', function(modal) { $scope.telephoneModal = modal; }, {
		scope: $scope,
		animation: 'slide-in-up'
	});

	// Create and load the Modal
	$ionicModal.fromTemplateUrl('verification_code.html', function(modal) { $scope.verificationCodeModal = modal; }, {
		scope: $scope,
		animation: 'slide-in-up'
	});

}]);
