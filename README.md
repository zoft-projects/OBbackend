# onebayshore-backend

NodeJS primary backend for the onebayshore applications. This project extensively be used with typescript for type safety. For storage this will use MongoDB, for caching Redis and AWS S3 for file storages.

## Backend-For-Frontend (BFF) architecture

This service will handle multiple frontends such as Web app and Mobile app. The router endpoint will differentiate the services called.

## Prerequisites

This project uses the following vendors

* MongoDB
* Redis

In order to run the app locally please do install these two dependency in your development system via docker or directly.

#### MongoDB installation
https://www.mongodb.com/docs/manual/installation/

#### Redis installation
https://redis.io/docs/getting-started/installation/

Use the default port for these services in your system 27017 (MongoDB) and 6379 (Redis). Usually no special configuration needs to be done during the setup in order to use the default ports.

## Other requirements

Please use `nvm` to make sure the development is done with the same node version across multiple system since the node dependency chain gets messed up when the node version changes.

https://github.com/nvm-sh/nvm#installing-and-updating

Also enable the autorun `nvm use` which will save time for the developers

https://github.com/nvm-sh/nvm#deeper-shell-integration
