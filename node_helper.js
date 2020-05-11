/* global Module, MMM-ChartProvider-Words */

/* Magic Mirror
 * Module: node_helper
 *
 * By Neil Scott
 * MIT Licensed.
 */

const moduleruntime = new Date();
const stopwords = ["", "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "arent", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "cant", "cannot", "could", "couldnt", "did", "didnt", "do", "does", "doesnt", "doing", "dont", "down", "during", "each", "few", "for", "from", "further", "had", "hadnt", "has", "hasnt", "have", "havent", "having", "he", "hed", "hell", "hes", "her", "here", "heres", "hers", "herself", "him", "himself", "his", "how", "hows", "i", "id", "ill", "im", "ive", "if", "in", "into", "is", "isnt", "it", "its", "its", "itself", "lets", "me", "more", "most", "mustnt", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shant", "she", "shed", "shell", "shes", "should", "shouldnt", "so", "some", "such", "than", "that", "thats", "the", "their", "theirs", "them", "themselves", "then", "there", "theres", "these", "they", "theyd", "theyll", "theyre", "theyve", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasnt", "we", "wed", "well", "were", "weve", "were", "werent", "what", "whats", "when", "whens", "where", "wheres", "which", "while", "who", "whos", "whom", "why", "whys", "with", "wont", "would", "wouldnt", "you", "youd", "youll", "youre", "youve", "your", "yours", "yourself", "yourselves"];

//this loads and processes feeds into NDTF items of the count of words in the feeds, depending on its config when called to from the main module
//
//it must only send the same data once, 
// if the input is a local file, once it has been sent it wont send it again
// if the input is a web page (denoted by a HTTP prefix) then the returned data is only scraped once a day
// if the input is a feed from a feedprovider, then we know we will be getting unique data each time, and so we can just  process it.

//if the module calls a RESET, then the date tracking is reset and all data will be sent (TODO)

var NodeHelper = require("node_helper");
var moment = require("moment");

//pseudo structures for commonality across all modules
//obtained from a helper file of modules

var LOG = require('../MMM-FeedUtilities/LOG');
var QUEUE = require('../MMM-FeedUtilities/queueidea');
var RSS = require('../MMM-FeedUtilities/RSS');
var UTILITIES = require('../MMM-FeedUtilities/utilities');

// get required structures and utilities

const structures = require("../MMM-ChartUtilities/structures");
const utilities = require("../MMM-ChartUtilities/common");

const JSONutils = new utilities.JSONutils();
const configutils = new utilities.configutils();

// local variables, held at provider level as this is a common module

var providerstorage = {};

var trackingfeeddates = []; //an array of last date of feed recevied, one for each feed in the feeds index, build from the config
var aFeed = { lastFeedDate: '', feedURL: '' };

var payloadformodule = []; //we send back an array of identified stuff
var payloadstuffitem = { stuffID: '', stuff: '' }

var latestfeedpublisheddate = new Date(0) // set the date so no feeds are filtered, it is stored in providerstorage

module.exports = NodeHelper.create({

	start: function () {
		this.debug = false;
		console.log(this.name + ' node_helper is started!');
		this.logger = {};
		this.logger[null] = LOG.createLogger("logs/logfile_Startup" + ".log", this.name);
		this.queue = new QUEUE.queue("single", false);
	},

	showElapsed: function () {
		endTime = new Date();
		var timeDiff = endTime - startTime; //in ms
		// strip the ms
		timeDiff /= 1000;

		// get seconds 
		var seconds = Math.round(timeDiff);
		return (" " + seconds + " seconds");
	},

	stop: function () {
		console.log("Shutting down node_helper");
		//this.connection.close();
	},

	setconfig: function (moduleinstance, config) {

		if (this.debug) { this.logger[moduleinstance].info("In setconfig: " + moduleinstance + " " + config); }

		if (config.input != null) {

			config['useHTTP'] = false;

			// work out if we need to use a HTTP processor

			if (config.input.substring(0, 4).toLowerCase() == "http") { config.useHTTP = true; }
		}

		//store a local copy so we dont have keep moving it about

		providerstorage[moduleinstance] = { config: config, trackingfeeddates: [] };

		var self = this;

		//process the wordfeed details into the local tracker

		// TODO only process 1

		providerstorage[moduleinstance].config.wordfeeds.forEach(function (configfeed) {

			var feed = { sourcetitle: '', lastFeedDate: '', latestfeedpublisheddate: new Date(0), feedconfig: configfeed };

			//we add some additional config information for usage in processing the data

			//var wordfeed = Object.assign({}, paramdefaults, config.params[idx]);

			configfeed["useruntime"] = false;
			configfeed["usenumericoutput"] = false;

			if (configfeed.type == 'numeric') { configfeed["usenumericoutput"] = true; }

			if (typeof configfeed.timestamp == "number") { //wants an offset of the runtime, provided in seconds, or it was blank
				configfeed["useruntime"] = true;
				configfeed["runtime"] = new Date(moduleruntime.getTime() + (configfeed.timestamp * 1000));
			}

			//store the actual timestamp to start filtering, this will change as new feeds are pulled to the latest date of those feeds
			//if no date is available on a feed, then the current latest date of a feed published is allocated to it

			//feed.lastFeedDate = commonutils.calcTimestamp(configfeed.oldestage);  //ignored in this module until we add date processing of historicaldata
			feed.sourcetitle = configfeed.feedtitle;
			feed.feedconfig = configfeed;

			providerstorage[moduleinstance].trackingfeeddates.push(feed);

		});

	},

	getconfig: function () { return config; },

	socketNotificationReceived: function (notification, payload) {

		var self = this;

		if (this.logger[payload.moduleinstance] == null) {
			this.logger[payload.moduleinstance] = LOG.createLogger("logfile_" + payload.moduleinstance + ".log", payload.moduleinstance);
		};

		if (this.debug) {
			this.logger[payload.moduleinstance].info(this.name + " NODE HELPER notification: " + notification + " - Payload: ");
			this.logger[payload.moduleinstance].info(JSON.stringify(payload));
		}

		//we can receive these messages:
		//
		//RESET: clear any date processing or other so that all available stuff is returned to the module
		//CONFIG: we get our copy of the config to look after
		//UPDATE: request for any MORE stuff that we have not already sent
		//STATUS: show the stored local config for a provider
		//

		switch (notification) {
			case "CONFIG":
				this.setconfig(payload.moduleinstance, payload.config);
				break;
			case "RESET":
				this.reset(payload);
				break;
			case "UPDATE":
				//because we can get some of these in a browser refresh scenario, we check for the
				//local storage before accepting the request
				if (providerstorage[payload.moduleinstance] == null) { break; } //need to sort this out later !!
				this.outputarray = new Array(1); //only 1 feed should be processed
				this.outputarray[0] = [];
				this.processfeeds(payload.moduleinstance, payload.providerid);
				break;
			case "PROCESS_THIS":
				this.outputarray = new Array(1); //only 1 feed should be processed
				this.outputarray[0] = [];
				//this.logger[payload.moduleinstance].info(JSON.stringify(payload));
				this.processincomingfeed(payload);
				break;
			case "STATUS":
				this.showstatus(payload.moduleinstance);
				break;
		}

	},

	//we have received an RSS2.0 feed from somewhere so we need to process it into a single
	//combined dataset and then pass it the processor as normal, bypassing the processfeeds.

	processincomingfeed: function (payload) {

		var self = this;

		//moduleinstance: self.identifier, payload: payload

		words = this.mergefeeds(payload.payload.payload);

		//as we only support one feed, then we can hard code on [0]
		self.queue.addtoqueue(function () { self.processfeed(providerstorage[payload.moduleinstance].trackingfeeddates[0], payload.moduleinstance, payload.providerid, 0, words); });

		//and as we only have one input, then we have to start the queue to process this item
		self.queue.startqueue(providerstorage[payload.moduleinstance].config.waitforqueuetime);
    },


	mergefeeds: function (feedproviderpayload) {

		var tempwords = '';

		feedproviderpayload.forEach(function (article) {

			//we are interested in the title and the description only

			tempwords = tempwords + " " + article.title + " " + article.description

		})

		return tempwords;
	},

	cleanString: function (theString) {
		return UTILITIES.cleanString(theString);
	},

	processfeeds: function (moduleinstance, providerid) {

		var self = this;
		var feedidx = -1;

		if (this.debug) { this.logger[moduleinstance].info("In processfeeds: " + moduleinstance + " " + providerid); }

		//because we only get one data feed in the chart providers, then we preload the data before letting the wordfeed actually process it

		//attempt to pull anything back that is valid in terms of a fs or HTTP recognised locator
		//we assume that we are getting a webpage or file of text (ignore it says JSON - it is just a web page pull)

		var inputtext = JSONutils.getTEXT(providerstorage[moduleinstance].config);

		providerstorage[moduleinstance].trackingfeeddates.forEach(function (feed) {

			var words = inputtext;

			//this should now be an array that we can process in the simplest case

			//check it actually contains something, assuming if empty it is in error

			if (words.length == 0) {
				console.error("text is empty");
				return;
			}

			self.queue.addtoqueue(function () { self.processfeed(feed, moduleinstance, providerid, ++feedidx, words); });

		});
		//even though this is no longer asynchronous we keep the queue just for ease of development

		this.queue.startqueue(providerstorage[moduleinstance].config.waitforqueuetime);
		
	},

	showstatus: function (moduleinstance) {

		console.log('============================ start of status ========================================');

		console.log('config for provider: ' + moduleinstance);

		console.log(providerstorage[moduleinstance].config);

		console.log('feeds for provider: ' + moduleinstance);

		console.log(providerstorage[moduleinstance].trackingfeeddates);

		console.log('============================= end of status =========================================');

	},

	sendNotificationToMasterModule: function (stuff, stuff2) {
		this.sendSocketNotification(stuff, stuff2);
	},

	done: function (err) {

		if (err) {

			console.log(err, err.stack);

		}

	},

	send: function (moduleinstance, providerid, source, feedidx) {

		var self = this;

		//wrap the output array in an object so the main module handles it in the same way as if it was a collection of feeds
		//and add an id for tracking purposes and wrap that in an array

		var payloadforprovider = {
			providerid: providerid, source: source, payloadformodule: [{ setid: providerstorage[moduleinstance].trackingfeeddates[feedidx].feedconfig.setid, itemarray: self.outputarray[feedidx] }]
		};

		if (this.debug) {
			this.logger[moduleinstance].info("In send, source, feeds // sending items this time: " + (self.outputarray[feedidx].length > 0));
			this.logger[moduleinstance].info(JSON.stringify(source));
		}

		if (self.outputarray[feedidx].length > 0) {

			this.sendNotificationToMasterModule("UPDATED_STUFF_" + moduleinstance, payloadforprovider);

		}

		// as we have sent it and the important date is stored we can clear the outputarray

		self.outputarray[feedidx] = [];

		this.queue.processended();

	},

	//now to the core of the system, where there are most different to the feedprovider modules
	//we enter this for each of the wordfeeds we want to create to send back for later processing

	processfeed: function (feed, moduleinstance, providerid, feedidx, words) {

		//we process a feed at a time here

		var sourcetitle = feed.sourcetitle;

		// the output array will be used to store the new entries for each word count

		var self = this;

		//we still process the maxfeeddates but don't actually use them for anything at the moment

		this.maxfeeddate = new Date(0);
			
		if (new Date(0) < this.maxfeeddate) {
			providerstorage[moduleinstance].trackingfeeddates[feedidx]['latestfeedpublisheddate'] = this.maxfeeddate;
		}

		if (feed.feedconfig.cleanhtml){ var wordarray = this.cleanString(words).split(" "); } else { var wordarray = words.split(" "); };

		var wordlist = {};

		for (var idx = 0; idx < wordarray.length; idx++) {

			var thisword = wordarray[idx].toLowerCase();

			if (stopwords.indexOf(thisword) == -1 && thisword.length>2 && isNaN(parseInt(thisword))) {

				if (wordlist[thisword] == null) {//need something to ignore useless words here
					var tempitem = new structures.NDTFItem()
					tempitem.object = feed.feedconfig.object;
					tempitem.subject = thisword;
					tempitem.value = 0;
					if (feed.feedconfig.useruntime) { tempitem.timestamp = feed.feedconfig.adjustedruntime; } //only option supported
					self.maxfeeddate = new Date(Math.max(self.maxfeeddate, feed.feedconfig.adjustedruntime));
					self.outputarray[feedidx].push(tempitem);
					wordlist[thisword] = 0;
				}

				wordlist[thisword] = wordlist[thisword] + 1;
			}

		}  //end of process loop - input array

		//now finish building the outputarray

		for (var widx = 0; widx < self.outputarray[feedidx].length; widx++) {

			self.outputarray[feedidx][widx].value = wordlist[self.outputarray[feedidx][widx].subject];

        }

		if (feed.feedconfig.filename == null) {
			console.info(self.outputarray[feedidx].length);
		}
		else {

			// write out to a file

			JSONutils.putJSON("./" + feed.feedconfig.filename, self.outputarray[feedidx]);

			console.info(self.outputarray[feedidx].length);

		}

		var rsssource = new RSS.RSSsource();
		rsssource.sourceiconclass = '';
		rsssource.sourcetitle = feed.sourcetitle;
		rsssource.title = feed.sourcetitle;

		if (new Date(0) < self.maxfeeddate) {
			providerstorage[moduleinstance].trackingfeeddates[feedidx]['latestfeedpublisheddate'] = self.maxfeeddate;
		}

		self.send(moduleinstance, providerid, rsssource, feedidx);
		self.done();

	},

});