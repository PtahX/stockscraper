/**
 * This software reads the stock price list and then based on that returns the stocks in the
 * following order:
 * 1. What shares are on the yearly lowest
 * 2. Their 3 month gain/loss percentage
 */

var fs = require('fs');
var babyParse = require('babyparse');
var request = require('request');
var cheerio = require('cheerio');
var config = require('./config');
var async = require('async');
var q = require('q');

//Reading the csv
fs.readFile('./1486733986434-output.csv', 'utf8', function(err, file) {
    var parsed = babyParse.parse(file, { header: true }).data;
    var results = [];
    async.each(parsed, function(item, cb) {
       request({
           url: config.moneyControlSuggest+item.symbol,
           method: "GET"
       }, function(err, response, body) {
            if(err){ console.log(err); return cb(); }
            
            var data = eval(body);

            var temp = data[0].link_src.split("/");
            var symbol = temp[temp.length - 1];
            loadAdvancedChart(symbol).then(function(result) {
                result.name = item.name;
                result.symbol = item.symbol;
                
                results.push(result);
                
                return cb();
            }, function() {
                return cb();
            });
       });
    }, function() {
        console.log(results);
        var csv = babyParse.unparse(results);
        fs.writeFileSync(new Date().getTime()+"-techincal.csv", csv);
    });
});

function loadAdvancedChart(symbol) {
    var defer = q.defer();
    var url = "http://www.moneycontrol.com/stock-charts/shriramcityunionfinance/charts/"+symbol;
    console.log(url);
    request({
        url: url,
        method: "GET"
    }, function(err, response, body) {
        if(err) { console.log(err); return defer.reject(err); }
        
    console.log(url);
        var $ = cheerio.load(body);
        
        var currentStockPrice = parseFloat($("#Bse_Prc_tick > strong").text());
        var movingAveragePrice = parseFloat($("table.table5 tr:nth-child(5) td:nth-child(3)").text());
        var changePercentage = ((currentStockPrice - movingAveragePrice)/movingAveragePrice)*100;
        
        return defer.resolve({
            currentStockPrice: currentStockPrice,
            movingAveragePrice: movingAveragePrice,
            changePercentage: changePercentage
        });
    });
    
    return defer.promise;
}

function suggest(data) {
	return data;
}