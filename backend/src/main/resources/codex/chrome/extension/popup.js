document.getElementById('extension-id').textContent = chrome.runtime.id
async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'bridge-status' })
  document.getElementById('status').textContent = state.connected ? 'Native Host 已连接，等待工作台命令' : (state.error || '未连接')
}
document.getElementById('connect').onclick = async () => { await chrome.runtime.sendMessage({ type: 'bridge-connect' }); await refresh() }
document.getElementById('disconnect').onclick = async () => { await chrome.runtime.sendMessage({ type: 'bridge-disconnect' }); await refresh() }
refresh()
