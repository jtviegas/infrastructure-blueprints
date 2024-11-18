import config from "../config.json"
import { pushAlert, AlertType } from '../components/alert';

export const callBackend = async () => {
  console.log("[callBackend|in]")
  console.log('[callBackend] config.backendUrl: %O', config.backendUrl);
  let response = await fetch(`${config.backendUrl}/api`, {method: 'GET', headers: {'Accept': 'application/json', 'Access-Control-Allow-Origin': '*'}, mode: "no-cors" });
  const result = await response.json();
  console.log('[callBackend|out] => %O', result);
  return result.msg;
}

export const doIt = async () => {
  const msg = await callBackend()
  pushAlert(msg, AlertType.INFO)
}


