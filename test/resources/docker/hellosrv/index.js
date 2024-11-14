exports.handler = async (event) => {
  const response = {
      statusCode: 200,
      body: JSON.stringify('hola chico, hellosrv here'),
  };
  return response;
};
