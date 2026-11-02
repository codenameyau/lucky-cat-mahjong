"""Local dev server for the site: python3 scripts/serve.py [port]

Like `python3 -m http.server`, but every response says not to cache it, so
a browser never runs a new page with old scripts (or the reverse) after a
change.
"""

import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
