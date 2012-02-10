var http = require('http')
  , fs = require('fs')
  , jsom = require('jsdom')
  , mustache = require('mustache');
  http.createServer(function (req, res) {
  var thisVal = '<div style="border:1px dashed #ff0"></div>'
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('code generator - generating static html templates \n');

  var lightboxTemplate = fs.readFileSync('lightbox-template.html');
  console.log(lightboxTemplate);
fs.writeFile("output/lightbox-markup.html", thisVal, function(err) {
    if(err) {
        console.log(err);
    } else {
        console.log("The file was saved!");
    }
    console.log('end');
});
}).listen(1337, "127.0.0.1");
console.log('Server running at http://127.0.0.1:1337/');

