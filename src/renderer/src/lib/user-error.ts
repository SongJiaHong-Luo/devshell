function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatConnectionError(error: unknown): string {
  const message = messageOf(error)
  if (/authentication|all configured authentication methods failed|permission denied/i.test(message)) {
    return '认证失败：请检查用户名、密码或私钥是否正确。'
  }
  if (/timed out|etimedout/i.test(message)) {
    return '连接超时：请确认主机地址、端口、防火墙和网络连接。'
  }
  if (/econnrefused/i.test(message)) {
    return '连接被拒绝：目标端口可能未开启 SSH 服务，或被防火墙拦截。'
  }
  if (/enotfound|eai_again/i.test(message)) {
    return '无法解析主机地址：请检查域名或 IP 地址。'
  }
  if (/host key|fingerprint|host verification/i.test(message)) {
    return '主机身份验证失败：请核对服务器指纹，确认是否发生了服务器密钥变更。'
  }
  return `连接失败：${message}`
}

export function formatFileTransferError(error: unknown): string {
  const message = messageOf(error)
  if (/permission denied/i.test(message)) return '权限不足：请确认当前账号具有该目录或文件的访问权限。'
  if (/no such file|not found/i.test(message)) return '文件或目录不存在：请刷新目录后重试。'
  if (/transfer cancelled/i.test(message)) return '传输已取消。'
  if (/connection|session/i.test(message)) return '连接已断开：请重新连接服务器后再试。'
  return `文件操作失败：${message}`
}
