"""3단계: 같은 Wi-Fi의 기기끼리 일정을 함께 보는 공유 서버.

화면 파일(index.html 등)을 보내 주고, 일정·카테고리는 data.json에 저장한다.
Python 기본 기능만 쓰므로 따로 설치할 것은 없다.

    python server.py            # 0.0.0.0:8000
    python server.py 9000       # 다른 포트
"""

import json
import os
import re
import secrets
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT, 'data.json')
STATIC_FILES = {'/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css'}

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_RE = re.compile(r'^(\d{2}:\d{2})?$')
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
ID_RE = re.compile(r'^[A-Za-z0-9]{1,32}$')

lock = threading.Lock()


def load_data():
    try:
        with open(DATA_FILE, encoding='utf-8') as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    data.setdefault('version', 0)
    data.setdefault('events', {})
    data.setdefault('categories', [])
    return data


def save_data(data):
    # 임시 파일에 쓴 뒤 바꿔치기해서, 저장 도중 꺼져도 파일이 깨지지 않게 한다.
    data['version'] += 1
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DATA_FILE)


class BadRequest(Exception):
    pass


def text(value, limit, required=False):
    if not isinstance(value, str):
        value = ''
    value = value.strip()[:limit]
    if required and not value:
        raise BadRequest('내용이 비어 있어요.')
    return value


def clean_event(raw):
    if not isinstance(raw, dict):
        raise BadRequest('일정 형식이 잘못됐어요.')
    start = raw.get('start') or ''
    end = raw.get('end') or ''
    if not TIME_RE.match(start) or not TIME_RE.match(end):
        raise BadRequest('시간 형식이 잘못됐어요.')
    if not start:
        end = ''
    if start and end and end < start:
        raise BadRequest('끝 시간은 시작 시간보다 늦어야 해요.')
    event_id = raw.get('id')
    return {
        'id': event_id if isinstance(event_id, str) and ID_RE.match(event_id) else secrets.token_hex(6),
        'title': text(raw.get('title'), 60, required=True),
        'categoryId': text(raw.get('categoryId'), 32),
        'start': start,
        'end': end,
        'memo': text(raw.get('memo'), 500),
    }


def clean_category(raw):
    if not isinstance(raw, dict):
        raise BadRequest('카테고리 형식이 잘못됐어요.')
    color = raw.get('color')
    if not isinstance(color, str) or not COLOR_RE.match(color):
        raise BadRequest('색 형식이 잘못됐어요.')
    cat_id = raw.get('id')
    return {
        'id': cat_id if isinstance(cat_id, str) and ID_RE.match(cat_id) else secrets.token_hex(6),
        'name': text(raw.get('name'), 12, required=True),
        'color': color,
    }


def sort_day(events):
    # 하루 종일 일정이 먼저, 그다음 시작 시간 순.
    events.sort(key=lambda ev: ev['start'])


def add_event(data, body):
    date = body.get('date')
    if not isinstance(date, str) or not DATE_RE.match(date):
        raise BadRequest('날짜 형식이 잘못됐어요.')
    day = data['events'].setdefault(date, [])
    day.append(clean_event(body.get('event')))
    sort_day(day)


def delete_event(data, date, event_id):
    day = [ev for ev in data['events'].get(date, []) if ev['id'] != event_id]
    if day:
        data['events'][date] = day
    else:
        data['events'].pop(date, None)


def add_category(data, body):
    cat = clean_category(body)
    cat['id'] = secrets.token_hex(6)
    if any(c['name'] == cat['name'] for c in data['categories']):
        raise BadRequest('이미 있는 카테고리예요.')
    data['categories'].append(cat)
    return cat


def delete_category(data, cat_id):
    data['categories'] = [c for c in data['categories'] if c['id'] != cat_id]
    # 카테고리를 지워도 일정은 남기고 '카테고리 없음'으로 바꾼다.
    for day in data['events'].values():
        for ev in day:
            if ev['categoryId'] == cat_id:
                ev['categoryId'] = ''


def import_local(data, body):
    """브라우저에만 있던 예전 일정·카테고리를 서버로 합친다. 같은 id는 건너뛰어 여러 번 해도 안전하다."""
    cat_ids = {c['id'] for c in data['categories']}
    cat_names = {c['name'] for c in data['categories']}
    for raw in body.get('categories') or []:
        try:
            cat = clean_category(raw)
        except BadRequest:
            continue
        if cat['id'] not in cat_ids and cat['name'] not in cat_names:
            data['categories'].append(cat)
            cat_ids.add(cat['id'])
            cat_names.add(cat['name'])

    events = body.get('events') or {}
    if not isinstance(events, dict):
        return
    for date, day in events.items():
        if not DATE_RE.match(str(date)) or not isinstance(day, list):
            continue
        target = data['events'].setdefault(date, [])
        ids = {ev['id'] for ev in target}
        for raw in day:
            try:
                ev = clean_event(raw)
            except BadRequest:
                continue
            if ev['id'] not in ids:
                target.append(ev)
                ids.add(ev['id'])
        sort_day(target)
        if not target:
            del data['events'][date]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 휴대폰 브라우저가 예전 화면 파일을 붙잡고 있지 않게 한다.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > 1_000_000:
            raise BadRequest('보낸 내용이 너무 커요.')
        try:
            body = json.loads(self.rfile.read(length) or b'{}')
        except ValueError:  # JSON이 아니거나 UTF-8이 아닐 때
            raise BadRequest('JSON 형식이 잘못됐어요.')
        if not isinstance(body, dict):
            raise BadRequest('JSON 형식이 잘못됐어요.')
        return body

    def log_message(self, format, *args):
        # 몇 초마다 오는 새로고침 요청은 화면에 찍지 않는다.
        if not self.path.startswith('/api/data'):
            super().log_message(format, *args)

    def pick_static(self):
        # 화면 파일만 내보낸다. data.json이나 server.py, .git은 보이지 않게.
        name = STATIC_FILES.get(urlparse(self.path).path)
        if name:
            self.path = '/' + name
        return name

    def do_GET(self):
        if urlparse(self.path).path == '/api/data':
            with lock:
                return self.send_json(200, load_data())
        if not self.pick_static():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if not self.pick_static():
            return self.send_error(404)
        super().do_HEAD()

    def do_POST(self):
        self.change('POST')

    def do_DELETE(self):
        self.change('DELETE')

    def change(self, method):
        parts = urlparse(self.path).path.strip('/').split('/')
        try:
            with lock:
                data = load_data()
                result = {}
                if method == 'POST' and parts == ['api', 'events']:
                    add_event(data, self.read_json())
                elif method == 'DELETE' and len(parts) == 4 and parts[:2] == ['api', 'events']:
                    delete_event(data, parts[2], parts[3])
                elif method == 'POST' and parts == ['api', 'categories']:
                    result['created'] = add_category(data, self.read_json())
                elif method == 'DELETE' and len(parts) == 3 and parts[:2] == ['api', 'categories']:
                    delete_category(data, parts[2])
                elif method == 'POST' and parts == ['api', 'import']:
                    import_local(data, self.read_json())
                else:
                    return self.send_error(404)
                save_data(data)
                result.update(data)
            self.send_json(200, result)
        except BadRequest as e:
            self.send_json(400, {'error': str(e)})
        except Exception as e:
            self.log_error('처리 중 오류: %r', e)
            self.send_json(500, {'error': '서버에서 오류가 났어요.'})


def lan_ip():
    # 실제로 패킷을 보내지는 않고, 바깥으로 나갈 때 쓰는 내 주소만 알아낸다.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
        except OSError:
            return '127.0.0.1'


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'공유 캘린더 서버가 켜졌어요.')
    print(f'  이 PC:      http://localhost:{port}')
    print(f'  같은 Wi-Fi: http://{lan_ip()}:{port}')
    print('끄려면 Ctrl+C를 누르세요.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
