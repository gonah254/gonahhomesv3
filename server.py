#!/usr/bin/env python3
import http.server
import os
import socketserver
from urllib.parse import urlsplit

PORT = int(os.environ.get("PORT", "5000"))
HOME_PAGE = "index.html"
ADMIN_HOST = "admin.gonahhomes.com"
ADMIN_ASSETS = {
    "/dashboard.css": "/backend/dashboard.css",
    "/dashboard.js": "/backend/dashboard.js",
    "/properties-data.js": "/backend/properties-data.js",
    "/booking-workflow.js": "/backend/booking-workflow.js",
    "/property-management.js": "/backend/property-management.js",
}
PUBLIC_ADMIN_PATHS = {
    "/admin.html",
    "/dashboard.html",
    "/backend",
    "/backend/",
    "/backend/index.html",
    "/backend/dashboard.html",
}

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def is_admin_host(self):
        forwarded_host = (self.headers.get("X-Forwarded-Host") or "").split(",", 1)[0].strip()
        hostname = (forwarded_host or self.headers.get("Host") or "").split(":", 1)[0].lower()
        return hostname == ADMIN_HOST

    def do_GET(self):
        path = urlsplit(self.path).path

        if self.is_admin_host():
            # The management subdomain gets the dashboard at its root. Keep
            # the browser URL clean and map the dashboard's relative assets
            # into the backend directory.
            if path in ("", "/"):
                self.path = "/backend/dashboard.html"
            elif path == "/backend/index.html":
                self.path = "/backend/dashboard.html"
            elif path in ADMIN_ASSETS:
                self.path = ADMIN_ASSETS[path]
            elif path == "/favicon.svg":
                self.path = "/favicon.svg"
            else:
                self.path = path
            super().do_GET()
            return

        # Management files must not be reachable from the customer host.
        # Staff use https://admin.gonahhomes.com instead.
        if path in PUBLIC_ADMIN_PATHS or path.startswith("/backend/"):
            self.send_error(404, "Not Found")
            return

        if path == "/":
            self.path = "/" + HOME_PAGE
        super().do_GET()

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



