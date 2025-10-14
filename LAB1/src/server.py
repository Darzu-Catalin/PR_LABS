#!/usr/bin/env python3
"""
Simple HTTP File Server
Serves files from a specified directory with support for HTML, PNG, and PDF files.
Handles directory listings and nested directories.
"""

import socket
import os
import sys
import urllib.parse
import mimetypes
from datetime import datetime

class HTTPServer:
    def __init__(self, host='0.0.0.0', port=8080, directory='.'):
        self.host = host
        self.port = port
        self.directory = os.path.abspath(directory)
        self.socket = None
        
        # Supported MIME types
        self.mime_types = {
            '.html': 'text/html',
            '.htm': 'text/html',
            '.png': 'image/png',
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.txt': 'text/plain'
        }

    def start(self):
        """Start the HTTP server"""
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.socket.bind((self.host, self.port))
            self.socket.listen(5)
            print(f"Server started at http://{self.host}:{self.port}")
            print(f"Serving directory: {self.directory}")
            print("Press Ctrl+C to stop the server")
            
            while True:
                client_socket, client_address = self.socket.accept()
                print(f"Connection from {client_address}")
                self.handle_request(client_socket)
                client_socket.close()
                
        except KeyboardInterrupt:
            print("\nServer stopped")
        finally:
            if self.socket:
                self.socket.close()

    def handle_request(self, client_socket):
        """Handle incoming HTTP request"""
        try:
            # Receive request data
            request_data = client_socket.recv(1024).decode('utf-8')
            if not request_data:
                return

            # Parse the request
            request_lines = request_data.split('\r\n')
            request_line = request_lines[0]
            method, path, version = request_line.split()
            
            print(f"Request: {method} {path}")
            
            # Handle OPTIONS requests for CORS preflight
            if method == 'OPTIONS':
                self.send_response(client_socket, 200, "OK", "text/plain", "")
                return
            
            # Only handle GET requests (and OPTIONS above)
            if method != 'GET':
                self.send_response(client_socket, 405, "Method Not Allowed", "text/plain")
                return
            
            # Decode URL and remove query parameters
            path = urllib.parse.unquote(path.split('?')[0])
            
            # Security check: prevent directory traversal
            if '..' in path:
                self.send_response(client_socket, 403, "Forbidden", "text/plain")
                return
            
            # Convert URL path to file system path
            # Handle both files and directories properly
            if path == '/':
                file_path = self.directory
            else:
                # Remove leading slash and join with directory
                relative_path = path.lstrip('/')
                file_path = os.path.join(self.directory, relative_path)
            
            # Normalize the path to resolve any .. or . components
            file_path = os.path.normpath(file_path)
            
            # Ensure the path is within the served directory (security check)
            if not file_path.startswith(self.directory):
                self.send_response(client_socket, 403, "Forbidden", "text/plain")
                return
            
            # Handle the request based on what the path points to
            if os.path.isfile(file_path):
                self.serve_file(client_socket, file_path)
            elif os.path.isdir(file_path):
                self.serve_directory(client_socket, file_path, path)
            else:
                self.send_404(client_socket)
                
        except Exception as e:
            print(f"Error handling request: {e}")
            self.send_response(client_socket, 500, "Internal Server Error", "text/plain")

    def serve_file(self, client_socket, file_path):
        """Serve a file to the client"""
        try:
            with open(file_path, 'rb') as file:
                content = file.read()
            
            # Get MIME type
            _, ext = os.path.splitext(file_path)
            content_type = self.mime_types.get(ext.lower(), 'application/octet-stream')
            
            # Send response
            self.send_response(client_socket, 200, "OK", content_type, content)
            
        except IOError:
            self.send_404(client_socket)

    def serve_directory(self, client_socket, dir_path, url_path):
        """Serve directory listing"""
        try:
            items = os.listdir(dir_path)
            items.sort()
            
            # Generate HTML directory listing
            html = self.generate_directory_listing(items, dir_path, url_path)
            
            self.send_response(client_socket, 200, "OK", "text/html", html.encode('utf-8'))
            
        except OSError:
            self.send_404(client_socket)

    def generate_directory_listing(self, items, dir_path, url_path):
        """Generate HTML directory listing"""
        # Ensure url_path ends with / for proper URL construction
        if not url_path.endswith('/'):
            url_path = url_path + '/'
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Directory listing for {url_path}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        h1 {{ color: #333; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }}
        th {{ background-color: #f2f2f2; }}
        a {{ text-decoration: none; color: #0066cc; }}
        a:hover {{ text-decoration: underline; }}
        .size {{ text-align: right; }}
        .date {{ white-space: nowrap; }}
    </style>
</head>
<body>
    <h1>Directory listing for {url_path}</h1>
    <hr>
    <table>
        <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Last Modified</th>
        </tr>"""
        
        # Add parent directory link if not root
        if url_path != '/':
            parent_parts = url_path.rstrip('/').split('/')
            if len(parent_parts) > 1:
                parent_path = '/'.join(parent_parts[:-1]) + '/'
            else:
                parent_path = '/'
            html += f"""
        <tr>
            <td><a href="{parent_path}">../</a></td>
            <td class="size">-</td>
            <td class="date">-</td>
        </tr>"""
        
        # Add directory contents
        for item in items:
            item_path = os.path.join(dir_path, item)
            
            if os.path.isdir(item_path):
                name = item + '/'
                size = '-'
                # For directories, add trailing slash
                item_url = url_path + urllib.parse.quote(item) + '/'
            else:
                name = item
                try:
                    size = self.format_size(os.path.getsize(item_path))
                except OSError:
                    size = '-'
                # For files, no trailing slash
                item_url = url_path + urllib.parse.quote(item)
            
            try:
                mtime = os.path.getmtime(item_path)
                date = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
            except OSError:
                date = '-'
            
            html += f"""
        <tr>
            <td><a href="{item_url}">{name}</a></td>
            <td class="size">{size}</td>
            <td class="date">{date}</td>
        </tr>"""
        
        html += """
    </table>
    <hr>
    <p><em>Python HTTP File Server</em></p>
</body>
</html>"""
        
        return html

    def format_size(self, size):
        """Format file size in human readable format"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f}{unit}"
            size /= 1024.0
        return f"{size:.1f}TB"

    def send_response(self, client_socket, status_code, status_text, content_type, content=None):
        """Send HTTP response to client"""
        if content is None:
            content = status_text.encode('utf-8')
        elif isinstance(content, str):
            content = content.encode('utf-8')
        
        response = f"HTTP/1.1 {status_code} {status_text}\r\n"
        response += f"Content-Type: {content_type}\r\n"
        response += f"Content-Length: {len(content)}\r\n"
        response += f"Server: Python HTTP File Server\r\n"
        # Add CORS headers for web client support
        response += f"Access-Control-Allow-Origin: *\r\n"
        response += f"Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n"
        response += f"Access-Control-Allow-Headers: Content-Type\r\n"
        response += "\r\n"
        
        client_socket.send(response.encode('utf-8'))
        client_socket.send(content)

    def send_404(self, client_socket):
        """Send 404 Not Found response"""
        html = """<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
        h1 { color: #cc0000; }
    </style>
</head>
<body>
    <h1>404 - File Not Found</h1>
    <p>The requested file could not be found on this server.</p>
</body>
</html>"""
        self.send_response(client_socket, 404, "Not Found", "text/html", html)

def main():
    if len(sys.argv) != 2:
        print("Usage: python server.py <directory>")
        sys.exit(1)
    
    directory = sys.argv[1]
    
    if not os.path.exists(directory):
        print(f"Error: Directory '{directory}' does not exist")
        sys.exit(1)
    
    if not os.path.isdir(directory):
        print(f"Error: '{directory}' is not a directory")
        sys.exit(1)
    
    server = HTTPServer(directory=directory)
    server.start()

if __name__ == "__main__":
    main()