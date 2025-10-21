#!/usr/bin/env python3
"""
Lab 2 - HTTP Client (Baseline from Lab 1)
"""

import socket
import sys
import os

class HTTPClient:
    def __init__(self):
        self.socket = None

    def request(self, host, port, path, save_directory):
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((host, port))
            request = f"GET {path} HTTP/1.1\r\n"
            request += f"Host: {host}:{port}\r\n"
            request += "Connection: close\r\n\r\n"
            self.socket.send(request.encode('utf-8'))
            response_data = b""
            while True:
                data = self.socket.recv(4096)
                if not data:
                    break
                response_data += data
            self.parse_response(response_data, path, save_directory)
        finally:
            if self.socket:
                self.socket.close()

    def parse_response(self, response_data, path, save_directory):
        header_end = response_data.find(b'\r\n\r\n')
        if header_end == -1:
            print("Invalid HTTP response")
            return
        headers = response_data[:header_end].decode('utf-8', errors='ignore')
        body = response_data[header_end + 4:]
        status_line = headers.split('\r\n')[0]
        status_code = int(status_line.split(' ')[1])
        content_type = 'text/plain'
        for line in headers.split('\r\n')[1:]:
            if line.lower().startswith('content-type:'):
                content_type = line.split(':',1)[1].strip()
                break
        if status_code != 200:
            print(headers)
            print(body.decode('utf-8', errors='ignore'))
            return
        if content_type.startswith('text/html'):
            print(body.decode('utf-8', errors='ignore'))
        else:
            filename = os.path.basename(path) or 'download'
            os.makedirs(save_directory, exist_ok=True)
            with open(os.path.join(save_directory, filename), 'wb') as f:
                f.write(body)
            print(f"Saved to {os.path.join(save_directory, filename)}")

def main():
    if len(sys.argv) != 5:
        print("Usage: python client.py <server_host> <server_port> <url_path> <directory>")
        sys.exit(1)
    host = sys.argv[1]
    port = int(sys.argv[2])
    path = sys.argv[3]
    if not path.startswith('/'):
        path = '/' + path
    save_directory = sys.argv[4]
    HTTPClient().request(host, port, path, save_directory)

if __name__ == "__main__":
    main()
