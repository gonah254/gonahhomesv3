#!/usr/bin/env python3
import http.server
import socketserver

PORT = 5000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ReuseAddrTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReuseAddrTCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
    print(f"Server running at http://0.0.0.0:{PORT}")
    httpd.serve_forever()
