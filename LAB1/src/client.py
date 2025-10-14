#!/usr/bin/env python3
"""
HTTP Client for the file server
Downloads files and displays HTML content from the HTTP server.
"""

import socket
import sys
import os
import urllib.parse

class HTTPClient:
    def __init__(self):
        self.socket = None

    def request(self, host, port, path, save_directory):
        """Make HTTP request to server"""
        try:
            # Create socket connection
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((host, port))
            
            # Send HTTP GET request
            request = f"GET {path} HTTP/1.1\r\n"
            request += f"Host: {host}:{port}\r\n"
            request += "Connection: close\r\n"
            request += "\r\n"
            
            self.socket.send(request.encode('utf-8'))
            
            # Receive response
            response_data = b""
            while True:
                data = self.socket.recv(4096)
                if not data:
                    break
                response_data += data
            
            # Parse response
            self.parse_response(response_data, path, save_directory)
            
        except socket.error as e:
            print(f"Connection error: {e}")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            if self.socket:
                self.socket.close()

    def parse_response(self, response_data, path, save_directory):
        """Parse HTTP response and handle based on content type"""
        try:
            # Split headers and body
            header_end = response_data.find(b'\r\n\r\n')
            if header_end == -1:
                print("Invalid HTTP response")
                return
            
            headers = response_data[:header_end].decode('utf-8')
            body = response_data[header_end + 4:]
            
            # Parse status line
            header_lines = headers.split('\r\n')
            status_line = header_lines[0]
            status_parts = status_line.split(' ', 2)
            status_code = int(status_parts[1])
            status_text = status_parts[2] if len(status_parts) > 2 else ''
            
            print(f"Status: {status_code} {status_text}")
            
            # Parse headers
            content_type = 'text/plain'
            content_length = len(body)
            
            for line in header_lines[1:]:
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip().lower()
                    value = value.strip()
                    
                    if key == 'content-type':
                        content_type = value
                    elif key == 'content-length':
                        content_length = int(value)
            
            print(f"Content-Type: {content_type}")
            print(f"Content-Length: {content_length}")
            print()
            
            # Handle based on status code
            if status_code != 200:
                print(f"Error: {status_code} {status_text}")
                if body:
                    print(body.decode('utf-8', errors='ignore'))
                return
            
            # Handle based on content type
            if content_type.startswith('text/html'):
                # Display HTML content
                print("HTML Content:")
                print("-" * 50)
                print(body.decode('utf-8', errors='ignore'))
                
            elif content_type in ['image/png', 'application/pdf', 'image/jpeg', 'image/gif']:
                # Save binary files
                filename = self.get_filename_from_path(path, content_type)
                file_path = os.path.join(save_directory, filename)
                
                # Ensure save directory exists
                os.makedirs(save_directory, exist_ok=True)
                
                with open(file_path, 'wb') as f:
                    f.write(body)
                
                print(f"File saved as: {file_path}")
                print(f"File size: {len(body)} bytes")
                
            else:
                # Display other text content
                print("Content:")
                print("-" * 50)
                try:
                    print(body.decode('utf-8'))
                except UnicodeDecodeError:
                    print(body.decode('utf-8', errors='ignore'))
                    
        except Exception as e:
            print(f"Error parsing response: {e}")

    def get_filename_from_path(self, path, content_type):
        """Extract filename from URL path"""
        # Get the last part of the path
        filename = os.path.basename(path)
        
        if not filename or filename == '/':
            # Generate filename based on content type
            if content_type == 'image/png':
                filename = 'image.png'
            elif content_type == 'application/pdf':
                filename = 'document.pdf'
            elif content_type == 'image/jpeg':
                filename = 'image.jpg'
            elif content_type == 'image/gif':
                filename = 'image.gif'
            else:
                filename = 'download'
        
        return filename

def main():
    if len(sys.argv) != 5:
        print("Usage: python client.py <server_host> <server_port> <url_path> <directory>")
        print("Example: python client.py localhost 8080 /index.html ./downloads")
        sys.exit(1)
    
    host = sys.argv[1]
    try:
        port = int(sys.argv[2])
    except ValueError:
        print("Error: Port must be a number")
        sys.exit(1)
    
    path = sys.argv[3]
    save_directory = sys.argv[4]
    
    # Ensure path starts with /
    if not path.startswith('/'):
        path = '/' + path
    
    print(f"Connecting to {host}:{port}")
    print(f"Requesting: {path}")
    print(f"Save directory: {save_directory}")
    print()
    
    client = HTTPClient()
    client.request(host, port, path, save_directory)

if __name__ == "__main__":
    main()