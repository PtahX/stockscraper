var express = require('express');
var app = express();
var contentDisposition = require('content-disposition');
app.listen(process.env.PORT  || 4000);

app.get('/compute', function(req, res) {
        res.writeHead(200, {
             'Content-Type': 'text/plain',
             'Content-Disposition': contentDisposition('report.csv')
        });

        var columns = 
            'Name,'+
            'Industry,'+
            'Symbol,'+
            'URL,'+
            'EPS,'+
            'Dividend,'+
            'Current Stock Price,'+
            'Current Ratio,'+
            'Dividend Yeild,'+
            'Total Current Assets,'+
            'Total Current Liabilities,'+
            'Earnings Growth,'+
            'EPS Growth,'+
            '\n';

            res.write(columns);
            compute(res);
});

/**
 * API
 */

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
    1. Adequate size of the enterprise. (looking)
    2. 2 to 1 current ratio. Long term Debt should not exceed NET Current assets. (looking)
    3. Earnings stability (Some earnings in the past ten years). (looking)
    4. Earnings Growth: A mininmum increase of 1/3 in per share earnings in the past wo years using three year averages at the begining and the end.
    5. Uninteruppted payments for the past 20 years. (looking)
    6. Moderate price to earnings ratio. Should not be more than 15 times. (looking)
    7. Price to assests rations Not more than 22.5

    Also check
    NEWS
    Trading Volume
    3 month price.
*/

var EPSMULTIPLIER = 25;
var BOOKVALUEMULTIPLIER = 22.5;

var companies = [];

/**
 * - code and programming the stuff is nice way to interact with
 */

function loadRatios($) {
	var defer = q.defer();
	var ratioURL = $("a:contains('Ratios')").attr('href');

	//Loading ratio
	request(config.moneyControlHome+ratioURL, function(err, response, body) {
		if(err) {
			console.log("Error Occured loading ratios", err);
			return defer.reject(err);			
		}
		
		var $ = cheerio.load(body);
		var currentRatio =  parseFloat($("td:contains('Current Ratio')").next().text());

		var eps1 = parseFloat($("td:contains('Diluted EPS (Rs.)')").next().text().replace(/,/g, '').replace(/,/g, ''));		
		var eps2 = parseFloat($("td:contains('Diluted EPS (Rs.)')").next().next().text().replace(/,/g, ''));
		var eps3 = parseFloat($("td:contains('Diluted EPS (Rs.)')").next().next().next().text().replace(/,/g, ''));
		var eps4 = parseFloat($("td:contains('Diluted EPS (Rs.)')").next().next().next().next().text().replace(/,/g, ''));
		var eps5 = parseFloat($("td:contains('Diluted EPS (Rs.)')").next().next().next().next().next().text().replace(/,/g, ''));
		
		var epsGrowth = ((eps1 - eps5)/eps5)*100;

		if(currentRatio > 2) {
			return defer.resolve({
				currentRatio: currentRatio,
				epsGrowth: epsGrowth
			});
		} else {
			return defer.reject();
		}
	});

	return defer.promise;
}

function loadDebt($) {
	var defer = q.defer();
	var balanceSheetURL = $("a:contains('Balance Sheet')").attr('href');
	request(config.moneyControlHome+balanceSheetURL, function(err, response, body) {
		if(err) {
			return defer.reject(err);
		}

		var $ = cheerio.load(body);
		
		var totalCurrentLiabilities = parseFloat($("td:contains('Total Current Liabilities')").next().text().replace(/,/g, '')); 
		var totalCurrentAssets = parseFloat($("td:contains('Total Current Assets')").next().text().replace(/,/g, '')); 

		if(totalCurrentAssets > totalCurrentLiabilities) {
			console.log("Total Current Assets exceed total current Liabilities");

			/**
			 * Calculating Earnings Growth
			 */
			 var equityShareCapital1 = parseFloat($("td:contains('Equity Share Capital')").next().text().replace(/,/g, ''));
			 var equityShareCapital2 = parseFloat($("td:contains('Equity Share Capital')").next().next().text().replace(/,/g, '')); 
			 var equityShareCapital3 = parseFloat($("td:contains('Equity Share Capital')").next().next().next().text().replace(/,/g, '')); 
			 var equityShareCapital4 = parseFloat($("td:contains('Equity Share Capital')").next().next().next().next().text().replace(/,/g, '')); 
			 var equityShareCapital5 = parseFloat($("td:contains('Equity Share Capital')").next().next().next().next().next().text().replace(/,/g, '')); 
			 
			 if(equityShareCapital1 === equityShareCapital2 === equityShareCapital3 === equityShareCapital4 === equityShareCapital5) {
				defer.resolve({
					equityShareCapitalChanged: false,
					totalCurrentAssets: totalCurrentAssets,
					totalCurrentLiabilities: totalCurrentLiabilities
				});
			 } else {
				defer.resolve({
					equityShareCapitalChanged: true,
					totalCurrentAssets: totalCurrentAssets,
					totalCurrentLiabilities: totalCurrentLiabilities
				});
			 }
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


	request(url, function(err, response, body) {
		if(err) {
			console.log("Error Occured loading profit and loss for "+url, err);
			return defer.reject(err);
		}
		
		var $ = cheerio.load(body);

		var earningPerShare =  parseFloat($("td:contains('Earning Per Share (Rs)')").next().text().replace(/,/g, ''));
		var bookValue =  parseFloat($("td:contains('Book Value (Rs)')").next().text().replace(/,/g, ''));
		var currentStockPrice = parseFloat($("#Nse_Prc_tick strong").text().replace(/,/g, ''));
		
		console.log(earningPerShare, bookValue, currentStockPrice);
		
		if(earningPerShare*EPSMULTIPLIER >= currentStockPrice) {
			console.log("EPS multiplyer OK");

			if(bookValue*BOOKVALUEMULTIPLIER >= currentStockPrice) {
				console.log("Book Value multiplyer OK");

				//Checking if the company has shown profit in past 5 years
				var eps1 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().text().replace(/,/g, ''));
				var eps2 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().text().replace(/,/g, ''));
				var eps3 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().next().text().replace(/,/g, ''));
				var eps4 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().next().next().text().replace(/,/g, ''));
				var eps5 = parseFloat($("td:contains('Earning Per Share (Rs)')").next().next().next().next().next().text().replace(/,/g, ''));

				if(eps1 > 0 && eps2 > 0 && eps3 > 0 && eps4 > 0 && eps5 > 0) {
					console.log("Company is making profit for the past 5 years");

					//Checking if the company has given divident in the past 5 years
					var div1 = parseFloat($("td:contains('Equity Dividend (%)')").next().text().replace(/,/g, ''));
					var div2 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().text().replace(/,/g, ''));
					var div3 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().next().text().replace(/,/g, ''));
					var div4 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().next().next().text().replace(/,/g, ''));
					var div5 = parseFloat($("td:contains('Equity Dividend (%)')").next().next().next().next().next().text().replace(/,/g, ''));

					if(div1 > 0 && div2 > 0 && div3 > 0 && div4 > 0 && div5 > 0) {
						console.log("Company is giving divident for the past 5 years");
						
					var earnings1 = parseFloat($("td:contains('Reported Net Profit')").next().text().replace(/,/g, ''));
					var earnings2 = parseFloat($("td:contains('Reported Net Profit')").next().next().text().replace(/,/g, '')); 
					var earnings3 = parseFloat($("td:contains('Reported Net Profit')").next().next().next().text().replace(/,/g, '')); 
					var earnings4 = parseFloat($("td:contains('Reported Net Profit')").next().next().next().next().text().replace(/,/g, '')); 
					var earnings5 = parseFloat($("td:contains('Reported Net Profit')").next().next().next().next().next().text().replace(/,/g, '')); 
					
					var earningsGrowth = ((earnings1 - earnings5)/earnings5)*100;

						return defer.resolve({
							eps: eps1,
							divident: div1,
							currentStockPrice: currentStockPrice,
							earningsGrowth: earningsGrowth
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
		if(err) {
			if(err) console.log("Error Occured loading stock", err);
			defer.reject(err);
		}
		
		var data = eval(body);
		var link = null;
		if(data[0].link_src.indexOf("javascript") > -1) {
			link = data[1].link_src;
		} else {
			link = data[0].link_src;
		}
		console.log(link);

		//Loading the page
		request({
			url: link,
			method: 'GET'
		}, function(err, response, body) {
			if(err) {
				return defer.reject(err);
			}

			try {
				var $ = cheerio.load(body);
			} catch(ex) {
				console.log("Error loading "+data[0].link_src+" skipping...");
				return defer.reject(ex);
			}

			//This is the symbol used by moneycontrol for the stock
			//var internalSymbol = url.split("#")[1];
			//console.log(internalSymbol);

			async.parallel([
				function(_cb) {
					loadProfitAndLoss($).then(function(data1) {
						return _cb(null, data1);
					}, function(err) {
						_cb(err);
					})
				},
				function(_cb) {
					loadRatios($).then(function(data2) {
						return _cb(null, data2);
					}, function(err) {
						return _cb(err);
					});
				},
				function(_cb) {
					loadDebt($).then(function(data3) {
						return _cb(null, data3);
					}, function(err) {
						return _cb(err);
					});
				}
			], function(err, results) {
				if(err || !results[0] || !results[1] || !results[2]) {
					//delete $;					
					return defer.reject(err);
				}

				var data1 = results[0];
				var data2 = results[1];
				var data3 = results[2];

				var dividentYeild;
				try {
					dividentYeild = $($(".gL_10:contains('DIV YIELD.(%)')").next()[0]).text().replace(/,/g, '');						
				} catch(ex) {
					console.log("Error parsing divident yeild", ex);
					divident = "N/A";
				}
				if(data3.equityShareCapitalChanged) {
					if(data2.epsGrowth > 33) {
						companies.push({
							name: name,
							industry: industry,
							symbol: symbol,
							url: data[0].link_src,
							EPS: data1.eps,
							Divident: data1.divident,
							CurrentStockPrice: data1.currentStockPrice,
							currentRatio: data2.currentRatio,
							dividentYeild: dividentYeild,
							totalCurrentAssets: data3.totalCurrentAssets,
							totalCurrentLiabilities: data3.totalCurrentLiabilities,
							earningsGrowth: data1.earningsGrowth,
							epsGrowth: data2.epsGrowth							
						});	
					} else {
						defer.reject();
					}
				} else {
					if(data1.earningsGrowth > 33) {
						companies.push({
							name: name,
							industry: industry,
							symbol: symbol,
							url: data[0].link_src,
							EPS: data1.eps,
							Divident: data1.divident,
							CurrentStockPrice: data1.currentStockPrice,
							currentRatio: data2.currentRatio,
							dividentYeild: dividentYeild,
							totalCurrentAssets: data3.totalCurrentAssets,
							totalCurrentLiabilities: data3.totalCurrentLiabilities,
							earningsGrowth: data1.earningsGrowth,
							epsGrowth: data2.epsGrowth
						});	
					} else {
						defer.reject();
					}
				}
	
				console.log(companies);	
				//delete $;	

				return defer.resolve();				
			});
		});
	});
	return defer.promise;
}


    var compute = function(res) {
        console.time("process");        
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

            console.log(parsed.data.length);
            async.eachSeries(parsed.data, function(item, cb) {
                if(!item['Symbol']) {
                    return cb();
                }

                loadStock(item["Symbol"], item['Company Name'], item['Industry']).then(function() {
                    var stockData = companies[companies.length-1];
                    var row =   stockData.name + ',' +
                                stockData.industry + ',' +
                                stockData.symbol + ',' +
                                stockData.url + ',' +
                                stockData.EPS + ',' +
                                stockData.Divident + ',' +
                                stockData.CurrentStockPrice + ',' +
                                stockData.currentRatio + ',' +
                                stockData.dividentYeild + ',' +
                                stockData.totalCurrentAssets + ',' +
                                stockData.totalCurrentLiabilities + ',' +
                                stockData.earningsGrowth + ',' +
                                stockData.epsGrowth + '\n'

                    res.write(
                        row
                    )
                    cb();
                }, function(err) {
                    if(err) throw err;
                    cb();
                })
            }, function() {
                res.end();
                console.log(companies);
                var csv = babyParse.unparse(companies);
                var date = new Date();
                fs.writeFileSync(date.getTime()+"-output.csv", csv);
                console.timeEnd("process");
            });
        });
    }
