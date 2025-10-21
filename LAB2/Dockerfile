FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy source code
COPY src/ ./src/
COPY content/ ./content/

# Create downloads directory
RUN mkdir -p downloads

# Expose port
EXPOSE 8080

# Default command - serve the content directory
CMD ["python3", "src/server.py", "content"]
