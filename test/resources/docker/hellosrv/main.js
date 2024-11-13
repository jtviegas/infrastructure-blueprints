const http = require('http');
const port = 80;
const server = http.createServer();

server.on('request', (request, response) => {
  response.setHeader('content-type', "text/plain");
  response.write("hola chico, hellosrv here");
  response.end();
}).listen(port, () => {
    console.log(`hellosrv running on http://localhost:${port}`)
});