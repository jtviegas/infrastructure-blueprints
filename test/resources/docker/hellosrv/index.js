const util = require("util")

exports.handler = async (event) => {
  console.log("[handler|in]", util.inspect(event))
  let msg = "hola chico, hellosrv here";
  if(event.httpMethod === 'POST'){
    const body = JSON.parse(event.body);
    msg = `${msg} is sending back: ${body.msg}`
  }
  const response = {
      statusCode: 200,
      body: JSON.stringify({msg: msg}),
  };
  return response;
};
