import config from "../config.json"
import { pushAlert, AlertType } from '../components/alert';

export const callBackend = async () => {
  console.log("[callBackend|in]")
  console.log('[callBackend] config.backendUrl: %O', config.backendUrl);
  let response = await fetch(config.backendUrl, {method: 'GET', headers: {'Accept': 'text/plain;charset=UTF-8', 'Access-Control-Allow-Origin': '*'}, mode: "no-cors" });
  console.log('[callBackend] response: %O', response);
  let body = await response.text();
  console.log('[callBackend] body: %o', body);
  const result = body
  console.log('[callBackend|out] => %o', result);
  return result;
}

export const doIt = async () => {
  const msg = await callBackend()
  pushAlert(msg, AlertType.INFO)
}


