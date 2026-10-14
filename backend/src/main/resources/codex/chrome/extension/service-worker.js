const HOST = 'com.xuya.codex.chrome'
let port = null
let timer = null
let error = ''
let executing = Promise.resolve()

function send(message) { if (port) port.postMessage({ ...message, extensionId: chrome.runtime.id }) }
async function publishState() {
  const tabs = await chrome.tabs.query({})
  send({ type: 'state', result: { tabs: tabs.map(tab => ({ id: tab.id, title: tab.title || '', url: tab.url || '', active: !!tab.active })) } })
  send({ type: 'poll' })
}
function disconnect() {
  if (timer) clearInterval(timer)
  timer = null
  const old = port; port = null
  if (old) old.disconnect()
}
function connect() {
  disconnect(); error = ''
  try {
    port = chrome.runtime.connectNative(HOST)
    port.onMessage.addListener(message => {
      if (message.error) { error = message.error; return }
      for (const command of message.commands || []) executing = executing.then(() => execute(command)).catch(() => {})
    })
    port.onDisconnect.addListener(() => { error = chrome.runtime.lastError?.message || 'Native Host 已断开'; port = null; if (timer) clearInterval(timer); timer = null })
    timer = setInterval(() => publishState().catch(e => { error = String(e.message) }), 2000)
    publishState().catch(e => { error = String(e.message) })
  } catch (e) { error = String(e.message) }
}
async function target(command) {
  let tab
  if (command.tabId != null) tab = await chrome.tabs.get(command.tabId)
  else tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
  if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('请先选择 HTTP/HTTPS 页面，Chrome 内部页不可控制')
  return tab
}
async function execute(command) {
  let result
  try {
    if (command.action === 'listTabs') {
      const tabs = await chrome.tabs.query({}); result = { ok: true, tabs: tabs.map(tab => ({ id: tab.id, title: tab.title, url: tab.url, active: !!tab.active })) }
    } else {
      const tab = await target(command)
      if (command.action === 'selectTab') {
        await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); result = { ok: true, tabId: tab.id }
      } else if (command.action === 'navigate') {
        if (!/^https?:\/\//.test(command.url || '')) throw new Error('仅允许 HTTP/HTTPS 导航')
        await chrome.tabs.update(tab.id, { url: command.url, active: true })
        await new Promise((resolve, reject) => {
          const deadline = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('页面加载超时')) }, 15000)
          function listener(id, state) { if (id === tab.id && state.status === 'complete') { clearTimeout(deadline); chrome.tabs.onUpdated.removeListener(listener); resolve() } }
          chrome.tabs.onUpdated.addListener(listener)
          chrome.tabs.get(tab.id).then(current => { if (current.status === 'complete' && current.url === command.url) listener(tab.id, { status: 'complete' }) })
        })
        result = { ok: true, tabId: tab.id, url: command.url }
      } else if (command.action === 'screenshot') {
        if (!tab.active) throw new Error('截图前请先选择此标签')
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 55 })
        if (dataUrl.length > 2000000) throw new Error('截图过大，请缩小浏览器窗口')
        result = { ok: true, tabId: tab.id, dataUrl }
      } else {
        const values = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageAction, args: [command.action, command.selector || '', command.text || ''] })
        result = values[0]?.result || { ok: false, error: '页面未返回结果' }
      }
    }
  } catch (e) { result = { ok: false, error: String(e.message || e).slice(0, 1000) } }
  send({ type: 'result', requestId: command.requestId, result })
}
function pageAction(action, selector, text) {
  if (action === 'snapshot') {
    function path(node) {
      if (node.id) return '#' + CSS.escape(node.id)
      const parts = []; let current = node
      while (current && current !== document.body && parts.length < 5) {
        const siblings = [...(current.parentElement?.children || [])].filter(item => item.tagName === current.tagName)
        parts.unshift(current.tagName.toLowerCase() + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : ''))
        current = current.parentElement
      }
      return 'body > ' + parts.join(' > ')
    }
    return { ok: true, title: document.title, url: location.href, text: document.body.innerText.slice(0, 30000),
      elements: [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(node => node.getClientRects().length).slice(0, 80)
        .map(node => ({ selector: path(node), tag: node.tagName.toLowerCase(), text: (node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || '').slice(0, 150), type: node.getAttribute('type') || '' })) }
  }
  const element = document.querySelector(selector)
  if (!element || !element.getClientRects().length) throw new Error('未找到可见目标，请重新获取快照')
  if (action === 'click') { element.click(); return { ok: true, clicked: selector } }
  if (action === 'fill') {
    if (element.type === 'password') throw new Error('密码字段由用户手动填写')
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('目标不是文本输入框')
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, filled: selector }
  }
  throw new Error('不支持此页面操作')
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return
  if (message.type === 'bridge-connect') { chrome.storage.local.set({ bridgeEnabled: true }); connect() }
  if (message.type === 'bridge-disconnect') { chrome.storage.local.set({ bridgeEnabled: false }); disconnect() }
  reply({ connected: !!port, error })
})
chrome.runtime.onStartup.addListener(async () => { if ((await chrome.storage.local.get('bridgeEnabled')).bridgeEnabled) connect() })
chrome.storage.local.get('bridgeEnabled').then(value => { if (value.bridgeEnabled) connect() })
