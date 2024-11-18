exports.handler = async (event) => {
  const response = {
      statusCode: 200,
      body: JSON.stringify({msg: "hola chico, hellosrv here"}),
  };
  return response;
};
