var http = require('http')
    , fs = require('fs')
    , jsdom = require('jsdom')
    , xml2js = require('xml2js')
    , $ = require('jquery')
    , mustache = require('mustache');


http.createServer(
    function (req, res) {
        var thisVal = '<div style="border:1px dashed #ff0"></div>'
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('code generator - generating static html templates \n');

        if (!String.prototype.supplant) {
            String.prototype.supplant = function (o) {
                return this.replace(/{([^{}]*)}/g,
                    function (a, b) {
                        var r = o[b];
                        return typeof r === 'string' || typeof r === 'number' ? r : a;
                    }
                );
            };
        }

        var parser = new xml2js.Parser()
        fs.readFile(__dirname + '/profiles.xml', function(err, data) {
            parser.parseString(data, function(err, result) {
                var jsonData = JSON.stringify(result)

                parseSupplant(jsonData)
            })
        })

        function parseSupplant(jsonData) {

            var toJSON = JSON.parse(jsonData)

            $(toJSON.profile).each(function() {
                console.log(this.id)
                console.log(this.name)
                var userId = this.id,
                    userName = this.name

// todo: fill in actual template markup
                var template = '<div id="overlay">' +
                    '<div id="our-leaders-overlay">' +
                    '<div id="left">{firstname}' +
                    '<img src=/images/global/' + this.smallImg + '>' +
                    '<ul class="info-list">' + 
                    '<li><h4>NEWS &amp; COMMENTARY</h4></li>' +
                    '</ul>' + 
                    '</div>' +
                    '</div>' +
                    '</div>'

                var profileDetails = template.supplant(this)
                
// todo: generate name with url
                for (var i=0;i<toJSON.profile.length;i++){
                    fs.writeFile("output/" + this.lastname + ".html", profileDetails, function(err) {
                        if (err) {
                            console.log('error')
                            console.log(err);
                        } else {
                            console.log("The file was saved!");
                        }
                        console.log('end');
                    });
                }




            })
        }
    }).listen(1337, "127.0.0.1");
console.log('Server running at http://127.0.0.1:1337/');

