# Stage 1: Build the React Application
FROM node:20-alpine as build
ARG VITE_API_URL=/api/v1
ARG VITE_SENTRY_DSN=
ARG VITE_SUPPORT_EMAIL=
ARG VITE_SUPPORT_PHONE=
ARG VITE_SITE_ORIGIN=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
ENV VITE_SUPPORT_PHONE=$VITE_SUPPORT_PHONE
ENV VITE_SITE_ORIGIN=$VITE_SITE_ORIGIN

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled frontend from Stage 1
COPY --from=build /app/dist /usr/share/nginx/html

# Copy our custom configuration file
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Media directory will be mounted at /usr/share/nginx/media

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
