"""叙芽岛原生Python执行适配：协议只传有限输出，不向学习代码提供账户凭据。"""
import builtins
import json
import os
import runpy
import sys
import threading
import traceback
import types

wire = sys.stdout
lock = threading.Lock()

def emit(kind, **values):
    with lock:
        wire.write(json.dumps(dict(type=kind, **values), ensure_ascii=True) + '\n')
        wire.flush()

config = json.loads(sys.stdin.readline())  # 等待Java绑定Job Object后才允许执行用户代码
os.chdir(config['directory'])
sys.path.insert(0, config['directory'])

class Stream:
    encoding = 'utf-8'
    def __init__(self, kind):
        self.kind = kind
    def write(self, text):
        text = str(text)
        for start in range(0, len(text), 2048):
            emit(self.kind, text=text[start:start + 2048])
        return len(text)
    def flush(self):
        pass
    def isatty(self):
        return False

sys.stdout = Stream('output')
sys.stderr = Stream('error')
inputs = iter(config.get('presetInput', []))
input_count = 0
def island_input(prompt=''):
    global input_count
    if prompt:
        sys.stdout.write(prompt)
    input_count += 1
    if input_count > 50:
        raise RuntimeError('本次运行最多输入50次')
    if config.get('inputMode') == 'preset':
        try:
            value = next(inputs)
        except StopIteration:
            raise EOFError('固定测试输入已经用完')
        emit('input-used', value=value)
        return value
    emit('input-needed', inputId=input_count)
    line = sys.stdin.readline()
    if not line:
        raise EOFError('输入已结束')
    response = json.loads(line)
    if response.get('eof'):
        raise EOFError('输入已结束')
    value = response['value']
    emit('input-used', value=value)
    return value
builtins.input = island_input

drawings = 0
events = 0
def draw(kind, **values):
    global drawings
    drawings += 1
    if drawings > 5000:
        raise RuntimeError('画笔动作超过5000条')
    emit('drawing', event=dict(kind=kind, **values))
def stage(kind, **values):
    global events
    events += 1
    if events > 5000:
        raise RuntimeError('舞台动作超过5000条')
    emit('stage', event=dict(kind=kind, **values))
draw_module = types.ModuleType('xuya.draw')
draw_module.circle = lambda x, y, radius, color='#ff8f70': draw('circle', x=x, y=y, radius=radius, color=color)
draw_module.rectangle = lambda x, y, width, height, color='#6c91c8': draw('rectangle', x=x, y=y, width=width, height=height, color=color)
draw_module.text = lambda x, y, text, color='#243b53': draw('text', x=x, y=y, text=str(text), color=color)
stage_module = types.ModuleType('xuya.stage')
stage_module.cup = lambda: stage('cup')
stage_module.pour = lambda amount=1: stage('pour', amount=amount)
stage_module.lid = lambda: stage('lid')
stage_module.pearls = lambda amount=1: stage('pearls', amount=amount)
stage_module.drink = lambda flavour, amount=1: stage('drink', value=str(flavour)[:80], amount=amount)
stage_module.say = lambda value, actor='bubu': stage('say', actor=str(actor), text=str(value)[:200])
stage_module.actor = lambda name, kind='monster': stage('actor', actor=str(name), value=kind)
stage_module.move = lambda actor, x, y: stage('move', actor=str(actor), x=x, y=y)
stage_module.size = lambda actor, value: stage('size', actor=str(actor), value=value)
stage_module.counter = lambda name, value: stage('counter', actor=str(name), value=value)
xuya = types.ModuleType('xuya')
xuya.draw = draw_module
xuya.stage = stage_module
sys.modules.update({'xuya': xuya, 'xuya.draw': draw_module, 'xuya.stage': stage_module})
try:
    runpy.run_path('main.py', run_name='__main__')
    emit('finished', status='success')
except BaseException:
    emit('error', text=traceback.format_exc(limit=12))
    emit('finished', status='error')
