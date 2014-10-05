
var uuid = require('node-uuid');

function formatDate(date) {
	function str(num) { return num < 10 ? "0" + num : num; }
	return "".concat(str(date.getFullYear()), "-", str(date.getMonth() + 1), "-", str(date.getDate()), " ", str(date.getHours()), ":", str(date.getMinutes()), ":", str(date.getSeconds()), ".", str(date.getMilliseconds()));
}

function buildMsg(level, date, id, msg) {
	return (level || "DEBUG").concat(" ", formatDate(date), " [", id, "]", ":", msg);
}

function log(msg) {
	console.log(msg);
}

function Logger(id) {
	this.id = id || uuid.v4();
}

Logger.prototype = {
	debug : function(msg) {
		log(buildMsg("DEBUG", new Date(), this.id, msg));
	},
	
	error : function(msg) {
		log(buildMsg("ERROR", new Date(), this.id, msg));
	}
};

module.exports.createLogger = function(id) {
	return new Logger(id);
};
