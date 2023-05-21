FROM node:alpine

# Install necessary dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    chromium \
    udev \
    ttf-freefont \
    nss

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser

# Set the working directory
WORKDIR /app
# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install global dependencies
RUN npm install -g nodemon@latest

# Install dependencies
RUN npm install

# Copy application files
COPY ./ ./

# Expose the desired port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
