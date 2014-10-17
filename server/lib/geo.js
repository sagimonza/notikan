/**
 * Created by user on 17/10/2014.
 */

var geocoder		= require('node-geocoder');
var LoggerFactory	= require('./logger.js');
var config			= require("./config.js");

var logger = LoggerFactory.createLogger("geo");

geocoder = geocoder.getGeocoder(config.geo.provider, config.geo.adapter, config.geo.extra);

var Geo = {
	getCountryCode : function(lat, long, callback) {
		if (lat === undefined || long === undefined) {
			callback();
			return;
		}

		geocoder.reverse(lat, long, function(err, res) {
			logger.debug("get country code for:".concat(lat, ",", long, " res:", res, " err:", err));
			try { logger.debug("geocoder reverse result:" + (res && JSON.stringify(res))); } catch(ex) {}
			callback(!err && res && res[0].countryCode);
		});
	}
};

module.exports = Geo;

