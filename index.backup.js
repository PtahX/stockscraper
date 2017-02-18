var request = require('request');
var cheerio = require('cheerio');
var babyParse = require('babyparse');
var fs = require('fs');
var async = require('async');
var q = require('q');

var config = require('./config');

/**
 *	Filtering Criteria:
 *	Current Ratio: 2 or more than 2
 *	EPS multipler should be 25 or less
 *	Book value multiplier should be less tha 22
 *	Should show proifit in the past 10 years
 *	Should give divident in the last 10 years
 *	
 */

/**
*Criteria not LOOKING FOR BUT IMPORTANT.
    1. Adequate size of the enterprise.
    2. 2 to 1 current ratio. Long term Debt should not exceed NET Current assets.
    3. Earnings stability (Some earnings in the past ten years).
    4. Earnings Growth: A mininmum increase of 1/3 in per share earnings in the past wo years using three year averages at the begining and the end.
    5. Uninteruppted payments for the past 20 years.
    6. Moderate price to earnings ratio. Should not be more than 15 times.
    7. Price to assests rations Not more than 22.5

    Also check
    NEWS
    Trading Volume
    3 month price.
*/

var EPSMULTIPLIER = 25;
var  BOOKVALUEMULTIPLIER = 22.5;

var companies = [];

/**
 * - code and programming the stuff is nice way to interact with
 */

function loadRatios($) {
	var defer = q.defer();
	var ratioURL = $("a:contains('Ratios')").attr('href');

	//Loading ratio
	request(config.moneyControlHome+ratioURL, function(err, response, body) {
		console.log("Error Occured loading ratios", err);
		
		var $ = cheerio.load(body);
		var currentRatio =  parseFloat($("td:contains('Current Ratio')").next().text());
		if(currentRatio > 2) {
			return defer.resolve({
				currentRatio: currentRatio
			});
		} else {
			return defer.reject();
		}
	});

	return defer.promise;
}

function loadProfitAndLoss($) {
	var defer = q.defer();
	var profitAndLoss = $("a:contains('Profit & Loss')").attr('href');
	console.log("Loading profit and loss");

	//Flitering the url to load the old format
	var url = config.moneyControlHome+profitAndLoss;
	url = url.replace("VI/","/");

	//Loading ratio
	request(url, function(err, response, body) {
		console.log("Error Occured loading profit and loss", err);

		var $ = cheerio.load(body);

		var earningPerShare =  parseFloat($("td:contains('Earning Per Share (Rs)')").next().text());
		var bookValue =  parseFloat($("td:contains('Book Value (Rs)')").next().text());
		var currentStockPrice = parseFloat($("#Nse_Prc_tick strong").text());
		
		console.log(earningPerShare, bookValue, currentStockPrice);
		
		if(earningPerShare*EPSMULTIPLIER >= currentStockPrice) {
			console.log("EPS multiplyer OK");

			if(bookValue*BOOKVALUEMULTIPLIER >= currentStockPrice) {
				console.log("Book Value multiplyer OK");

				//Checking if the company has shown profit in past 5 years
				var eps1 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().text());
				var eps2 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().text());
				var eps3 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().next().text());
				var eps4 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().next().next().text());
				var eps5 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().next().next().next().text());

				if(eps1 > 0 && eps2 > 0 && eps3 > 0 && eps4 > 0 && eps5 > 0) {
					console.log("Company is making profit for the past 5 years");

					//Checking if the company has given divident in the past 5 years
					var div1 = parseFloat($("td:contains('Equity Dividend (%)')").next().text());
					var div2 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().text());
					var div3 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().next().text());
					var div4 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().next().next().text());
					var div5 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().next().next().next().text());

					if(div1 > 0 && div2 > 0 && div3 > 0 && div4 > 0 && div5 > 0) {
						console.log("Company is giving divident for the past 5 years");
						

						return defer.resolve({
							eps: eps1,
							divident: div1,
							currentStockPrice: currentStockPrice
						});
					} else {
						return defer.reject();
					}
				} else {
					return defer.reject();
				}
			} else {
				return defer.reject();
			}
		} else {
			return defer.reject();
		}
	});

	return defer.promise;
}

function suggest(data) {
	return data;
}
function loadStock(symbol, name, industry) {
	var defer = q.defer();
	console.log("Loading Stock:", symbol);
	

	//Loading stock
	request({
		url: config.moneyControlSuggest+symbol,
		method: "GET"
	}, function (err, response, body) {
		if(err) console.log("Error Occured loading stock", err);
		
		var data = eval(body);
		console.log(data[0].link_src);

		//Loading the page
		request({
			url: data[0].link_src,
			method: 'GET'
		}, function(err, response, body) {
			if(err) {
				return defer.reject();
			}

			try {
				var $ = cheerio.load(body);
			} catch(ex) {
				console.log("Error loading "+url+" skipping...");
				console.log(ex);
				return defer.reject();
			}

			//This is the symbol used by moneycontrol for the stock
			//var internalSymbol = url.split("#")[1];
			//console.log(internalSymbol);

			loadProfitAndLoss($).then(function(data1) {
					console.log("Pushing data 1");
				loadRatios($).then(function(data2) {
					console.log("Pushing data");
					var dividentYeild;
					try {
						dividentYeild = $($(".gL_10:contains('DIV YIELD.(%)')").next()[0]).text();						
					} catch(ex) {
						console.log("Error parsing divident yeild", ex);
						divident = "N/A";
					}

					companies.push({
						name: name,
						industry: industry,
						symbol: symbol,
						url: data[0].link_src,
						EPS: data1.eps,
						Divident: data1.divident,
						CurrentStockPrice: data1.currentStockPrice,
						currentRatio: data2.currentRatio,
						dividentYeild: dividentYeild
					});

					console.log(companies);
					return defer.resolve();
				}, function() {
					return defer.reject();
				});
			}, function() {
				return defer.reject();
			});
		});
	});
	return defer.promise;
}

//Loading the index
request({
	url: config.nifty500CSV,
	method: "GET",
	headers: {
		"Accept": "*/*",
		"Accept-Encoding": "gzip, deflate",
		"Connection": "keep-alive",
		"Host": "www.nseindia.com",
		"User-Agent": "HTTPie/0.9.2"
	}
}, function(err, response, body) {
	var parsed = babyParse.parse(body, {
		header: true
	});

	// var data = [{ 'Company Name': 'ABB India Ltd.',
	// 	  'Industry': 'INDUSTRIAL MANUFACTURING',
	// 	  'Symbol': 'AIA',
	// 	  'Series': 'EQ',
	// 	  'ISIN Code': 'INE117A01022' }];

	async.each(parsed.data, function(item, cb) {
		if(!item['Symbol']) {
			return cb();
		}

		loadStock(item["Symbol"], item['Company Name'], item['Industry']).then(function() {
			cb();
		}, function() {
			cb();
		})
	}, function() {
		console.log(companies);
		var csv = babyParse.unparse(companies);
		var date = new Date();
		fs.writeFileSync(date.getTime()+"-output.csv", csv);
	});
})
