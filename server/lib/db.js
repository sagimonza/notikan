
var MongoClient		= require('mongodb').MongoClient;
var LoggerFactory	= require('./logger.js');
var config			= require('./config.js');

var logger = LoggerFactory.createLogger("DB");

function buildMongoUrl(host, port, name, user, password) {
	return "mongodb://".concat(user || "", user ? ":" : "", password || "", user ? "@" : "", host, ":", port, "/", name);
}

var databases = {
	api : {
		url : buildMongoUrl(config.db.url, config.db.port, config.db.api, config.db.username, config.db.password),
		activeCounters : {},
		active : null
	}
};

function validateKey(dbKey) {
	logger.debug("validate database key, dbKey=" + dbKey);
	
	var dbObj = databases[dbKey];
	if (!dbObj)
		logger.error("no database with given key:" + dbKey);

	logger.debug("validate database key succeeded");

	return dbObj;
}

function getDB(dbKey, countKey, callback) {
	function incCounter() {
		dbObj.activeCounters[countKey] = (dbObj.activeCounters[countKey] || 0) + 1;
	}
	
	var dbObj = validateKey(dbKey);
	if (!dbObj) {
		process.nextTick(function() { callback(); });
		return;
	}
	
	if (dbObj.active) {
		logger.debug("found active database with given key, increasing active count");
		incCounter();
		process.nextTick(function() {
			callback(dbObj.activeCounters[countKey] && dbObj.active); });
		
		return true;
	}
	
	MongoClient.connect(dbObj.url, function(err, db) {
		if (!err) {
			dbObj.active = db;
			incCounter();
		} else {
			logger.error("failed to connect to mongodb:" +  err);
		}
		
		callback(!err && db);
	});
}

function freeDB(dbKey, countKey) {
	var dbObj = validateKey(dbKey);
	if (!dbObj || !dbObj.active || !dbObj.activeCounters[countKey])
		return;
	
	--dbObj.activeCounters[countKey];
	
	if (Object.keys(dbObj.activeCounters).every(function(counter) { return !counter; })) {
		logger.deubg("database '".concat(dbKey, "' active count has decreased to zero - closing the database connection"));
		dbObj.active.close();
		dbObj.active = null;
	}
}

module.exports.getDB = getDB;
module.exports.freeDB = freeDB;
