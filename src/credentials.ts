export function stripRuntimeSecrets(env:Record<string,string|undefined>){
  return Object.fromEntries(Object.entries(env).filter(([key])=>!/^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|OPENAI_ADMIN_KEY|TUNNEL_HTTP_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
}
