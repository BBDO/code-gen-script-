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
var http = require('http')
  , fs = require('fs')
  , jsom = require('jsdom')
  , mustache = require('mustache');
  http.createServer(function (req, res) {
  var thisVal = '<div style="border:1px dashed #ff0"></div>'
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('code generator - generating static html templates \n');

  var lightboxTemplate = fs.readFileSync('lightbox-template.html');
  // console.log(lightboxTemplate);

var data = {first: 'john', last: 'smith', url: '/jsmith'},
    template = '<div id=lightbox-content>' + 
                  '<h1>{first}</h1>' + 
                  '<h2>{last}</h2>' +
               '</div>'

console.log(template.supplant(data))

var thisVal = template.supplant(data)
console.log(thisVal)

for (var i=0;i<3;i++){
  console.log(i)

  fs.writeFile("output/lightbox-markup" + i + ".html", thisVal, function(err) {
      if(err) {
          console.log('error')
          console.log(err);
      } else {
          console.log("The file was saved!");
      }
      console.log('end');
  });
}





}).listen(1337, "127.0.0.1");
console.log('Server running at http://127.0.0.1:1337/');

