"""PC에서 캘린더 화면을 띄워 보는 서버. (일정 공유는 5단계부터 Firebase가 한다.)

화면 파일(index.html 등)만 보내 준다. 3~4단계에서 쓰던 data.json이 있으면
이 PC(localhost)에서 열었을 때만 읽기 전용으로 보여 주어, 앱이 Firebase로 한 번 옮겨 갈 수 있게 한다.
Python 기본 기능만 쓰므로 따로 설치할 것은 없다.

    python server.py            # 0.0.0.0:8000
    python server.py 9000       # 다른 포트
"""

import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT, 'data.json')
STATIC_FILES = {'/': 'index.html'}
STATIC_FILES.update({'/' + name: name for name in [
    'index.html', 'app.js', 'style.css', 'sw.js', 'manifest.webmanifest', 'firebase-config.js',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
]})
LOCAL_CLIENTS = {'127.0.0.1', '::1'}


class Handler(SimpleHTTPRequestHandler):
    # Windows는 PC 설정에 따라 .js를 text/plain으로 보내기도 해서 서비스 워커가 거부된다. 직접 정해 둔다.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.webmanifest': 'application/manifest+json',
        '.png': 'image/png',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 휴대폰 브라우저가 예전 화면 파일을 붙잡고 있지 않게 한다.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def pick_static(self):
        # 화면 파일만 내보낸다. data.json이나 server.py, .git은 보이지 않게.
        name = STATIC_FILES.get(urlparse(self.path).path)
        if name:
            self.path = '/' + name
        return name

    def send_old_data(self):
        # 예전 일정은 이 PC에서 연 화면에만 보여 준다. 같은 Wi-Fi의 다른 사람은 볼 수 없다.
        if self.client_address[0] not in LOCAL_CLIENTS or not os.path.exists(DATA_FILE):
            return self.send_error(404)
        with open(DATA_FILE, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == '/api/data':
            return self.send_old_data()
        if not self.pick_static():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if not self.pick_static():
            return self.send_error(404)
        super().do_HEAD()


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
    print('공유 캘린더 화면 서버가 켜졌어요.')
    print(f'  이 PC:      http://localhost:{port}')
    print(f'  같은 Wi-Fi: http://{lan_ip()}:{port}')
    print('끄려면 Ctrl+C를 누르세요.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
